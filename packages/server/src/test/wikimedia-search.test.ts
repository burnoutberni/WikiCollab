import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchWiki } = vi.hoisted(() => ({ fetchWiki: vi.fn() }));
vi.mock('server-fetch', () => ({ serverFetch: fetchWiki, SsrfError: class extends Error {} }));

import wikiRoutes from '../routes/wiki.js';
import {
  resetWikimediaSearchForTest,
  searchWikimedia,
  wikimediaDirectory,
} from '../services/wikimedia-search.js';

const matrix = {
  sitematrix: {
    count: 8,
    0: {
      code: 'en',
      name: 'English',
      localname: 'English',
      site: [
        { url: 'https://en.wikipedia.org', code: 'wiki', sitename: 'Wikipedia' },
        { url: 'https://en.wiktionary.org', code: 'wiktionary', sitename: 'Wiktionary' },
        { url: 'https://en.wikinews.org', code: 'wikinews', sitename: 'Wikinews', closed: true },
        { url: 'https://private.wikipedia.org', code: 'wiki', sitename: 'Private', private: true },
        { url: 'https://attacker.example', code: 'wiki', sitename: 'Not Wikipedia' },
      ],
    },
    1: {
      code: 'de',
      name: 'Deutsch',
      localname: 'German',
      site: [{ url: 'https://de.wikipedia.org', code: 'wiki', sitename: 'Wikipedia' }],
    },
    2: {
      code: 'fr',
      name: 'Français',
      localname: 'French',
      site: [{ url: 'https://fr.wiktionary.org', code: 'wiktionary', sitename: 'Wiktionary' }],
    },
    specials: [
      { url: 'https://commons.wikimedia.org', code: 'commons', sitename: 'Wikimedia Commons' },
      { url: 'https://wikisource.org', code: 'sources', sitename: 'Wikisource' },
      { url: 'https://www.wikidata.org', code: 'wikidata', sitename: 'Wikipedia' },
      { url: 'https://private.wikimedia.org', code: 'meta', sitename: 'Private', private: true },
      { url: 'https://test.wikipedia.org', code: 'test', sitename: 'Test Wiki' },
      { url: 'https://attacker.example', code: 'species', sitename: 'Not Wikimedia' },
    ],
  },
};

beforeEach(() => {
  resetWikimediaSearchForTest();
  fetchWiki.mockReset().mockImplementation(async (value: string) => {
    const url = new URL(value);
    if (url.searchParams.get('action') === 'sitematrix') return Response.json(matrix);
    return Response.json({
      query: {
        pages: [
          { title: 'Berlin Wall', pageid: 2, contentmodel: 'wikitext', index: 2 },
          { title: 'Berlin', pageid: 1, contentmodel: 'wikitext', index: 1 },
          { title: 'File:Shared Commons image', pageid: 0, contentmodel: 'wikitext', index: 3 },
          { title: 'Q64', pageid: 64, contentmodel: 'wikibase-item', index: 4 },
        ],
      },
    });
  });
});

