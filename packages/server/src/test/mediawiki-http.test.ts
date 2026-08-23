import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('mediawiki-http', () => {
  function jsonResponse(
    overrides: Partial<{
      ok: boolean;
      status: number;
      headers: { get: (name: string) => string | null };
      json: () => Promise<unknown>;
      text: () => Promise<string>;
    }>
  ) {
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({}),
      text: async () => '',
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('includes the default contact URL in the MediaWiki User-Agent', async () => {
    vi.stubEnv('APP_CONTACT_URL', 'https://github.com/burnoutberni/WikiCollab');
    const { MEDIAWIKI_USER_AGENT } = await import('../mediawiki-http.js');

    expect(MEDIAWIKI_USER_AGENT).toContain('WikiCollab/');
    expect(MEDIAWIKI_USER_AGENT).toContain('https://github.com/burnoutberni/WikiCollab');
    expect(MEDIAWIKI_USER_AGENT).not.toContain('local development');
  });

  it('does not classify arbitrary prose as rate limited', async () => {
    const { readMediaWikiJsonResult } = await import('../mediawiki-http.js');
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await readMediaWikiJsonResult<{ ok: boolean }>(
      jsonResponse({
        ok: false,
        status: 500,
        text: async () => 'This page mentions rate limit documentation.',
      }),
      'preview'
    );

    expect(result.rateLimited).toBe(false);
    consoleWarn.mockRestore();
  });

  it('classifies MediaWiki ratelimited error code as rate limited', async () => {
    const { readMediaWikiJsonResult } = await import('../mediawiki-http.js');
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await readMediaWikiJsonResult<{ ok: boolean }>(
      jsonResponse({
        ok: false,
        status: 503,
        text: async () => '{"error":{"code":"ratelimited"}}',
      }),
      'preview'
    );

    expect(result.rateLimited).toBe(true);
    consoleWarn.mockRestore();
  });

  it('parses Retry-After on rate limited responses', async () => {
    const { readMediaWikiJsonResult } = await import('../mediawiki-http.js');
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await readMediaWikiJsonResult<{ ok: boolean }>(
      jsonResponse({
        ok: false,
        status: 429,
        headers: { get: (name) => (name.toLowerCase() === 'retry-after' ? '12' : 'text/plain') },
        text: async () => 'Too Many Requests',
      }),
      'preview'
    );

    expect(result.rateLimited).toBe(true);
    expect(result.retryAfterMs).toBe(12_000);
    consoleWarn.mockRestore();
  });

  it('rejects successful responses that are not JSON and detects rate limits from the body', async () => {
    const { readMediaWikiJsonResult } = await import('../mediawiki-http.js');
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await readMediaWikiJsonResult<{ ok: boolean }>(
      jsonResponse({
        headers: { get: () => 'text/html' },
        text: async () => '<html>Too Many Requests</html>',
      }),
      'preview'
    );

    expect(result.data).toBeNull();
    expect(result.rateLimited).toBe(true);
    consoleWarn.mockRestore();
  });

  it('returns null data when the JSON body cannot be parsed', async () => {
    const { readMediaWikiJsonResult } = await import('../mediawiki-http.js');
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await readMediaWikiJsonResult<{ ok: boolean }>(
      jsonResponse({
        json: async () => {
          throw new Error('bad json');
        },
      }),
      'preview'
    );

    expect(result.data).toBeNull();
    expect(result.rateLimited).toBe(false);
    consoleWarn.mockRestore();
  });
});
