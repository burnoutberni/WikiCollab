import { createHash } from 'crypto';
import { serverFetch } from 'server-fetch';

import { assertCredentialTransport } from './mediawiki-http.js';

export interface BotCredentials {
  username: string;
  password: string;
}
const sessions = new Map<string, { cookie: string; expires: number }>();
const pending = new Map<string, Promise<string>>();
const TTL = 20 * 60_000;

function sessionKey(apiUrl: string, bot: BotCredentials): string {
  return createHash('sha256')
    .update(JSON.stringify([apiUrl, bot.username, bot.password]))
    .digest('hex');
}

function mergeCookies(
  jar: Map<string, string>,
  response: { headers: { get(name: string): string | null; getSetCookie?: () => string[] } }
): void {
  const headers = response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? ''];
  for (const header of headers) {
    // Split combined Set-Cookie values while preserving Expires dates.
    for (const item of header.split(/,(?=\s*[^;,=\s]+=)/)) {
      const pair = item.split(';', 1)[0]?.trim();
      const pos = pair?.indexOf('=') ?? -1;
      if (pos > 0) jar.set(pair!.slice(0, pos), pair!.slice(pos + 1));
    }
  }
}
function cookieHeader(jar: Map<string, string>): string {
  return Array.from(jar, ([key, value]) => `${key}=${value}`).join('; ');
}

/** Log in with Special:BotPasswords using the same cookie jar for both steps. */
export async function loginWithBotPassword(apiUrl: string, bot: BotCredentials): Promise<string> {
  assertCredentialTransport(apiUrl, { cookie: 'bot-session' });
  const jar = new Map<string, string>();
  const tokenUrl = new URL(apiUrl);
  tokenUrl.searchParams.set('action', 'query');
  tokenUrl.searchParams.set('meta', 'tokens');
  tokenUrl.searchParams.set('type', 'login');
  tokenUrl.searchParams.set('format', 'json');
  const tokenResponse = await serverFetch(tokenUrl.toString(), {
    redirect: 'manual',
    headers: { Accept: 'application/json' },
  });
  if (!tokenResponse.ok) throw new Error('Could not fetch MediaWiki login token');
  mergeCookies(jar, tokenResponse);
  const tokenData = (await tokenResponse.json()) as {
    query?: { tokens?: { logintoken?: string } };
  };
  const token = tokenData.query?.tokens?.logintoken;
  if (!token) throw new Error('MediaWiki did not provide a login token');

  const loginResponse = await serverFetch(apiUrl, {
    redirect: 'manual',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Cookie: cookieHeader(jar),
    },
    body: new URLSearchParams({
      action: 'login',
      lgname: bot.username,
      lgpassword: bot.password,
      lgtoken: token,
      format: 'json',
    }).toString(),
  });
  if (!loginResponse.ok) throw new Error('MediaWiki bot login failed');
  mergeCookies(jar, loginResponse);
  const data = (await loginResponse.json()) as { login?: { result?: string } };
  if (data.login?.result !== 'Success')
    throw new Error('MediaWiki rejected the Bot Password credentials');
  const cookie = cookieHeader(jar);
  if (!cookie) throw new Error('MediaWiki login did not return session cookies');
  return cookie;
}

export function invalidateBotSession(apiUrl: string, bot: BotCredentials): void {
  sessions.delete(sessionKey(apiUrl, bot));
}

export async function botSessionCookie(
  apiUrl: string,
  bot: BotCredentials,
  force = false
): Promise<string> {
  const key = sessionKey(apiUrl, bot);
  if (force) sessions.delete(key);
  const cached = sessions.get(key);
  if (cached && cached.expires > Date.now()) return cached.cookie;
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const promise = loginWithBotPassword(apiUrl, bot)
    .then((cookie) => {
      sessions.set(key, { cookie, expires: Date.now() + TTL });
      if (sessions.size > 100) sessions.delete(sessions.keys().next().value!);
      return cookie;
    })
    .finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}
