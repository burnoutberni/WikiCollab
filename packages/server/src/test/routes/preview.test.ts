import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';

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

import instancesRoutes from '../../routes/instances.js';

describe('Preview route sanitization', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    mockParser.parse.mockReturnValue({ childNodes: [] });
    app = new Hono();
    app.route('/api/instances', instancesRoutes);
  });

  describe('XSS payloads stripped', () => {
    it('strips <script> tags', async () => {
      mockParser.toHtml.mockReturnValue('<p>Hello</p><script>alert("xss")</script>');

      const res = await app.request('/api/instances/preview', {
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

      const res = await app.request('/api/instances/preview', {
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

      const res = await app.request('/api/instances/preview', {
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

      const res = await app.request('/api/instances/preview', {
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

      const res = await app.request('/api/instances/preview', {
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

      const res = await app.request('/api/instances/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).not.toContain('<object>');
    });

    it('strips <embed> tags', async () => {
      mockParser.toHtml.mockReturnValue('<embed src="evil.swf">');

      const res = await app.request('/api/instances/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).not.toContain('<embed>');
    });

    it('strips <form> tags', async () => {
      mockParser.toHtml.mockReturnValue('<form action="https://evil.com"><input type="submit"></form>');

      const res = await app.request('/api/instances/preview', {
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

      const res = await app.request('/api/instances/preview', {
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

      const res = await app.request('/api/instances/preview', {
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

      const res = await app.request('/api/instances/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).toContain('href="https://example.com"');
      expect(data.html).toContain('class="external"');
    });

    it('preserves safe images', async () => {
      mockParser.toHtml.mockReturnValue('<img src="https://example.com/img.png" alt="Photo" width="100" height="200">');

      const res = await app.request('/api/instances/preview', {
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

      const res = await app.request('/api/instances/preview', {
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

      const res = await app.request('/api/instances/preview', {
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

      const res = await app.request('/api/instances/preview', {
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
      mockParser.toHtml.mockReturnValue('<b>Bold</b> <i>Italic</i> <strong>Strong</strong> <em>Emphasis</em>');

      const res = await app.request('/api/instances/preview', {
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

      const res = await app.request('/api/instances/preview', {
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
  });

  describe('dangerous CSS stripped', () => {
    it('strips javascript: from style attributes', async () => {
      mockParser.toHtml.mockReturnValue('<div style="background:url(javascript:alert(1))">Styled</div>');

      const res = await app.request('/api/instances/preview', {
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

      const res = await app.request('/api/instances/preview', {
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

      const res = await app.request('/api/instances/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test' }),
      });
      const data = await res.json();

      expect(data.html).toContain('style="color:red;font-size:12px"');
      expect(data.html).toContain('Red text');
    });
  });

  describe('both code paths sanitized', () => {
    it('sanitizes HTML from wikiparser fallback path', async () => {
      mockParser.toHtml.mockReturnValue('<p>Safe</p><script>evil()</script>');

      const res = await app.request('/api/instances/preview', {
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
        json: () => Promise.resolve({ parse: { text: { '*': '<p>Content</p><script>hack()</script>' } } }),
      });

      const res = await app.request('/api/instances/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikitext: 'test', api_url: 'https://wiki.example.com/w/api.php' }),
      });
      const data = await res.json();

      expect(data.html).toContain('<p>Content</p>');
      expect(data.html).not.toContain('<script>');
      expect(data.html).not.toContain('hack');
    });

    it('returns sanitized empty-ish result for empty wikitext', async () => {
      mockParser.toHtml.mockReturnValue('');

      const res = await app.request('/api/instances/preview', {
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
