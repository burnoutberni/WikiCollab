import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import * as oauth from 'oauth4webapi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as schema from '../../db/schema.js';
import { decryptSecret } from '../../middleware/encryption.js';
import { createTestDb } from '../setup.js';

const { mockDbModule } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockDbModule: { db: null as any, schema: null as any },
}));
vi.mock('../../db/index.js', () => mockDbModule);

vi.mock('oauth4webapi', () => ({
  generateRandomCodeVerifier: vi.fn(() => 'verifier'),
  calculatePKCECodeChallenge: vi.fn(async () => 'challenge'),
  generateRandomState: vi.fn(() => 'oauth-state'),
  validateAuthResponse: vi.fn(() => new URLSearchParams({ code: 'auth-code' })),
  ClientSecretPost: vi.fn(() => 'client-auth'),
  authorizationCodeGrantRequest: vi.fn(async () => ({ ok: true })),
  processAuthorizationCodeResponse: vi.fn(async () => ({
    access_token: 'oauth-access-token',
    refresh_token: 'oauth-refresh-token',
    token_type: 'Bearer',
  })),
}));

import authRoutes from '../../routes/auth.js';

describe('Wikimedia OAuth routes', () => {
  let closeDb: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SESSION_SECRET', 'test-session-secret-with-sufficient-entropy');
    vi.stubEnv('ENCRYPTION_KEY', Buffer.alloc(32, 13).toString('base64'));
    vi.stubEnv('OAUTH_CONSUMER_KEY', 'consumer-key');
    vi.stubEnv('OAUTH_CONSUMER_SECRET', 'consumer-secret');
    vi.stubEnv('OAUTH_CALLBACK_URL', 'https://example.test/auth/callback');
    vi.stubEnv('NODE_ENV', 'production');

    const testDb = createTestDb();
    mockDbModule.db = testDb.db;
    mockDbModule.schema = schema;
    closeDb = testDb.close;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ sub: 12345, username: 'ExampleUser' }),
      })
    );
  });

  afterEach(() => {
    closeDb?.();
    closeDb = undefined;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('ignores malformed unrelated cookies when reading a valid session', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);
    const login = await app.request('/auth/login');
    const sessionCookie = login.headers.get('set-cookie')!.split(';')[0];
    const callback = await app.request('/auth/callback?code=auth-code&state=oauth-state', {
      headers: { Cookie: `broken=%E0%A4%A; ${sessionCookie}` },
    });
    expect(callback.status).toBe(302);
  });

  it('handles rejected or cancelled OAuth responses without a server error', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);
    const login = await app.request('/auth/login');
    vi.mocked(oauth.validateAuthResponse).mockImplementationOnce(() => {
      throw new Error('invalid state or consent denied');
    });
    const callback = await app.request('/auth/callback?error=access_denied', {
      headers: { Cookie: login.headers.get('set-cookie')!.split(';')[0] },
    });
    expect(callback.status).toBe(400);
    expect(callback.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('completes the PKCE callback, stores encrypted tokens, and creates a login session', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);

    const login = await app.request('/auth/login');
    expect(login.status).toBe(302);
    const location = login.headers.get('location');
    expect(location).toContain('code_challenge=challenge');
    expect(location).toContain('state=oauth-state');

    const cookie = login.headers.get('set-cookie');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');

    const callback = await app.request('/auth/callback?code=auth-code&state=oauth-state', {
      headers: { Cookie: cookie!.split(';')[0] },
    });
    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe('/');

    const user = mockDbModule.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, '12345'))
      .get();
    expect(user.wiki_username).toBe('ExampleUser');
    expect(user.oauth_access_token).not.toBe('oauth-access-token');
    expect(decryptSecret(user.oauth_access_token)).toBe('oauth-access-token');
    expect(decryptSecret(user.oauth_refresh_token)).toBe('oauth-refresh-token');

    const sessionCookie = callback.headers.get('set-cookie');
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).not.toContain('oauth-access-token');
  });

  it('redirects back to the requested document after login', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);

    const login = await app.request('/auth/login?returnTo=%2Fdoc%2Fabc123');
    expect(login.status).toBe(302);
    const cookie = login.headers.get('set-cookie');

    const callback = await app.request('/auth/callback?code=auth-code&state=oauth-state', {
      headers: { Cookie: cookie!.split(';')[0] },
    });
    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe('/doc/abc123');
  });

  it('rejects tab-injected protocol-relative returnTo redirect', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);
    const login = await app.request('/auth/login?returnTo=%2F%09%2Fevil.example');
    const callback = await app.request('/auth/callback?code=auth-code&state=oauth-state', {
      headers: { Cookie: login.headers.get('set-cookie')!.split(';')[0] },
    });
    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe('/');
  });

  it('uses a configured OAuth provider and public copy without exposing secrets', async () => {
    vi.stubEnv('OAUTH_AUTHORIZATION_URL', 'https://login.example/authorize');
    vi.stubEnv('OAUTH_PROVIDER_NAME', 'Google');
    const app = new Hono();
    app.route('/auth', authRoutes);
    const config = await app.request('/auth/config');
    expect(await config.json()).toEqual({ providerName: 'Google' });
    const login = await app.request('/auth/login');
    expect(login.headers.get('location')).toContain('https://login.example/authorize');
    expect(config.headers.get('content-type')).toContain('application/json');
  });

  it('ignores unsafe returnTo values and falls back to the frontpage', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);

    const login = await app.request('/auth/login?returnTo=https%3A%2F%2Fevil.example%2Fphish');
    const cookie = login.headers.get('set-cookie');

    const callback = await app.request('/auth/callback?code=auth-code&state=oauth-state', {
      headers: { Cookie: cookie!.split(';')[0] },
    });
    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe('/');
  });
});
