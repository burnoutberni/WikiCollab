import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import * as oauth from 'oauth4webapi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as schema from '../../db/schema.js';
import { logger } from '../../logging.js';
import { decryptSecret } from '../../middleware/encryption.js';
import { createTestDb } from '../setup.js';

const { mockDbModule } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockDbModule: { db: null as any, schema: null as any },
}));
vi.mock('../../db/index.js', () => mockDbModule);
vi.mock('../../logging.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

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
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'authorization_response', errorName: 'Error' }),
      'OAuth authorization failed'
    );
  });

  it('logs token endpoint diagnostics without leaking credentials or error causes', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);
    const login = await app.request('/auth/login');
    vi.mocked(oauth.authorizationCodeGrantRequest).mockResolvedValueOnce(
      new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } })
    );
    vi.mocked(oauth.processAuthorizationCodeResponse).mockRejectedValueOnce(
      Object.assign(new Error('consumer-secret auth-code oauth-access-token'), {
        code: 'OAUTH_RESPONSE_BODY_ERROR',
        error: 'invalid_client',
        cause: { access_token: 'oauth-access-token', client_secret: 'consumer-secret' },
      })
    );
    const callback = await app.request('/auth/callback?code=auth-code&state=oauth-state', {
      headers: { Cookie: login.headers.get('set-cookie')!.split(';')[0] },
    });
    expect(callback.status).toBe(400);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'token_response',
        status: 401,
        providerError: 'invalid_client',
        errorCode: 'OAUTH_RESPONSE_BODY_ERROR',
      }),
      'OAuth authorization failed'
    );
    const logs = JSON.stringify(vi.mocked(logger.warn).mock.calls);
    for (const secret of ['consumer-secret', 'auth-code', 'oauth-access-token']) {
      expect(logs).not.toContain(secret);
    }
  });

  it('logs a missing callback session without attempting a token exchange', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);
    const callback = await app.request('/auth/callback?code=auth-code');
    expect(callback.status).toBe(400);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'session', cookiePresent: false }),
      expect.any(String)
    );
    expect(oauth.authorizationCodeGrantRequest).not.toHaveBeenCalled();
  });

  it('logs network error codes from token request failures', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);
    const login = await app.request('/auth/login');
    vi.mocked(oauth.authorizationCodeGrantRequest).mockRejectedValueOnce(
      new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } })
    );
    const callback = await app.request('/auth/callback?code=auth-code&state=oauth-state', {
      headers: { Cookie: login.headers.get('set-cookie')!.split(';')[0] },
    });
    expect(callback.status).toBe(400);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'token_exchange', causeCode: 'ENOTFOUND' }),
      'OAuth authorization failed'
    );
  });

  it('logs missing profile field types without exposing the profile', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);
    const login = await app.request('/auth/login');
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ username: 'PrivateUsername' }));
    const callback = await app.request('/auth/callback?code=auth-code&state=oauth-state', {
      headers: { Cookie: login.headers.get('set-cookie')!.split(';')[0] },
    });
    expect(callback.status).toBe(502);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'profile_validation', subjectType: 'undefined' }),
      expect.any(String)
    );
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain('PrivateUsername');
  });

  it('logs profile HTTP failures with status and without tokens', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);
    const login = await app.request('/auth/login');
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('denied', { status: 403, headers: { 'content-type': 'text/html' } })
    );
    const callback = await app.request('/auth/callback?code=auth-code&state=oauth-state', {
      headers: { Cookie: login.headers.get('set-cookie')!.split(';')[0] },
    });
    expect(callback.status).toBe(502);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'profile_request', status: 403, contentType: 'text/html' }),
      'OAuth profile request failed'
    );
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain('oauth-access-token');
  });

  it('reports malformed profile JSON instead of an unhandled server error', async () => {
    const app = new Hono();
    app.route('/auth', authRoutes);
    const login = await app.request('/auth/login');
    vi.mocked(fetch).mockResolvedValueOnce(new Response('null'));
    const callback = await app.request('/auth/callback?code=auth-code&state=oauth-state', {
      headers: { Cookie: login.headers.get('set-cookie')!.split(';')[0] },
    });
    expect(callback.status).toBe(502);
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
    expect(oauth.authorizationCodeGrantRequest).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      'client-auth',
      expect.any(URLSearchParams),
      'https://example.test/auth/callback',
      'verifier',
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': expect.stringContaining('WikiCollab/') }),
        signal: expect.any(AbortSignal),
      })
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://meta.wikimedia.org/w/rest.php/oauth2/resource/profile',
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': expect.stringContaining('WikiCollab/'),
          Authorization: 'Bearer oauth-access-token',
        }),
      })
    );

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
