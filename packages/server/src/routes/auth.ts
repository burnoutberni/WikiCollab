import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import * as oauth from 'oauth4webapi';

import { db, schema } from '../db/index.js';
import { clearSession, readSession, setSession } from '../middleware/auth.js';
import { encryptSecret } from '../middleware/encryption.js';
const auth = new Hono();
const issuer = 'https://meta.wikimedia.org';
const authorizationEndpoint = 'https://meta.wikimedia.org/w/rest.php/oauth2/authorize';
const tokenEndpoint = 'https://meta.wikimedia.org/w/rest.php/oauth2/access_token';
const profileEndpoint = 'https://meta.wikimedia.org/w/rest.php/oauth2/resource/profile';
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
const as: oauth.AuthorizationServer = {
  issuer,
  authorization_endpoint: authorizationEndpoint,
  token_endpoint: tokenEndpoint,
};
auth.get('/login', async (c) => {
  const { clientId, redirectUri } = config();
  const codeVerifier = oauth.generateRandomCodeVerifier();
  const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier);
  const state = oauth.generateRandomState();
  setSession(c, { oauthState: state, codeVerifier }, true);
  const url = new URL(authorizationEndpoint);
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
  const session = readSession(c);
  if (!session?.oauthState || !session.codeVerifier) {
    return c.json({ error: 'OAuth session expired or missing' }, 400);
  }
  let tokens: oauth.TokenEndpointResponse;
  try {
    const client: oauth.Client = { client_id: clientId };
    const params = oauth.validateAuthResponse(as, client, new URL(c.req.url), session.oauthState);
    const tokenResponse = await oauth.authorizationCodeGrantRequest(
      as,
      client,
      oauth.ClientSecretPost(clientSecret),
      params,
      redirectUri,
      session.codeVerifier
    );
    tokens = await oauth.processAuthorizationCodeResponse(as, client, tokenResponse);
  } catch {
    clearSession(c);
    return c.json({ error: 'OAuth authorization failed or was cancelled' }, 400);
  }
  const profileResponse = await fetch(profileEndpoint, {
    headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' },
  });
  if (!profileResponse.ok) {
    return c.json({ error: 'Failed to load Wikimedia profile' }, 502);
  }
  const profile = (await profileResponse.json()) as { sub?: string | number; username?: string };
  if (profile.sub === undefined || !profile.username) {
    return c.json({ error: 'Wikimedia profile response was incomplete' }, 502);
  }
  const id = String(profile.sub);
  const now = new Date().toISOString();
  const existing = db.select().from(schema.users).where(eq(schema.users.id, id)).get();
  const values = {
    wiki_username: profile.username,
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
  return c.redirect('/');
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
