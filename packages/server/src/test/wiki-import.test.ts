import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchWiki } = vi.hoisted(() => ({ fetchWiki: vi.fn() }));
vi.mock('server-fetch', () => ({ serverFetch: fetchWiki, SsrfError: class extends Error {} }));

import wikiRoutes from '../routes/wiki.js';
import { importWikiArticle, searchWiki } from '../services/wiki-import.js';

const api = 'https://en.wikipedia.org/w/api.php';
const general = {
  sitename: 'Wikipedia',
  server: 'https://en.wikipedia.org',
  articlepath: '/wiki/$1',
  scriptpath: '/w',
};
const revision = {
  revid: 123,
  timestamp: '2026-11-01T12:00:00Z',
  slots: { main: { contentmodel: 'wikitext', content: '== Hello ==\nArticle text' } },
};
const json = (query: unknown) =>
  new Response(JSON.stringify({ query }), { headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  fetchWiki.mockReset();
  fetchWiki.mockImplementation(async (value: string) => {
    const url = new URL(value);
    if (url.searchParams.get('meta') === 'siteinfo') return json({ general });
    if (url.searchParams.get('list') === 'search')
      return json({ search: [{ title: 'Hello world' }] });
    return json({ pages: [{ title: 'Hello world', revisions: [revision] }] });
  });
});

