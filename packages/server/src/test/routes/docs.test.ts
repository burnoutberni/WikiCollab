import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import * as schema from '../../db/schema.js';
import { createTestDb } from '../setup.js';

// Mock db/index.js so the production router uses our in-memory test DB.
// vi.hoisted runs before vi.mock factories; no imports are available inside.
const { mockDbModule } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockDbModule: { db: null as any, schema: null as any },
}));
vi.mock('../../db/index.js', () => mockDbModule);

// Mock server-fetch to avoid real HTTP in push tests
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

// Import production router after mocks
import docsRoutes from '../../routes/docs.js';

describe('Docs routes', () => {
  let app: Hono;
  let closeDb: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    // Swap to a fresh in-memory DB for each test
    const testDb = createTestDb();
    mockDbModule.db = testDb.db;
    mockDbModule.schema = schema;
    closeDb = testDb.close;

    app = new Hono();
    app.route('/api/docs', docsRoutes);
  });

  afterEach(() => {
    closeDb?.();
    closeDb = undefined;
  });

  it('GET / returns empty array initially', async () => {
    const res = await app.request('/api/docs');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(0);
  });

  it('POST / creates a document', async () => {
    const res = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test Doc', content: 'Hello world' }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.title).toBe('Test Doc');
    expect(data.content).toBe('Hello world');
    expect(data.id).toBeDefined();
    expect(data.visibility).toBe('public');
    expect(data.mediawiki_instance_name).toBeNull();
    expect(data.mediawiki_instance_api_url).toBeNull();
    expect(data.mediawiki_instance_css).toBeNull();
  });

  it('POST / persists initial MediaWiki settings and refreshes CSS asynchronously', async () => {
    mockServerFetch
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            query: { skins: [{ code: 'vector-2022', name: 'Vector', default: '' }] },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/css' },
        text: () => Promise.resolve('.mw-parser-output{font-size:14px}'),
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ query: { pages: {} } }),
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ query: { pages: {} } }),
      });

    const res = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Instance Doc',
        mediawiki_instance_name: 'English Wikipedia',
        mediawiki_instance_api_url: 'https://en.wikipedia.org/w/api.php',
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.mediawiki_instance_name).toBe('English Wikipedia');
    expect(data.mediawiki_instance_api_url).toBe('https://en.wikipedia.org/w/api.php');
    expect(data.mediawiki_instance_css).toBeNull();

    await vi.waitFor(() => {
      const stored = mockDbModule.db
        .select()
        .from(schema.documents)
        .where(eq(schema.documents.id, data.id))
        .get();
      expect(stored?.mediawiki_instance_css).toContain('.mw-parser-output{font-size:14px}');
    });
  });

  it('POST / rejects non-http MediaWiki API URLs', async () => {
    const res = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Bad URL',
        mediawiki_instance_name: 'Bad Wiki',
        mediawiki_instance_api_url: 'javascript:alert(1)',
      }),
    });

    expect(res.status).toBe(400);
    expect(mockServerFetch).not.toHaveBeenCalled();
  });

  it('POST / creates an unlisted document', async () => {
    const res = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Private-ish', visibility: 'unlisted' }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.visibility).toBe('unlisted');
  });

  it('GET /:id returns a document', async () => {
    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Fetch Test' }),
    });
    const created = await createRes.json();

    const res = await app.request(`/api/docs/${created.id}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.title).toBe('Fetch Test');
  });

  it('GET /:id returns 404 for missing document', async () => {
    const res = await app.request('/api/docs/nonexistent');
    expect(res.status).toBe(404);
  });

  it('DELETE /:id removes a document', async () => {
    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Delete Me' }),
    });
    const created = await createRes.json();

    const res = await app.request(`/api/docs/${created.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);

    const getRes = await app.request(`/api/docs/${created.id}`);
    expect(getRes.status).toBe(404);
  });

  it('PATCH /:id updates a document', async () => {
    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Original' }),
    });
    const created = await createRes.json();

    const res = await app.request(`/api/docs/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.title).toBe('Updated');
  });

  it('PATCH /:id updates document visibility', async () => {
    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Original' }),
    });
    const created = await createRes.json();

    const res = await app.request(`/api/docs/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility: 'unlisted' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.visibility).toBe('unlisted');
  });

  it('PATCH /:id rejects non-http MediaWiki API URLs', async () => {
    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Original' }),
    });
    const created = await createRes.json();

    const res = await app.request(`/api/docs/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mediawiki_instance_name: 'Bad Wiki',
        mediawiki_instance_api_url: 'ftp://wiki.example/w/api.php',
      }),
    });

    expect(res.status).toBe(400);
    expect(mockServerFetch).not.toHaveBeenCalled();
  });

  it('PATCH /:id saves document MediaWiki instance fields and refreshes ResourceLoader CSS asynchronously', async () => {
    mockServerFetch
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            query: { skins: [{ code: 'vector-2022', name: 'Vector', default: '' }] },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/css; charset=utf-8' },
        text: () =>
          Promise.resolve(
            '.mw-parser-output{font-size:14px}</style>a{background:url(javascript:alert(1))}'
          ),
      })
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            query: { pages: { 1: { revisions: [{ '*': '.common{color:red}' }] } } },
          }),
      })
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            query: { pages: { 2: { revisions: [{ '*': '.vector{color:blue}' }] } } },
          }),
      });

    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Instance Doc' }),
    });
    const created = await createRes.json();

    const res = await app.request(`/api/docs/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mediawiki_instance_name: 'English Wikipedia',
        mediawiki_instance_api_url: 'https://en.wikipedia.org/w/api.php',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.mediawiki_instance_name).toBe('English Wikipedia');
    expect(data.mediawiki_instance_api_url).toBe('https://en.wikipedia.org/w/api.php');
    expect(data.mediawiki_instance_css).toBeNull();
    await vi.waitFor(() => expect(mockServerFetch).toHaveBeenCalledTimes(4));
    await vi.waitFor(() => {
      const stored = mockDbModule.db
        .select()
        .from(schema.documents)
        .where(eq(schema.documents.id, created.id))
        .get();
      expect(stored?.mediawiki_instance_css).toContain('ResourceLoader: vector-2022');
      expect(stored?.mediawiki_instance_css).toContain('.mw-parser-output{font-size:14px}');
      expect(stored?.mediawiki_instance_css).not.toContain('</style>');
      expect(stored?.mediawiki_instance_css).not.toContain('javascript:');
      expect(stored?.mediawiki_instance_css).toContain('MediaWiki:Common.css');
      expect(stored?.mediawiki_instance_css).toContain('.common{color:red}');
      expect(stored?.mediawiki_instance_css).toContain('MediaWiki:vector-2022.css');
      expect(stored?.mediawiki_instance_css).toContain('.vector{color:blue}');
    });
    expect(mockServerFetch.mock.calls[1][0]).toContain('https://en.wikipedia.org/w/load.php?');
    expect(mockServerFetch.mock.calls[1][0]).toContain('skin=vector-2022');
    expect(mockServerFetch.mock.calls[1][0]).toContain('only=styles');
    expect(mockServerFetch.mock.calls[0][1].headers['User-Agent']).toContain('WikiCollab/');
    expect(mockServerFetch.mock.calls[1][1].headers['User-Agent']).toContain('WikiCollab/');
  });

  it('builds MediaWiki CSS API URLs without corrupting existing query strings', async () => {
    mockServerFetch
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ query: { skins: [{ code: 'vector', default: '' }] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/css' },
        text: () => Promise.resolve('.resource{}'),
      })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ query: { pages: {} } }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ query: { pages: {} } }) });

    const res = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Query URL CSS',
        mediawiki_instance_name: 'Query Wiki',
        mediawiki_instance_api_url: 'https://wiki.example/w/api.php?origin=*&assert=user',
      }),
    });

    expect(res.status).toBe(201);
    await vi.waitFor(() => expect(mockServerFetch).toHaveBeenCalledTimes(4));
    for (const index of [0, 2, 3]) {
      const url = new URL(mockServerFetch.mock.calls[index][0]);
      expect(url.searchParams.get('origin')).toBe('*');
      expect(url.searchParams.get('assert')).toBe('user');
      expect(url.searchParams.get('action')).toBe('query');
    }
  });

  it('caps combined MediaWiki CSS before storing it', async () => {
    const largeCss = '.x{' + 'a'.repeat(490_000) + '}';
    mockServerFetch
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ query: { skins: [{ code: 'vector', default: '' }] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/css' },
        text: () => Promise.resolve(largeCss),
      })
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({ query: { pages: { 1: { revisions: [{ '*': largeCss }] } } } }),
      })
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({ query: { pages: { 2: { revisions: [{ '*': largeCss }] } } } }),
      });

    const res = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Combined CSS Cap',
        mediawiki_instance_name: 'Large Wiki',
        mediawiki_instance_api_url: 'https://wiki.example/w/api.php',
      }),
    });
    const created = await res.json();

    expect(res.status).toBe(201);
    await vi.waitFor(() => {
      const stored = mockDbModule.db
        .select()
        .from(schema.documents)
        .where(eq(schema.documents.id, created.id))
        .get();
      expect(stored?.mediawiki_instance_css).toHaveLength(500_000);
    });
  });

  it('strips external CSS url() references before storing MediaWiki CSS', async () => {
    mockServerFetch
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ query: { skins: [{ code: 'vector', default: '' }] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/css' },
        text: () =>
          Promise.resolve(
            '@\\69mport u\\72l("https://remote.test/import.css");.remote{background:u\\72l("https://remote.test/image.png")}.data{background:url(data:image/png;base64,abc)}.frag{filter:url(#shadow)}.script{background:u\\72l(\\6a\\61vascript:alert(1))}'
          ),
      })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ query: { pages: {} } }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ query: { pages: {} } }) });

    const res = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'External CSS URL',
        mediawiki_instance_name: 'URL Wiki',
        mediawiki_instance_api_url: 'https://wiki.example/w/api.php',
      }),
    });
    const created = await res.json();

    expect(res.status).toBe(201);
    await vi.waitFor(() => {
      const stored = mockDbModule.db
        .select()
        .from(schema.documents)
        .where(eq(schema.documents.id, created.id))
        .get();
      expect(stored?.mediawiki_instance_css).not.toContain('https://remote.test/image.png');
      expect(stored?.mediawiki_instance_css).not.toContain('https://remote.test/import.css');
      expect(stored?.mediawiki_instance_css).not.toContain('@import');
      expect(stored?.mediawiki_instance_css).not.toContain('javascript:');
      expect(stored?.mediawiki_instance_css).toContain('url(data:image/png;base64,abc)');
      expect(stored?.mediawiki_instance_css).toContain('url(#shadow)');
    });
  });

  it('rejects oversized ResourceLoader CSS before reading the body', async () => {
    const text = vi.fn(async () => '.too-large{}');
    mockServerFetch
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            query: { skins: [{ code: 'vector-2022', name: 'Vector', default: '' }] },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => (name === 'content-length' ? '500001' : 'text/css'),
        },
        text,
      })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ query: { pages: {} } }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ query: { pages: {} } }) });

    const res = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Oversized CSS',
        mediawiki_instance_name: 'English Wikipedia',
        mediawiki_instance_api_url: 'https://en.wikipedia.org/w/api.php',
      }),
    });

    expect(res.status).toBe(201);
    await vi.waitFor(() => expect(mockServerFetch).toHaveBeenCalledTimes(4));
    expect(text).not.toHaveBeenCalled();
  });

  it('PATCH /:id preserves existing CSS and skips refresh when API URL is unchanged', async () => {
    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Cached CSS' }),
    });
    const created = await createRes.json();
    mockDbModule.db
      .update(schema.documents)
      .set({
        mediawiki_instance_name: 'Example',
        mediawiki_instance_api_url: 'https://example.com/w/api.php',
        mediawiki_instance_css: '.cached{}',
      })
      .where(eq(schema.documents.id, created.id))
      .run();

    const res = await app.request(`/api/docs/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mediawiki_instance_name: 'Example renamed',
        mediawiki_instance_api_url: 'https://example.com/w/api.php',
      }),
    });

    expect(res.status).toBe(200);
    const stored = mockDbModule.db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, created.id))
      .get();
    expect(stored?.mediawiki_instance_css).toBe('.cached{}');
    expect(mockServerFetch).not.toHaveBeenCalled();
  });

  it('PATCH /:id preserves the MediaWiki instance name when omitted', async () => {
    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Keep Instance Name' }),
    });
    const created = await createRes.json();
    mockDbModule.db
      .update(schema.documents)
      .set({
        mediawiki_instance_name: 'Existing Name',
        mediawiki_instance_api_url: 'https://old.example.com/w/api.php',
        mediawiki_instance_css: '.cached{}',
      })
      .where(eq(schema.documents.id, created.id))
      .run();

    const res = await app.request(`/api/docs/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediawiki_instance_api_url: 'https://new.example.com/w/api.php' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.mediawiki_instance_name).toBe('Existing Name');
    expect(data.mediawiki_instance_api_url).toBe('https://new.example.com/w/api.php');
  });

  it('PATCH /:id clears existing CSS when changing MediaWiki API URL', async () => {
    let resolveSiteInfo: (value: {
      json: () => Promise<{ query: { skins: never[] } }>;
    }) => void = () => {};
    mockServerFetch
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSiteInfo = resolve;
        })
      )
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/css' },
        text: () => Promise.resolve(''),
      })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ query: { pages: {} } }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ query: { pages: {} } }) });

    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Changed CSS Source' }),
    });
    const created = await createRes.json();
    mockDbModule.db
      .update(schema.documents)
      .set({
        mediawiki_instance_name: 'Old Example',
        mediawiki_instance_api_url: 'https://old.example.com/w/api.php',
        mediawiki_instance_css: '.old-wiki{}',
      })
      .where(eq(schema.documents.id, created.id))
      .run();

    const res = await app.request(`/api/docs/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mediawiki_instance_name: 'New Example',
        mediawiki_instance_api_url: 'https://new.example.com/w/api.php',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.mediawiki_instance_name).toBe('New Example');
    expect(data.mediawiki_instance_api_url).toBe('https://new.example.com/w/api.php');
    expect(data.mediawiki_instance_css).toBeNull();

    const stored = mockDbModule.db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, created.id))
      .get();
    expect(stored?.mediawiki_instance_css).toBeNull();
    expect(mockServerFetch).toHaveBeenCalledTimes(1);

    resolveSiteInfo({ json: () => Promise.resolve({ query: { skins: [] } }) });
    await vi.waitFor(() => expect(mockServerFetch).toHaveBeenCalledTimes(4));
  });

  it('skips duplicate CSS refreshes while one is already in flight for the document', async () => {
    let resolveSiteInfo: (value: {
      json: () => Promise<{ query: { skins: never[] } }>;
    }) => void = () => {};
    mockServerFetch
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSiteInfo = resolve;
        })
      )
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/css' },
        text: () => Promise.resolve(''),
      })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ query: { pages: {} } }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ query: { pages: {} } }) });

    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Dedupe CSS Refresh' }),
    });
    const created = await createRes.json();
    mockDbModule.db
      .update(schema.documents)
      .set({
        mediawiki_instance_name: 'Example',
        mediawiki_instance_api_url: 'https://example.com/w/api.php',
        mediawiki_instance_css: null,
      })
      .where(eq(schema.documents.id, created.id))
      .run();

    const first = await app.request(`/api/docs/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediawiki_instance_api_url: 'https://example.com/w/api.php' }),
    });
    const second = await app.request(`/api/docs/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediawiki_instance_api_url: 'https://example.com/w/api.php' }),
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mockServerFetch).toHaveBeenCalledTimes(1);

    resolveSiteInfo({ json: () => Promise.resolve({ query: { skins: [] } }) });
    await vi.waitFor(() => expect(mockServerFetch).toHaveBeenCalledTimes(4));
  });

  it('runs a follow-up CSS refresh when the API URL changes during an in-flight refresh', async () => {
    let resolveFirstSiteInfo: (value: {
      json: () => Promise<{ query: { skins: never[] } }>;
    }) => void = () => {};
    mockServerFetch
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirstSiteInfo = resolve;
        })
      )
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/css' },
        text: () => Promise.resolve('.old{}'),
      })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ query: { pages: {} } }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ query: { pages: {} } }) })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ query: { skins: [{ code: 'vector', default: '' }] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/css' },
        text: () => Promise.resolve('.new{}'),
      })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ query: { pages: {} } }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ query: { pages: {} } }) });

    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Changed During Refresh' }),
    });
    const created = await createRes.json();
    mockDbModule.db
      .update(schema.documents)
      .set({
        mediawiki_instance_name: 'Old Wiki',
        mediawiki_instance_api_url: 'https://old.example.com/w/api.php',
        mediawiki_instance_css: null,
      })
      .where(eq(schema.documents.id, created.id))
      .run();

    const first = await app.request(`/api/docs/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediawiki_instance_api_url: 'https://old.example.com/w/api.php' }),
    });
    const second = await app.request(`/api/docs/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediawiki_instance_api_url: 'https://new.example.com/w/api.php' }),
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mockServerFetch).toHaveBeenCalledTimes(1);

    resolveFirstSiteInfo({ json: () => Promise.resolve({ query: { skins: [] } }) });
    await vi.waitFor(() => expect(mockServerFetch).toHaveBeenCalledTimes(8));
    await vi.waitFor(() => {
      const stored = mockDbModule.db
        .select()
        .from(schema.documents)
        .where(eq(schema.documents.id, created.id))
        .get();
      expect(stored?.mediawiki_instance_api_url).toBe('https://new.example.com/w/api.php');
      expect(stored?.mediawiki_instance_css).toContain('.new{}');
      expect(stored?.mediawiki_instance_css).not.toContain('.old{}');
    });
  });

  it('PATCH /:id clears document MediaWiki instance fields', async () => {
    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Clear Instance' }),
    });
    const created = await createRes.json();
    mockDbModule.db
      .update(schema.documents)
      .set({
        mediawiki_instance_name: 'Example',
        mediawiki_instance_api_url: 'https://example.com/w/api.php',
        mediawiki_instance_css: '.cached{}',
      })
      .where(eq(schema.documents.id, created.id))
      .run();

    const res = await app.request(`/api/docs/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mediawiki_instance_name: null,
        mediawiki_instance_api_url: null,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.mediawiki_instance_name).toBeNull();
    expect(data.mediawiki_instance_api_url).toBeNull();
    expect(data.mediawiki_instance_css).toBeNull();
  });

  it('GET / hides unlisted documents from the list', async () => {
    await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Public doc', visibility: 'public' }),
    });
    const unlistedRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Link doc', visibility: 'unlisted' }),
    });
    const unlisted = await unlistedRes.json();

    const res = await app.request('/api/docs');
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data).toHaveLength(1);
    expect(data[0].title).toBe('Public doc');
    expect(data.find((doc: { id: string }) => doc.id === unlisted.id)).toBeUndefined();
  });

  it('GET /:id still returns unlisted documents', async () => {
    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Link doc', visibility: 'unlisted' }),
    });
    const created = await createRes.json();

    const res = await app.request(`/api/docs/${created.id}`);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.visibility).toBe('unlisted');
  });

  it('POST / creates document with custom slug', async () => {
    const res = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'my-custom-slug', title: 'Slug Doc' }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe('my-custom-slug');
  });

  it('POST / rejects invalid slug', async () => {
    const res = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'invalid slug!' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST / rejects duplicate slug', async () => {
    await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'unique-slug' }),
    });
    const res = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'unique-slug' }),
    });
    expect(res.status).toBe(409);
  });

  it('GET /:id/versions returns versions', async () => {
    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Versioned Doc' }),
    });
    const created = await createRes.json();

    const res = await app.request(`/api/docs/${created.id}/versions`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it('POST /:id/preview returns preview for a document', async () => {
    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Preview Test' }),
    });
    const created = await createRes.json();

    const res = await app.request(`/api/docs/${created.id}/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wikitext: "'''Bold'''", page: 'Preview Test' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.html).toBeDefined();
    expect(data.sourceMap).toBeDefined();
    expect(data.css).toBeNull();
  });

  it('POST /:id/preview uses document MediaWiki instance and returns CSS', async () => {
    mockServerFetch.mockResolvedValue({
      json: () => Promise.resolve({ parse: { text: { '*': '<p>Remote preview</p>' } } }),
    });

    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Remote Preview' }),
    });
    const created = await createRes.json();
    const db = mockDbModule.db;
    db.update(schema.documents)
      .set({
        mediawiki_instance_name: 'Example Wiki',
        mediawiki_instance_api_url: 'https://example.com/w/api.php',
        mediawiki_instance_css: 'body { color: red; }',
      })
      .where(eq(schema.documents.id, created.id))
      .run();

    const res = await app.request(`/api/docs/${created.id}/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wikitext: 'Hello', page: 'Remote Preview' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.html).toContain('<p>Remote preview</p>');
    expect(data.css).toBe('body { color: red; }');
    expect(mockServerFetch).toHaveBeenCalledOnce();
    expect(mockServerFetch.mock.calls[0][0]).toBe('https://example.com/w/api.php');
    expect(mockServerFetch.mock.calls[0][1].headers['User-Agent']).toContain('WikiCollab/');
  });

  it('POST /:id/versions/:v/star stars a version', async () => {
    const db = mockDbModule.db;

    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Star Test' }),
    });
    const created = await createRes.json();

    db.insert(schema.documentRevisions)
      .values({
        id: 'rev-star-1',
        document_id: created.id,
        starred: false,
        created_at: new Date().toISOString(),
      })
      .run();

    const res = await app.request(`/api/docs/${created.id}/versions/rev-star-1/star`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);

    const version = db
      .select()
      .from(schema.documentRevisions)
      .where(eq(schema.documentRevisions.id, 'rev-star-1'))
      .get();
    expect(version!.starred).toBe(true);
  });

  it('DELETE /:id/versions/:v/star unstars a version', async () => {
    const db = mockDbModule.db;

    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Unstar Test' }),
    });
    const created = await createRes.json();

    db.insert(schema.documentRevisions)
      .values({
        id: 'rev-unstar-1',
        document_id: created.id,
        starred: true,
        created_at: new Date().toISOString(),
      })
      .run();

    const res = await app.request(`/api/docs/${created.id}/versions/rev-unstar-1/star`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);

    const version = db
      .select()
      .from(schema.documentRevisions)
      .where(eq(schema.documentRevisions.id, 'rev-unstar-1'))
      .get();
    expect(version!.starred).toBe(false);
  });

  it('POST /:id/versions/:v/star rejects cross-document star', async () => {
    const db = mockDbModule.db;

    const createRes1 = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Doc A' }),
    });
    const docA = await createRes1.json();

    const createRes2 = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Doc B' }),
    });
    const docB = await createRes2.json();

    db.insert(schema.documentRevisions)
      .values({
        id: 'rev-cross-1',
        document_id: docA.id,
        starred: false,
        created_at: new Date().toISOString(),
      })
      .run();

    const res = await app.request(`/api/docs/${docB.id}/versions/rev-cross-1/star`, {
      method: 'POST',
    });
    expect(res.status).toBe(404);
  });

  it('POST /:id/versions/:v/star returns 404 for non-existent version', async () => {
    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Star Missing' }),
    });
    const created = await createRes.json();

    const res = await app.request(`/api/docs/${created.id}/versions/nonexistent/star`, {
      method: 'POST',
    });
    expect(res.status).toBe(404);
  });

  it('GET /:id/versions/:v/preview returns content from yjs state', async () => {
    const db = mockDbModule.db;

    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Preview Test' }),
    });
    const created = await createRes.json();

    const doc = new Y.Doc();
    doc.getText('wikitext').insert(0, 'Hello from Yjs');
    const state = Y.encodeStateAsUpdate(doc);
    const base64State = Buffer.from(state).toString('base64');
    doc.destroy();

    db.insert(schema.documentRevisions)
      .values({
        id: 'rev-preview-1',
        document_id: created.id,
        yjs_state: base64State,
        starred: false,
        created_at: new Date().toISOString(),
      })
      .run();

    const res = await app.request(`/api/docs/${created.id}/versions/rev-preview-1/preview`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.content).toBe('Hello from Yjs');
  });

  it('GET /:id/versions/:v/preview returns empty content on corrupt yjs state', async () => {
    const db = mockDbModule.db;

    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Corrupt Preview' }),
    });
    const created = await createRes.json();

    db.insert(schema.documentRevisions)
      .values({
        id: 'rev-corrupt-1',
        document_id: created.id,
        yjs_state: '!!!not-valid-base64-or-yjs-data!!!',
        starred: false,
        created_at: new Date().toISOString(),
      })
      .run();

    const res = await app.request(`/api/docs/${created.id}/versions/rev-corrupt-1/preview`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.content).toBe('');
  });

  it('POST /:id/versions/:v/restore restores content from yjs state', async () => {
    const db = mockDbModule.db;

    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Restore Test' }),
    });
    const created = await createRes.json();

    const doc = new Y.Doc();
    doc.getText('wikitext').insert(0, 'Restored content');
    const state = Y.encodeStateAsUpdate(doc);
    const base64State = Buffer.from(state).toString('base64');
    doc.destroy();

    db.insert(schema.documentRevisions)
      .values({
        id: 'rev-restore-1',
        document_id: created.id,
        yjs_state: base64State,
        starred: false,
        created_at: new Date().toISOString(),
      })
      .run();

    const res = await app.request(`/api/docs/${created.id}/versions/rev-restore-1/restore`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.content).toBe('Restored content');
  });

  it('POST /:id/versions/:v/restore returns empty content on corrupt yjs state', async () => {
    const db = mockDbModule.db;

    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Corrupt Restore' }),
    });
    const created = await createRes.json();

    db.insert(schema.documentRevisions)
      .values({
        id: 'rev-corrupt-restore-1',
        document_id: created.id,
        yjs_state: '!!!not-valid-base64-or-yjs-data!!!',
        starred: false,
        created_at: new Date().toISOString(),
      })
      .run();

    const res = await app.request(
      `/api/docs/${created.id}/versions/rev-corrupt-restore-1/restore`,
      {
        method: 'POST',
      }
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.content).toBe('');
  });
});