describe('Wikipedia typeahead', () => {
  it('gets language autonyms and sites from the official matrix, cached and deduplicated', async () => {
    const [first, second] = await Promise.all([wikimediaDirectory(), wikimediaDirectory()]);
    expect(first).toBe(second);
    expect(first.languages).toContainEqual({ code: 'de', name: 'German', autonym: 'Deutsch' });
    expect(first.sites.map((site) => site.api_url)).toEqual([
      'https://en.wikipedia.org/w/api.php',
      'https://de.wikipedia.org/w/api.php',
    ]);
    expect(first.languages.some((language) => language.code === 'fr')).toBe(false);
    expect(first.sites.map((site) => site.api_url)).not.toContain(
      'https://private.wikimedia.org/w/api.php'
    );
    expect(first.sites.some((site) => site.api_url.includes('attacker.example'))).toBe(false);
    expect(first.sites.some((site) => site.api_url.includes('test.wikipedia.org'))).toBe(false);
    await wikimediaDirectory();
    expect(fetchWiki).toHaveBeenCalledTimes(1);
  });

  it('searches only Wikipedia in the selected language, never sister projects', async () => {
    const result = await searchWikimedia('Berlin', 'en');
    expect(result.partial).toBe(false);
    const hosts = fetchWiki.mock.calls.slice(1).map(([value]) => new URL(value).hostname);
    expect(hosts).toEqual(['en.wikipedia.org']);
    expect(hosts).not.toContain('de.wikipedia.org');
    expect(result.results[0]).toMatchObject({
      title: 'Berlin',
      site_name: 'Wikipedia',
      language: 'en',
      api_url: 'https://en.wikipedia.org/w/api.php',
    });
    expect(result.results[1]).toMatchObject({
      title: 'Berlin Wall',
      site_name: 'Wikipedia',
      language: 'en',
    });
    expect(result.results.some((result) => result.title.startsWith('File:'))).toBe(false);
    const request = new URL(fetchWiki.mock.calls[1][0]);
    expect(request.searchParams.get('generator')).toBe('prefixsearch');
    expect(request.searchParams.get('gpssearch')).toBe('Berlin');
    expect(request.searchParams.get('prop')).toBe('info');
    expect(request.searchParams.get('gpslimit')).toBe('10');
    expect(fetchWiki.mock.calls[1][1]).toMatchObject({ timeout: 3500, maxResponseSize: 131072 });
  });

  it('switches language versions without constructing guessed project domains', async () => {
    const result = await searchWikimedia('Berlin', 'de');
    expect(
      result.results.some((result) => result.api_url === 'https://de.wikipedia.org/w/api.php')
    ).toBe(true);
    expect(result.results.some((result) => result.api_url.includes('en.wikipedia.org'))).toBe(
      false
    );
    expect(result.results.every((result) => result.language === 'de')).toBe(true);
  });

  it('deduplicates equivalent repeated queries and reuses short-lived cached results', async () => {
    const [first, second] = await Promise.all([
      searchWikimedia('Berlin', 'en'),
      searchWikimedia('berlin', 'en'),
    ]);
    expect(first).toBe(second);
    const calls = fetchWiki.mock.calls.length;
    await searchWikimedia('Berlin', 'en');
    expect(fetchWiki).toHaveBeenCalledTimes(calls);
  });

  it('does not fall back to other projects when Wikipedia fails', async () => {
    await wikimediaDirectory();
    fetchWiki.mockRejectedValueOnce(new Error('Temporary timeout'));
    await expect(searchWikimedia('Berlin', 'en')).rejects.toThrow(/unavailable/);
    expect(fetchWiki.mock.calls.slice(1).map(([url]) => new URL(url).hostname)).toEqual([
      'en.wikipedia.org',
    ]);
  });

  it('reports total failures and allows retrying instead of caching a rejected promise', async () => {
    await wikimediaDirectory();
    fetchWiki.mockRejectedValue(new Error('Offline'));
    await expect(searchWikimedia('Berlin', 'en')).rejects.toThrow(/unavailable/);
    fetchWiki.mockImplementation(async () => Response.json({ batchcomplete: true }));
    expect(await searchWikimedia('Berlin', 'en')).toEqual({ results: [], partial: false });
  });

  it('validates languages against the official Wikipedia directory before searching', async () => {
    await expect(searchWikimedia('Berlin', 'not-a-language')).rejects.toThrow(
      /available Wikipedia language/
    );
    expect(fetchWiki).toHaveBeenCalledTimes(1);
  });

  it('requires authentication and exposes the directory and typeahead through the API', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      (c.set as (key: string, value: unknown) => void)(
        'userId',
        c.req.header('x-test-user') || null
      );
      await next();
    });
    app.route('/wiki', wikiRoutes);
    expect((await app.request('/wiki/languages')).status).toBe(401);
    expect(fetchWiki).not.toHaveBeenCalled();
    const response = await app.request('/wiki/languages', { headers: { 'x-test-user': 'user' } });
    expect(await response.json()).toContainEqual({
      code: 'de',
      name: 'German',
      autonym: 'Deutsch',
    });
    const suggestions = await app.request('/wiki/search', {
      method: 'POST',
      headers: { 'x-test-user': 'user', 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'Berlin', language: 'de' }),
    });
    expect(suggestions.status).toBe(200);
    expect(await suggestions.json()).toMatchObject({ partial: false, results: expect.any(Array) });
  });
});