describe('Wiki article imports', () => {
  it('imports latest raw wikitext and source metadata, following article redirects', async () => {
    const result = await importWikiArticle({
      url: 'https://en.wikipedia.org/wiki/Hello_world#History',
    });
    expect(result).toMatchObject({
      title: 'Hello world',
      content: revision.slots.main.content,
      api_url: api,
      site_name: 'Wikipedia',
      source: { revision_id: 123 },
    });
    expect(result.source.url).toContain('oldid=123');
    const request = new URL(fetchWiki.mock.calls[1][0]);
    expect(request.searchParams.get('titles')).toBe('Hello world');
    expect(request.searchParams.get('redirects')).toBe('1');
    expect(request.searchParams.get('rvslots')).toBe('main');
    expect(fetchWiki.mock.calls[0][1]).toMatchObject({ timeout: 8000, maxResponseSize: 2097152 });
    expect(fetchWiki.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });

  it.each([
    'https://en.wikipedia.org/w/index.php?title=Hello_world&oldid=123',
    'https://en.wikipedia.org/wiki/Special:PermanentLink/123',
    'https://en.wikipedia.org/wiki/Special%3APermanentLink/123',
    'https://en.wikipedia.org/wiki/Special:Redirect/revision/123',
    'https://en.wikipedia.org/w/index.php?title=Special:PermanentLink/123',
  ])('pins the exact revision from %s', async (url) => {
    await importWikiArticle({ url });
    const request = new URL(fetchWiki.mock.calls.at(-1)![0]);
    expect(request.searchParams.get('revids')).toBe('123');
    expect(request.searchParams.has('titles')).toBe(false);
    expect(request.searchParams.has('redirects')).toBe(false);
  });

  it('recognizes localized revision permalinks', async () => {
    fetchWiki.mockResolvedValueOnce(
      json({
        general,
        specialpagealiases: [{ realname: 'PermanentLink', aliases: ['Permanenter Link'] }],
        namespaces: { '-1': { name: 'Spezial' } },
      })
    );
    await importWikiArticle({ url: 'https://en.wikipedia.org/wiki/Spezial:Permanenter_Link/123' });
    expect(new URL(fetchWiki.mock.calls.at(-1)![0]).searchParams.get('revids')).toBe('123');
  });

  it('normalizes Wikimedia mobile URLs and decodes Unicode titles', async () => {
    await importWikiArticle({ url: 'https://de.m.wikipedia.org/wiki/%C3%96sterreich' });
    expect(new URL(fetchWiki.mock.calls[0][0]).hostname).toBe('de.wikipedia.org');
    expect(new URL(fetchWiki.mock.calls[1][0]).searchParams.get('titles')).toBe('Österreich');
  });

  it('does not mistake ordinary subpages for revision permalinks', async () => {
    await importWikiArticle({ url: 'https://en.wikipedia.org/wiki/User:PermanentLink/123' });
    const request = new URL(fetchWiki.mock.calls.at(-1)![0]);
    expect(request.searchParams.get('titles')).toBe('User:PermanentLink/123');
    expect(request.searchParams.has('revids')).toBe(false);
  });

  it.each([
    'commons.wikimedia.org',
    'fr.wiktionary.org',
    'www.mediawiki.org',
    'www.wikidata.org',
    'www.wikifunctions.org',
    'de.wikibooks.org',
    'en.wikiquote.org',
    'en.wikisource.org',
    'en.wikinews.org',
    'en.wikiversity.org',
    'en.wikivoyage.org',
  ])('uses the public API on %s', async (host) => {
    await importWikiArticle({ url: `https://${host}/wiki/Help:Contents` });
    expect(new URL(fetchWiki.mock.calls[0][0]).hostname).toBe(host);
  });

  it('discovers a custom subdirectory installation through EditURI', async () => {
    fetchWiki.mockResolvedValueOnce(new Response('', { status: 404 }));
    fetchWiki.mockResolvedValueOnce(new Response('', { status: 404 }));
    fetchWiki.mockResolvedValueOnce(
      new Response(
        '<link rel="EditURI" type="application/rsd+xml" href="/custom/api.php?action=rsd&amp;foo=1">'
      )
    );
    fetchWiki.mockResolvedValueOnce(
      json({
        general: {
          ...general,
          server: 'https://wiki.example',
          scriptpath: '/custom',
          articlepath: '/articles/$1',
        },
      })
    );
    const result = await importWikiArticle({ url: 'https://wiki.example/articles/Hello_world' });
    expect(result.api_url).toBe('https://wiki.example/custom/api.php');
    expect(result.source.url).toContain('/custom/index.php?');
  });

  it('supports a manual API override and a nonstandard article path', async () => {
    fetchWiki.mockResolvedValueOnce(
      json({ general: { ...general, articlepath: '/articles/$1/view' } })
    );
    await importWikiArticle({
      url: 'https://wiki.example/articles/Hello_world/view',
      api_url: 'https://wiki.example/custom/api.php',
    });
    expect(new URL(fetchWiki.mock.calls[1][0]).searchParams.get('titles')).toBe('Hello world');
  });

  it('searches a chosen wiki and returns plain titles, not remote HTML', async () => {
    const result = await searchWiki('https://en.wikipedia.org', 'hello');
    expect(result).toEqual({
      api_url: api,
      site_name: 'Wikipedia',
      results: [{ title: 'Hello world' }],
    });
    expect(new URL(fetchWiki.mock.calls[1][0]).searchParams.get('srsearch')).toBe('hello');
  });

  it.each([
    { pages: [{ title: 'Missing', missing: true }] },
    { pages: [{ title: 'Deleted', revisions: [] }] },
    { badrevids: { 123: {} } },
    { pages: [{ title: 'Wrong version', revisions: [{ ...revision, revid: 456 }] }] },
  ])('does not silently substitute a missing or different revision', async (query) => {
    fetchWiki.mockResolvedValueOnce(json({ general })).mockResolvedValueOnce(json(query));
    await expect(importWikiArticle({ api_url: api, revision_id: 123 })).rejects.toThrow(
      /missing|deleted/
    );
  });

  it.each(['wikibase-item', 'json', 'Scribunto'])(
    'rejects %s content instead of converting it',
    async (contentmodel) => {
      fetchWiki.mockResolvedValueOnce(json({ general })).mockResolvedValueOnce(
        json({
          pages: [
            {
              title: 'Structured',
              revisions: [{ ...revision, slots: { main: { contentmodel, content: '{}' } } }],
            },
          ],
        })
      );
      await expect(importWikiArticle({ api_url: api, title: 'Structured' })).rejects.toThrow(
        /content model/
      );
    }
  );

  it('imports article text beyond the former character limit without truncation', async () => {
    const content = 'a'.repeat(250000);
    fetchWiki.mockResolvedValueOnce(json({ general })).mockResolvedValueOnce(
      json({
        pages: [
          {
            title: 'Huge',
            revisions: [
              {
                ...revision,
                slots: { main: { contentmodel: 'wikitext', content } },
              },
            ],
          },
        ],
      })
    );
    const imported = await importWikiArticle({ api_url: api, title: 'Huge' });
    expect(imported.content).toBe(content);
  });

  it('rejects hidden text', async () => {
    fetchWiki.mockResolvedValueOnce(json({ general })).mockResolvedValueOnce(
      json({
        pages: [
          {
            title: 'Hidden',
            revisions: [
              { ...revision, slots: { main: { contentmodel: 'wikitext', texthidden: true } } },
            ],
          },
        ],
      })
    );
    await expect(importWikiArticle({ api_url: api, title: 'Hidden' })).rejects.toThrow(/hidden/);
  });

  it('rejects invalid oldid rather than using latest', async () => {
    await expect(
      importWikiArticle({ url: 'https://en.wikipedia.org/wiki/Hello?oldid=no' })
    ).rejects.toThrow(/invalid revision/);
    expect(fetchWiki).toHaveBeenCalledTimes(1);
  });

  it('fails cleanly on authenticated or throttled APIs', async () => {
    fetchWiki.mockResolvedValueOnce(new Response('', { status: 403 }));
    await expect(importWikiArticle({ api_url: api, title: 'Hello' })).rejects.toThrow(
      /authentication/
    );
    fetchWiki.mockResolvedValueOnce(new Response('', { status: 429 }));
    await expect(importWikiArticle({ api_url: api, title: 'Hello' })).rejects.toThrow(
      /rate limiting/
    );
  });

  it('rejects credential-bearing URLs before making requests', async () => {
    await expect(
      importWikiArticle({ api_url: 'https://user:pass@wiki.example/api.php', title: 'Hello' })
    ).rejects.toThrow(/credentials/);
    expect(fetchWiki).not.toHaveBeenCalled();
  });

  it('does not bypass the hardened fetch when a destination is blocked', async () => {
    fetchWiki.mockRejectedValue(new Error('SSRF blocked'));
    await expect(
      importWikiArticle({ api_url: 'http://127.0.0.1/api.php', title: 'Hello' })
    ).rejects.toThrow('SSRF blocked');
    expect(fetchWiki).toHaveBeenCalledTimes(1);
  });
});

describe('Wiki routes', () => {
  function app(user: string | null) {
    const app = new Hono();
    app.use('*', async (c, next) => {
      (c.set as (key: string, value: unknown) => void)('userId', user);
      await next();
    });
    app.route('/wiki', wikiRoutes);
    return app;
  }
  const post = (body: unknown) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  it('requires login before fetching external URLs', async () => {
    expect(
      (
        await app(null).request(
          '/wiki/resolve',
          post({ url: 'https://en.wikipedia.org/wiki/Hello' })
        )
      ).status
    ).toBe(401);
    expect(fetchWiki).not.toHaveBeenCalled();
  });

  it('validates input before fetching external URLs', async () => {
    expect((await app('user').request('/wiki/resolve', post({}))).status).toBe(400);
    expect(
      (
        await app('user').request(
          '/wiki/search',
          post({ wiki: 'file:///etc/passwd', query: 'hello' })
        )
      ).status
    ).toBe(400);
    expect(fetchWiki).not.toHaveBeenCalled();
  });

  it('resolves articles for authenticated users', async () => {
    const response = await app('user').request(
      '/wiki/resolve',
      post({ api_url: api, title: 'Hello world' })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ source: { revision_id: 123 } });
  });
});
