import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockServerFetch } = vi.hoisted(() => ({ mockServerFetch: vi.fn() }));
vi.mock('server-fetch', () => ({ serverFetch: mockServerFetch }));

import { botSessionCookie, loginWithBotPassword } from '../mediawiki-bot-auth.js';
import { mediaWikiHeaders } from '../mediawiki-http.js';

const apiUrl = 'https://private.example/w/api.php';
const credentials = { username: 'Alice@WikiCollab', password: 'long-bot-password' };

describe('MediaWiki Bot Password authentication', () => {
  beforeEach(() => {
    mockServerFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses a login token and session cookies for action=login', async () => {
    mockServerFetch
      .mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => (name === 'set-cookie' ? 'session=initial; Path=/' : null),
        },
        json: async () => ({ query: { tokens: { logintoken: 'LOGIN_TOKEN' } } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => (name === 'set-cookie' ? 'session=authenticated; Path=/' : null),
        },
        json: async () => ({ login: { result: 'Success' } }),
      });

    const cookie = await loginWithBotPassword(apiUrl, credentials);
    expect(cookie).toBe('session=authenticated');
    const [url, options] = mockServerFetch.mock.calls[1];
    expect(url).toBe(apiUrl);
    expect(options.method).toBe('POST');
    expect(options.headers.Cookie).toContain('session=initial');
    expect(new URLSearchParams(options.body).get('lgpassword')).toBe(credentials.password);
    expect(new URLSearchParams(options.body).get('lgtoken')).toBe('LOGIN_TOKEN');
    expect(mediaWikiHeaders({}, { cookie })).toMatchObject({ Cookie: cookie });
    expect(mediaWikiHeaders({}, { cookie })).not.toHaveProperty('Authorization');
  });

  it('rejects failed credentials without returning a session', async () => {
    mockServerFetch
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        json: async () => ({ query: { tokens: { logintoken: 'LOGIN_TOKEN' } } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        json: async () => ({ login: { result: 'Failed' } }),
      });

    await expect(botSessionCookie(apiUrl, credentials, true)).rejects.toThrow(/rejected/);
  });
});
