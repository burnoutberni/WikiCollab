import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as schema from '../../db/schema.js';
import { generatePreview, resetRemotePreviewStateForTests } from '../../preview.js';
import docsRoutes from '../../routes/docs.js';
import { createTestDb } from '../setup.js';

const { mockDbModule } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockDbModule: { db: null as any, schema: null as any },
}));
vi.mock('../../db/index.js', () => mockDbModule);

const { mockServerFetch } = vi.hoisted(() => ({
  mockServerFetch: vi.fn(),
}));
vi.mock('server-fetch', () => ({
  serverFetch: mockServerFetch,
  SsrfError: class SsrfError extends Error {
    url: string;
    constructor(url: string) {
      super(`SSRF blocked: ${url}`);
      this.url = url;
    }
  },
}));

const mockParser = {
  parse: vi.fn().mockReturnValue({ childNodes: [] }),
  toHtml: vi.fn(),
};
vi.mock('wikiparser-node', () => ({ default: mockParser }));

describe('Preview route sanitization', () => {
  let app: Hono;
  let closeDb: (() => void) | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetRemotePreviewStateForTests();
    mockParser.parse.mockReturnValue({ childNodes: [] });
    const testDb = createTestDb();
    mockDbModule.db = testDb.db;
    mockDbModule.schema = schema;
    closeDb = testDb.close;
    app = new Hono();
    app.route('/api/docs', docsRoutes);
    const created = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'doc1', title: 'Preview Doc' }),
    });
    expect(created.status).toBe(201);
  });

  afterEach(() => {
    vi.useRealTimers();
    closeDb?.();
    closeDb = undefined;
  });

  describe('XSS payloads stripped', () => {
    it('strips <script> tags', async () => {
      mockParser.toHtml.mockReturnValue('<p>Hello</p><script>alert("xss")</script>');

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).not.toContain('<script>');
      expect(data.html).not.toContain('alert');
      expect(data.html).toContain('<p>Hello</p>');
    });

    it('strips <iframe> tags', async () => {
      mockParser.toHtml.mockReturnValue('<p>Text</p><iframe src="https://evil.com"></iframe>');

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).not.toContain('<iframe>');
      expect(data.html).toContain('<p>Text</p>');
    });

    it('strips onerror event handler from <img>', async () => {
      mockParser.toHtml.mockReturnValue('<img src="x" onerror="alert(1)">');

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).not.toContain('onerror');
      expect(data.html).not.toContain('alert');
    });

    it('strips onclick event handler from <div>', async () => {
      mockParser.toHtml.mockReturnValue('<div onclick="alert(1)">Click me</div>');

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).not.toContain('onclick');
      expect(data.html).not.toContain('alert');
      expect(data.html).toContain('Click me');
    });

    it('strips javascript: URIs from links', async () => {
      mockParser.toHtml.mockReturnValue('<a href="javascript:alert(1)">Click</a>');

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).not.toContain('javascript:');
      expect(data.html).not.toContain('alert');
    });

    it('strips <object> tags', async () => {
      mockParser.toHtml.mockReturnValue('<object data="evil.swf"></object>');

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).not.toContain('<object>');
    });

    it('strips <embed> tags', async () => {
      mockParser.toHtml.mockReturnValue('<embed src="evil.swf">');

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).not.toContain('<embed>');
    });

    it('strips <form> tags', async () => {
      mockParser.toHtml.mockReturnValue(
        '<form action="https://evil.com"><input type="submit"></form>'
      );

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).not.toContain('<form>');
      expect(data.html).not.toContain('<input>');
    });

    it('strips <svg onload> XSS', async () => {
      mockParser.toHtml.mockReturnValue('<svg onload="alert(1)"></svg>');

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).not.toContain('onload');
      expect(data.html).not.toContain('alert');
    });
  });

  describe('safe HTML preserved', () => {
    it('preserves headings', async () => {
      mockParser.toHtml.mockReturnValue('<h1>Title</h1><h2>Subtitle</h2>');

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).toContain('<h1>');
      expect(data.html).toContain('<h2>');
      expect(data.html).toContain('Title');
    });

    it('preserves safe links', async () => {
      mockParser.toHtml.mockReturnValue('<a href="https://example.com" class="external">Link</a>');

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).toContain('href="https://example.com"');
      expect(data.html).toContain('class="external"');
    });

    it('preserves safe images', async () => {
      mockParser.toHtml.mockReturnValue(
        '<img src="https://example.com/img.png" alt="Photo" width="100" height="200">'
      );

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).toContain('src="https://example.com/img.png"');
      expect(data.html).toContain('alt="Photo"');
      expect(data.html).toContain('width="100"');
    });

    it('preserves tables with colspan/rowspan', async () => {
      mockParser.toHtml.mockReturnValue(
        '<table class="wikitable"><tr><th colspan="2">Header</th></tr><tr><td rowspan="2">Cell</td><td>Other</td></tr></table>'
      );

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).toContain('class="wikitable"');
      expect(data.html).toContain('colspan="2"');
      expect(data.html).toContain('rowspan="2"');
    });

    it('preserves class and id attributes', async () => {
      mockParser.toHtml.mockReturnValue('<div id="toc" class="toc" style="width:200px">TOC</div>');

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).toContain('id="toc"');
      expect(data.html).toContain('class="toc"');
      expect(data.html).toContain('style="width:200px"');
    });

    it('preserves lists', async () => {
      mockParser.toHtml.mockReturnValue('<ul><li>One</li><li>Two</li></ul><ol><li>First</li></ol>');

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).toContain('<ul>');
      expect(data.html).toContain('<ol>');
      expect(data.html).toContain('<li>One</li>');
    });

    it('preserves formatting tags', async () => {
      mockParser.toHtml.mockReturnValue(
        '<b>Bold</b> <i>Italic</i> <strong>Strong</strong> <em>Emphasis</em>'
      );

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).toContain('<b>Bold</b>');
      expect(data.html).toContain('<i>Italic</i>');
      expect(data.html).toContain('<strong>Strong</strong>');
      expect(data.html).toContain('<em>Emphasis</em>');
    });

    it('preserves MediaWiki-specific tags', async () => {
      mockParser.toHtml.mockReturnValue(
        '<ref>Reference</ref>' +
          '<gallery>Image1.png</gallery>' +
          '<math>x^2</math>' +
          '<syntaxhighlight lang="javascript">var x = 1;</syntaxhighlight>'
      );

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).toContain('<ref>');
      expect(data.html).toContain('<gallery>');
      expect(data.html).toContain('<math>');
      expect(data.html).toContain('<syntaxhighlight');
    });

    it('strips local parser TemplateStyles style tags', async () => {
      mockParser.toHtml.mockReturnValue(
        '<style data-mw-deduplicate="TemplateStyles:r1">.mw-parser-output .navbox{border:1px solid #a2a9b1}</style><div class="navbox">Nav</div>'
      );

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).not.toContain('<style');
      expect(data.html).not.toContain('.mw-parser-output .navbox');
      expect(data.html).toContain('<div class="navbox">Nav</div>');
    });
  });

  describe('dangerous CSS stripped', () => {
    it('strips javascript: from style attributes', async () => {
      mockParser.toHtml.mockReturnValue(
        '<div style="background:url(javascript:alert(1))">Styled</div>'
      );

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).not.toContain('javascript:');
      expect(data.html).toContain('Styled');
    });

    it('strips expression() from style attributes', async () => {
      mockParser.toHtml.mockReturnValue('<div style="width:expression(alert(1))">Styled</div>');

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).not.toContain('expression');
      expect(data.html).toContain('Styled');
    });

    it('preserves safe inline styles', async () => {
      mockParser.toHtml.mockReturnValue('<span style="color:red;font-size:12px">Red text</span>');

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).toContain('style="color:red;font-size:12px"');
      expect(data.html).toContain('Red text');
    });

    it('strips hex-escaped javascript: in style attributes (\\6a\\61vascript:)', async () => {
      mockParser.toHtml.mockReturnValue(
        '<div style="background:\\6a\\61vascript:alert(1)">Styled</div>'
      );

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).not.toContain('javascript:');
      expect(data.html).not.toContain('\\6a\\61vascript:');
      expect(data.html).toContain('Styled');
    });

    it('strips hex-escaped expression() in style attributes (\\65xpression\\28)', async () => {
      mockParser.toHtml.mockReturnValue(
        '<div style="width:\\65xpression\\28 alert(1)">Styled</div>'
      );

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).not.toContain('expression');
      expect(data.html).not.toContain('\\65xpression\\28');
      expect(data.html).toContain('Styled');
    });

    it('strips escaped url(javascript:) in style attributes', async () => {
      mockParser.toHtml.mockReturnValue(
        '<div style="back\\67round:url(javascript:alert(1))">Styled</div>'
      );

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).not.toContain('javascript:');
      expect(data.html).not.toContain('\\67round');
      expect(data.html).toContain('Styled');
    });

    it('strips non-hex-escaped javascript: in style attributes (\\java\\script:)', async () => {
      mockParser.toHtml.mockReturnValue('<div style="\\java\\script:alert(1)">Styled</div>');

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).not.toContain('javascript:');
      expect(data.html).not.toContain('\\j');
      expect(data.html).toContain('Styled');
    });

    it('strips line-continuation-escaped javascript: in style attributes (ja\\[newline]vascript:)', async () => {
      mockParser.toHtml.mockReturnValue('<div style="ja\\\nvascript:alert(1)">Styled</div>');

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).not.toContain('javascript:');
      expect(data.html).toContain('Styled');
    });

    it('strips unicode-escaped javascript: in style attributes (\\00006a\\000061vascript:)', async () => {
      mockParser.toHtml.mockReturnValue(
        '<div style="background:\\00006a\\000061vascript:alert(1)">Styled</div>'
      );

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).not.toContain('javascript:');
      expect(data.html).not.toContain('\\00006a\\000061vascript:');
      expect(data.html).toContain('Styled');
    });

    it('strips local parser style tags', async () => {
      mockParser.toHtml.mockReturnValue(
        '<style>@import url(https://evil.example/x.css); .x{background:url(javascript:alert(1)); behavior:url(x.htc);}</style><div class="x">Styled</div>'
      );

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).not.toContain('<style');
      expect(data.html).not.toContain('@import');
      expect(data.html).not.toContain('javascript:');
      expect(data.html).not.toContain('behavior');
      expect(data.html).toContain('Styled');
    });
  });

  describe('both code paths sanitized', () => {
    it('sanitizes HTML from wikiparser fallback path', async () => {
      mockParser.toHtml.mockReturnValue('<p>Safe</p><script>evil()</script>');

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).toContain('<p>Safe</p>');
      expect(data.html).not.toContain('<script>');
    });

    it('sanitizes HTML from remote MediaWiki API path', async () => {
      mockServerFetch.mockResolvedValue({
        json: () =>
          Promise.resolve({ parse: { text: { '*': '<p>Content</p><script>hack()</script>' } } }),
      });
      mockDbModule.db
        .update(schema.documents)
        .set({ mediawiki_instance_api_url: 'https://wiki.example.com/w/api.php' })
        .where(eq(schema.documents.id, 'doc1'))
        .run();

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).toContain('<p>Content</p>');
      expect(data.html).not.toContain('<script>');
      expect(data.html).not.toContain('hack');
      expect(mockServerFetch.mock.calls[0][1].headers['User-Agent']).toContain('WikiCollab/');
    });

    it('does not fall back to local parser for remote rate limits', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockParser.toHtml.mockReturnValue('<p>Built-in fallback</p>');
      mockServerFetch.mockResolvedValue({
        ok: false,
        status: 429,
        headers: { get: () => 'text/plain' },
        text: () => Promise.resolve('You are making too many requests. Please wait.'),
        json: () => Promise.reject(new Error('not json')),
      });
      mockDbModule.db
        .update(schema.documents)
        .set({ mediawiki_instance_api_url: 'https://wiki.example.com/w/api.php' })
        .where(eq(schema.documents.id, 'doc1'))
        .run();

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).toContain('Remote wiki preview is temporarily rate limited');
      expect(data.html).not.toContain('Built-in fallback');
      consoleWarn.mockRestore();
    });

    it('falls back to local parser when the configured instance is broken', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockParser.toHtml.mockReturnValue('<p>Built-in fallback</p>');
      mockServerFetch.mockRejectedValue(new Error('connection failed'));
      mockDbModule.db
        .update(schema.documents)
        .set({ mediawiki_instance_api_url: 'https://wiki.example.com/w/api.php' })
        .where(eq(schema.documents.id, 'doc1'))
        .run();

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).toContain('<p>Built-in fallback</p>');
      consoleWarn.mockRestore();
    });

    it('deduplicates concurrent identical remote preview requests', async () => {
      let resolveJson: (value: { parse: { text: { '*': string } } }) => void = () => {};
      const json = vi.fn(
        () =>
          new Promise((resolve) => {
            resolveJson = resolve;
          })
      );
      mockServerFetch.mockResolvedValue({
        json,
      });

      const first = generatePreview('same', 'https://wiki.example.com/w/api.php', 'Page');
      const second = generatePreview('same', 'https://wiki.example.com/w/api.php', 'Page');

      await vi.waitFor(() => {
        expect(mockServerFetch).toHaveBeenCalledTimes(1);
        expect(json).toHaveBeenCalledTimes(1);
      });
      resolveJson({ parse: { text: { '*': '<p>Remote</p>' } } });

      await expect(first).resolves.toEqual(expect.objectContaining({ html: '<p>Remote</p>' }));
      await expect(second).resolves.toEqual(expect.objectContaining({ html: '<p>Remote</p>' }));
    });

    it('queues rapid different remote preview requests instead of falling back locally', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      mockParser.toHtml.mockReturnValue('<p>Built-in fallback</p>');
      mockServerFetch
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ parse: { text: { '*': '<p>Remote 1</p>' } } }),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ parse: { text: { '*': '<p>Remote 2</p>' } } }),
        });

      const first = generatePreview('one', 'https://wiki.example.com/w/api.php', 'Page');
      await vi.waitFor(() => {
        expect(mockServerFetch).toHaveBeenCalledTimes(1);
      });
      await expect(first).resolves.toEqual(expect.objectContaining({ html: '<p>Remote 1</p>' }));

      const second = generatePreview('two', 'https://wiki.example.com/w/api.php', 'Page');
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockServerFetch).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(500);
      await expect(second).resolves.toEqual(expect.objectContaining({ html: '<p>Remote 2</p>' }));
      expect(mockServerFetch).toHaveBeenCalledTimes(2);
    });

    it('preserves remote MediaWiki TemplateStyles style tags', async () => {
      mockServerFetch.mockResolvedValue({
        json: () =>
          Promise.resolve({
            parse: {
              text: {
                '*': '<style data-mw-deduplicate="TemplateStyles:r1">.mw-parser-output .navbox{border:1px solid #a2a9b1}</style><div class="navbox">Nav</div>',
              },
            },
          }),
      });
      mockDbModule.db
        .update(schema.documents)
        .set({ mediawiki_instance_api_url: 'https://wiki.example.com/w/api.php' })
        .where(eq(schema.documents.id, 'doc1'))
        .run();

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).toContain('<style data-mw-deduplicate="TemplateStyles:r1">');
      expect(data.html).toContain('.mw-parser-output .navbox');
      expect(data.html).toContain('<div class="navbox">Nav</div>');
    });

    it('sanitizes remote MediaWiki style tag contents', async () => {
      mockServerFetch.mockResolvedValue({
        json: () =>
          Promise.resolve({
            parse: {
              text: {
                '*': '<style>@import url(https://evil.example/x.css); .x{background:url(javascript:alert(1)); behavior:url(x.htc);}</style><div class="x">Styled</div>',
              },
            },
          }),
      });
      mockDbModule.db
        .update(schema.documents)
        .set({ mediawiki_instance_api_url: 'https://wiki.example.com/w/api.php' })
        .where(eq(schema.documents.id, 'doc1'))
        .run();

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).toContain('<style>');
      expect(data.html).not.toContain('@import');
      expect(data.html).not.toContain('javascript:');
      expect(data.html).not.toContain('behavior');
      expect(data.html).toContain('Styled');
    });

    it('returns sanitized empty-ish result for empty wikitext', async () => {
      mockParser.toHtml.mockReturnValue('');

      const res = await app.request('/api/docs/doc1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: '' }),
      });
      const data = await res.json();

      expect(data.html).toBe('');
      expect(data.sourceMap).toEqual([]);
    });
  });
});
