import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockServerFetch } = vi.hoisted(() => ({ mockServerFetch: vi.fn() }));
vi.mock('server-fetch', () => ({ serverFetch: mockServerFetch }));

import {
  botSessionCookie,
  invalidateBotSession,
  loginWithBotPassword,
} from '../mediawiki-bot-auth.js';
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

  it('invalidates a cached bot session and logs in again on demand', async () => {
    let count = 0;
    mockServerFetch.mockImplementation(async (_url: string, options?: { method?: string }) => {
      if (options?.method === 'POST') {
        count++;
        return {
          ok: true,
          headers: {
            get: (name: string) => (name === 'set-cookie' ? `session=login-${count}` : null),
          },
          json: async () => ({ login: { result: 'Success' } }),
        };
      }
      return {
        ok: true,
        headers: { get: () => 'session=initial' },
        json: async () => ({ query: { tokens: { logintoken: 'token' } } }),
      };
    });
    const bot = { username: 'Refresh@WikiCollab', password: 'refresh-password' };
    const first = await botSessionCookie(apiUrl, bot, true);
    expect(await botSessionCookie(apiUrl, bot)).toBe(first);
    expect(count).toBe(1);
    invalidateBotSession(apiUrl, bot);
    const second = await botSessionCookie(apiUrl, bot);
    expect(second).not.toBe(first);
    expect(count).toBe(2);
  });

  it('never sends Bot Passwords to an HTTP wiki', async () => {
    await expect(loginWithBotPassword('http://private.example/w/api.php', credentials))
      .rejects.toThrow(/HTTPS/);
    expect(mockServerFetch).not.toHaveBeenCalled();
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
