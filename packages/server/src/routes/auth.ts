import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import * as oauth from 'oauth4webapi';

import { db, schema } from '../db/index.js';
import { clearSession, readSession, setSession } from '../middleware/auth.js';
import { encryptSecret } from '../middleware/encryption.js';
const auth = new Hono();
const DEFAULT_ISSUER = 'https://meta.wikimedia.org';
const DEFAULT_AUTHORIZATION_ENDPOINT = 'https://meta.wikimedia.org/w/rest.php/oauth2/authorize';
const DEFAULT_TOKEN_ENDPOINT = 'https://meta.wikimedia.org/w/rest.php/oauth2/access_token';
const DEFAULT_PROFILE_ENDPOINT = 'https://meta.wikimedia.org/w/rest.php/oauth2/resource/profile';

/** Permit only local paths, never controls, backslashes, or another origin. */
export function safeReturnPath(value: string | undefined): string {
  if (
    !value ||
    !value.startsWith('/') ||
    [...value].some(
      (char) =>
        char === String.fromCharCode(92) || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127
    )
  )
    return '/';
  try {
    const base = new URL('https://wikicollab.invalid/');
    const parsed = new URL(value, base);
    if (parsed.origin !== base.origin || !parsed.pathname.startsWith('/')) return '/';
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return '/';
  }
}
function providerConfig() {
  const issuer = process.env.OAUTH_ISSUER || DEFAULT_ISSUER;
  const authorizationEndpoint =
    process.env.OAUTH_AUTHORIZATION_URL || DEFAULT_AUTHORIZATION_ENDPOINT;
  const tokenEndpoint = process.env.OAUTH_TOKEN_URL || DEFAULT_TOKEN_ENDPOINT;
  const profileEndpoint = process.env.OAUTH_PROFILE_URL || DEFAULT_PROFILE_ENDPOINT;
  for (const url of [issuer, authorizationEndpoint, tokenEndpoint, profileEndpoint]) {
    if (new URL(url).protocol !== 'https:') throw new Error('OAuth endpoints require HTTPS');
  }
  return {
    as: {
      issuer,
      authorization_endpoint: authorizationEndpoint,
      token_endpoint: tokenEndpoint,
    } as oauth.AuthorizationServer,
    authorizationEndpoint,
    profileEndpoint,
    scope: process.env.OAUTH_SCOPE || '',
    usernameField: process.env.OAUTH_USERNAME_FIELD || 'username',
    subjectField: process.env.OAUTH_SUBJECT_FIELD || 'sub',
  };
}
function config(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = process.env.OAUTH_CONSUMER_KEY;
  const clientSecret = process.env.OAUTH_CONSUMER_SECRET;
  const redirectUri = process.env.OAUTH_CALLBACK_URL;
  if (!clientId) {
    throw new Error(
      'Missing required environment variable: OAUTH_CONSUMER_KEY. Set it in .env or export it before starting the server.'
    );
  }
  if (!clientSecret) {
    throw new Error(
      'Missing required environment variable: OAUTH_CONSUMER_SECRET. Set it in .env or export it before starting the server.'
    );
  }
  if (!redirectUri) {
    throw new Error(
      'Missing required environment variable: OAUTH_CALLBACK_URL. Set it in .env or export it before starting the server.'
    );
  }
  return { clientId, clientSecret, redirectUri };
}
auth.get('/config', (c) =>
  c.json({
    providerName: process.env.OAUTH_PROVIDER_NAME?.trim() || 'Wikimedia',
  })
);
auth.get('/login', async (c) => {
  const { clientId, redirectUri } = config();
  const provider = providerConfig();
  const codeVerifier = oauth.generateRandomCodeVerifier();
  const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier);
  const state = oauth.generateRandomState();
  const safeReturnTo = safeReturnPath(c.req.query('returnTo'));
  setSession(c, { oauthState: state, codeVerifier, returnTo: safeReturnTo }, true);
  const url = new URL(provider.authorizationEndpoint);
  if (provider.scope) url.searchParams.set('scope', provider.scope);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return c.redirect(url.toString());
});
auth.get('/callback', async (c): Promise<Response> => {
  const { clientId, clientSecret, redirectUri } = config();
  const provider = providerConfig();
  const session = readSession(c);
  if (!session?.oauthState || !session.codeVerifier) {
    return c.json({ error: 'OAuth session expired or missing' }, 400);
  }
  let tokens: oauth.TokenEndpointResponse;
  try {
    const client: oauth.Client = { client_id: clientId };
    const params = oauth.validateAuthResponse(
      provider.as,
      client,
      new URL(c.req.url),
      session.oauthState
    );
    const tokenResponse = await oauth.authorizationCodeGrantRequest(
      provider.as,
      client,
      oauth.ClientSecretPost(clientSecret),
      params,
      redirectUri,
      session.codeVerifier
    );
    tokens = await oauth.processAuthorizationCodeResponse(provider.as, client, tokenResponse);
  } catch {
    clearSession(c);
    return c.json({ error: 'OAuth authorization failed or was cancelled' }, 400);
  }
  let profile: Record<string, unknown>;
  try {
    const profileResponse = await fetch(provider.profileEndpoint, {
      signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' },
    });
    if (!profileResponse.ok) throw new Error('Profile request failed');
    profile = (await profileResponse.json()) as Record<string, unknown>;
  } catch {
    clearSession(c);
    return c.json({ error: 'Failed to load OAuth provider profile' }, 502);
  }
  const subject = profile[provider.subjectField];
  const username = profile[provider.usernameField];
  if (
    (typeof subject !== 'string' && typeof subject !== 'number') ||
    typeof username !== 'string' ||
    !username
  ) {
    clearSession(c);
    return c.json({ error: 'OAuth provider profile response was incomplete' }, 502);
  }
  const id = String(subject);
  const now = new Date().toISOString();
  const existing = db.select().from(schema.users).where(eq(schema.users.id, id)).get();
  const values = {
    wiki_username: username,
    oauth_access_token: encryptSecret(tokens.access_token),
    oauth_refresh_token: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
  };
  if (existing) {
    db.update(schema.users).set(values).where(eq(schema.users.id, id)).run();
  } else {
    db.insert(schema.users)
      .values({ id, ...values, created_at: now })
      .run();
  }
  setSession(c, { userId: id });
  return c.redirect(safeReturnPath(session.returnTo));
});
auth.post('/logout', (c) => {
  clearSession(c);
  return c.json({ success: true });
});
auth.get('/me', (c) => {
  const session = readSession(c);
  if (!session?.userId) return c.json({ user: null });
  const user = db
    .select({ id: schema.users.id, wiki_username: schema.users.wiki_username })
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .get();
  return c.json({ user: user ?? null });
});
export default auth;
