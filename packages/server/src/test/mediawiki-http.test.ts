import { describe, expect, it, vi } from 'vitest';

import { MEDIAWIKI_USER_AGENT, readMediaWikiJsonResult } from '../mediawiki-http.js';

describe('mediawiki-http', () => {
  it('includes a contact URL in the MediaWiki User-Agent', () => {
    expect(MEDIAWIKI_USER_AGENT).toContain('WikiCollab/');
    expect(MEDIAWIKI_USER_AGENT).toContain('https://github.com/burnoutberni/WikiCollab');
    expect(MEDIAWIKI_USER_AGENT).not.toContain('local development');
  });

  it('does not classify arbitrary prose as rate limited', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await readMediaWikiJsonResult<{ ok: boolean }>(
      {
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => 'This page mentions rate limit documentation.',
      },
      'preview'
    );

    expect(result.rateLimited).toBe(false);
    consoleWarn.mockRestore();
  });

  it('classifies MediaWiki ratelimited error code as rate limited', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await readMediaWikiJsonResult<{ ok: boolean }>(
      {
        ok: false,
        status: 503,
        json: async () => ({}),
        text: async () => '{"error":{"code":"ratelimited"}}',
      },
      'preview'
    );

    expect(result.rateLimited).toBe(true);
    consoleWarn.mockRestore();
  });
});
