import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
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
});
