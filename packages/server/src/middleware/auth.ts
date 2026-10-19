import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { Context, MiddlewareHandler } from 'hono';

const COOKIE_NAME = 'wikicollab_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OAUTH_SESSION_TTL_MS = 10 * 60 * 1000;

export interface SessionData {
  userId?: string;
  oauthState?: string;
  codeVerifier?: string;
  expiresAt: number;
}

function sessionSecret(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is required');
  return createHmac('sha256', 'wikicollab-session-key').update(secret).digest();
}

function sign(data: string): string {
  return createHmac('sha256', sessionSecret()).update(data).digest('base64url');
}

function sealSession(session: SessionData): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', sessionSecret(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(session), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const payload = [iv, encrypted, tag].map((part) => part.toString('base64url')).join('.');
  return `${payload}.${sign(payload)}`;
}

function unsealSession(value: string): SessionData | null {
  try {
    const [ivEncoded, encryptedEncoded, tagEncoded, signature] = value.split('.');
    if (!ivEncoded || !encryptedEncoded || !tagEncoded || !signature) return null;
    const payload = [ivEncoded, encryptedEncoded, tagEncoded].join('.');
    const expected = Buffer.from(sign(payload));
    const actual = Buffer.from(signature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

    const decipher = createDecipheriv(
      'aes-256-gcm',
      sessionSecret(),
      Buffer.from(ivEncoded, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));
    const decoded = Buffer.concat([
      decipher.update(Buffer.from(encryptedEncoded, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    const parsed = JSON.parse(decoded) as SessionData;
    if (!parsed.expiresAt || parsed.expiresAt <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        return index === -1
          ? [part, '']
          : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

export function readSession(c: Context): SessionData | null {
  const value = parseCookieHeader(c.req.header('Cookie'))[COOKIE_NAME];
  return value ? unsealSession(value) : null;
}

export function setSession(c: Context, data: Omit<SessionData, 'expiresAt'>, oauthOnly = false): void {
  const expiresAt = Date.now() + (oauthOnly ? OAUTH_SESSION_TTL_MS : SESSION_TTL_MS);
  const value = sealSession({ ...data, expiresAt });
  const maxAge = Math.floor((expiresAt - Date.now()) / 1000);
  c.header(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${maxAge}`
  );
}

export function clearSession(c: Context): void {
  c.header(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`
  );
}

export function currentUserId(c: Context): string | null {
  return readSession(c)?.userId ?? null;
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const session = readSession(c);
  c.set('userId', session?.userId ?? null);
  await next();
};

export function requireUser(c: Context): string | Response {
  const userId = (c.get('userId') as string | null | undefined) ?? currentUserId(c);
  return userId ?? c.json({ error: 'Authentication required' }, 401);
}
