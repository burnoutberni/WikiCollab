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
const { mockServerFetch, mockSsrfError } = vi.hoisted(() => ({
  mockServerFetch: vi.fn(),
  mockSsrfError: class SsrfError extends Error {
    url: string;
    constructor(url: string) {
      super(`SSRF blocked: ${url}`);
      this.url = url;
    }
  },
}));
vi.mock('server-fetch', () => ({
  serverFetch: mockServerFetch,
  SsrfError: mockSsrfError,
}));

function mockMediaWikiSiteinfo(
  general: { server?: string; articlepath?: string; scriptpath?: string } | null,
  skins: Array<{ code: string; name?: string; default?: boolean | string }> = []
): void {
  mockServerFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    text: () => Promise.resolve(''),
    json: () =>
      Promise.resolve({
        query: {
          general,
          skins: skins.map((s) => ({ ...s, name: s.name ?? s.code })),
        },
      }),
  });
}

// Import production router after mocks
import docsRoutes, { drainDocumentMediaWikiCssRefreshesForTest } from '../../routes/docs.js';

describe('Docs routes', () => {
  let app: Hono;
  let closeDb: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServerFetch.mockReset();
    vi.stubEnv('ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
    // Swap to a fresh in-memory DB for each test
    const testDb = createTestDb();
    mockDbModule.db = testDb.db;
    mockDbModule.schema = schema;
    closeDb = testDb.close;
    testDb.db
      .insert(schema.users)
      .values([
        { id: 'owner-1', wiki_username: 'Owner', created_at: new Date().toISOString() },
        { id: 'other-1', wiki_username: 'Other', created_at: new Date().toISOString() },
      ])
      .run();

    app = new Hono();
    app.use('*', async (c, next) => {
      const requested = c.req.header('x-test-user');
      const userId = requested === 'anonymous' ? null : requested || 'owner-1';
      const setCtx = c.set as unknown as (key: string, value: unknown) => void;
      setCtx('userId', userId);
      await next();
    });
    app.route('/api/docs', docsRoutes);
  });

  afterEach(async () => {
    await drainDocumentMediaWikiCssRefreshesForTest();
    closeDb?.();
    closeDb = undefined;
    vi.unstubAllEnvs();
  });

  it('rejects anonymous document creation, including documents without credentials', async () => {
    const response = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-user': 'anonymous' },
      body: JSON.stringify({ title: 'Anonymous' }),
    });
    expect(response.status).toBe(401);
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

  it('stores Bot Passwords encrypted and uses login cookies for MediaWiki requests', async () => {
    mockServerFetch.mockImplementation(async (url: string, options?: { body?: string }) => {
      const requestUrl = new URL(url);
      const params = options?.body ? new URLSearchParams(options.body) : requestUrl.searchParams;
      const action = params.get('action');
      const isLoginToken = action === 'query' && params.get('meta') === 'tokens';
      const isLogin = action === 'login';
      const isCss = requestUrl.pathname.endsWith('/load.php');
      const payload = isLoginToken
        ? { query: { tokens: { logintoken: 'test-login-token' } } }
        : isLogin
          ? { login: { result: 'Success' } }
          : params.get('meta') === 'siteinfo'
            ? {
                query: {
                  general: {
                    server: 'https://private.example',
                    articlepath: '/wiki/$1',
                    scriptpath: '/w',
                  },
                  skins: [],
                },
              }
            : { query: { pages: {} } };
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name: string) =>
            name === 'set-cookie'
              ? isLoginToken
                ? 'session=initial; Path=/'
                : isLogin
                  ? 'session=authorized; Path=/'
                  : null
              : name === 'content-type'
                ? isCss
                  ? 'text/css'
                  : 'application/json'
                : null,
        },
        json: async () => payload,
        text: async () => (isCss ? '.mw-parser-output{}' : JSON.stringify(payload)),
      };
    });
    const response = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Private wiki',
        mediawiki_instance_name: 'Private wiki',
        mediawiki_instance_api_url: 'https://private.example/w/api.php',
        mediawiki_bot_username: 'Editor@WikiCollab',
        mediawiki_bot_password: 'bot-secret-password',
      }),
    });
    expect(response.status).toBe(201);
    const doc = await response.json();
    expect(doc.mediawiki_bot_password).toBeUndefined();
    expect(doc.has_mediawiki_bot_password).toBe(true);
    expect(doc.mediawiki_bot_username).toBe('Editor@WikiCollab');
    const stored = mockDbModule.db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, doc.id))
      .get();
    expect(stored.mediawiki_bot_password).not.toBe('bot-secret-password');
    expect(stored.mediawiki_bot_password).not.toContain('bot-secret-password');
    await drainDocumentMediaWikiCssRefreshesForTest();
    const requests = mockServerFetch.mock.calls;
    expect(
      requests.some(
        ([url, options]) => String(url).endsWith('api.php') && options?.method === 'POST'
      )
    ).toBe(true);
    expect(
      requests.some(
        ([url, options]) =>
          String(url).includes('siteinfo') && options?.headers?.Cookie === 'session=authorized'
      )
    ).toBe(true);
    expect(
      requests.some(
        ([url, options]) =>
          String(url).includes('load.php') && options?.headers?.Cookie === 'session=authorized'
      )
    ).toBe(true);
  });

  it('POST / persists initial MediaWiki settings and refreshes CSS asynchronously', async () => {
    mockMediaWikiSiteinfo(
      {
        server: 'https://en.wikipedia.org',
        articlepath: '/wiki/$1',
        scriptpath: '/w',
      },
      [{ code: 'vector-2022', name: 'Vector', default: '' }]
    );
    mockMediaWikiSiteinfo(
      {
        server: 'https://en.wikipedia.org',
        articlepath: '/wiki/$1',
        scriptpath: '/w',
      },
      [{ code: 'vector-2022', name: 'Vector', default: '' }]
    );
    mockServerFetch
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
      expect(stored?.mediawiki_canonical_server).toBe('https://en.wikipedia.org');
      expect(stored?.mediawiki_article_path).toBe('/wiki/$1');
      expect(stored?.mediawiki_script_path).toBe('/w');
    });
  });

  it('passes the decrypted document API key to MediaWiki fetches', async () => {
    mockServerFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () =>
          Promise.resolve({
            query: {
              general: {
                server: 'https://private.example',
                articlepath: '/wiki/$1',
                scriptpath: '/w',
              },
              skins: [{ code: 'vector', name: 'Vector', default: '' }],
            },
          }),
        text: () => Promise.resolve(''),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'text/css' },
        text: () => Promise.resolve('.mw-parser-output{}'),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ query: { pages: {} } }),
        text: () => Promise.resolve(''),
      });

    const res = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Private wiki',
        mediawiki_instance_name: 'Private',
        mediawiki_instance_api_url: 'https://private.example/w/api.php',
        mediawiki_api_key: 'document-bearer-token',
      }),
    });
    expect(res.status).toBe(201);

    await drainDocumentMediaWikiCssRefreshesForTest();
    expect(mockServerFetch).toHaveBeenCalled();
    for (const call of mockServerFetch.mock.calls) {
      expect(call[1]?.headers?.Authorization).toBe('Bearer document-bearer-token');
    }
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

  it('DELETE requires authentication and ownership', async () => {
    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Protected delete' }),
    });
    const created = await createRes.json();

    const unauthenticated = await app.request(`/api/docs/${created.id}`, {
      method: 'DELETE',
      headers: { 'x-test-user': 'anonymous' },
    });
    expect(unauthenticated.status).toBe(401);

    const nonOwner = await app.request(`/api/docs/${created.id}`, {
      method: 'DELETE',
      headers: { 'x-test-user': 'other-1' },
    });
    expect(nonOwner.status).toBe(403);
  });

  it('PATCH protects owner-only settings', async () => {
    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Protected settings' }),
    });
    const created = await createRes.json();

    const nonOwner = await app.request(`/api/docs/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': 'other-1' },
      body: JSON.stringify({ visibility: 'unlisted' }),
    });
    expect(nonOwner.status).toBe(403);

    const titleOnly = await app.request(`/api/docs/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': 'other-1' },
      body: JSON.stringify({ title: 'Collaborative title' }),
    });
    expect(titleOnly.status).toBe(403);
  });

  it('claims a legacy unowned document on authenticated access', async () => {
    mockDbModule.db
      .insert(schema.documents)
      .values({
        id: 'legacy',
        title: 'Legacy',
        content: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        visibility: 'public',
      })
      .run();

    const res = await app.request('/api/docs/legacy');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.owner_user_id).toBe('owner-1');
    expect(data.is_owner).toBe(true);
  });

  it('encrypts document API keys and never returns them', async () => {
    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Secret wiki',
        mediawiki_api_key: 'super-secret-token',
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.mediawiki_api_key).toBeUndefined();
    expect(created.has_mediawiki_api_key).toBe(true);

    const stored = mockDbModule.db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, created.id))
      .get();
    expect(stored.mediawiki_api_key).toBeTruthy();
    expect(stored.mediawiki_api_key).not.toContain('super-secret-token');
  });

  it('does not send stored bearer tokens or Bot Passwords to another wiki origin', async () => {
    const original = 'https://old.example/w/api.php';
    const replacement = 'https://new.example/w/api.php';
    const encrypted = (await import('../../middleware/encryption.js')).encryptSecret;
    mockDbModule.db
      .insert(schema.documents)
      .values({
        id: 'origin-doc',
        title: 'Origin-bound credentials',
        content: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        owner_user_id: 'owner-1',
        mediawiki_instance_api_url: original,
        mediawiki_api_key: encrypted('old-bearer-secret'),
        mediawiki_bot_username: 'Owner@Bot',
        mediawiki_bot_password: encrypted('old-bot-secret'),
      })
      .run();
    mockServerFetch.mockImplementation(
      async (url: string, options: { headers?: Record<string, string> }) => {
        if (String(url).startsWith('https://new.example')) {
          expect(options.headers?.Authorization).toBeUndefined();
          expect(options.headers?.Cookie).toBeUndefined();
        }
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          text: async () => '',
          json: async () => ({ query: { general: { server: 'https://new.example' } } }),
        };
      }
    );
    const response = await app.request('/api/docs/origin-doc', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediawiki_instance_api_url: replacement }),
    });
    expect(response.status).toBe(200);
    const persisted = mockDbModule.db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, 'origin-doc'))
      .get();
    expect(persisted.mediawiki_api_key).toBeNull();
    expect(persisted.mediawiki_bot_username).toBeNull();
    expect(persisted.mediawiki_bot_password).toBeNull();
  });

  it('hides ownership metadata and bot usernames from non-owners', async () => {
    const created = await app.request('/api/docs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Private metadata', mediawiki_bot_username: 'SecretBot' }),
    });
    const doc = await created.json();
    const response = await app.request(`/api/docs/${doc.id}`, {
      headers: { 'x-test-user': 'other-1' },
    });
    const data = await response.json();
    expect(data.owner_user_id).toBeNull();
    expect(data.mediawiki_bot_username).toBeNull();
    expect(data.is_owner).toBe(false);
  });

  it('rejects blank credentials while allowing explicit null removal', async () => {
    const created = await app.request('/api/docs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Credentials' }),
    });
    const doc = await created.json();
    for (const field of ['mediawiki_api_key', 'mediawiki_bot_password', 'mediawiki_bot_username']) {
      const response = await app.request(`/api/docs/${doc.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: '' }),
      });
      expect(response.status).toBe(400);
    }
    const response = await app.request(`/api/docs/${doc.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediawiki_api_key: null, mediawiki_bot_username: null, mediawiki_bot_password: null }),
    });
    expect(response.status).toBe(200);
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
    mockMediaWikiSiteinfo(
      {
        server: 'https://en.wikipedia.org',
        articlepath: '/wiki/$1',
        scriptpath: '/w',
      },
      [{ code: 'vector-2022', name: 'Vector', default: '' }]
    );
    mockMediaWikiSiteinfo(
      {
        server: 'https://en.wikipedia.org',
        articlepath: '/wiki/$1',
        scriptpath: '/w',
      },
      [{ code: 'vector-2022', name: 'Vector', default: '' }]
    );
    mockServerFetch
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
    await vi.waitFor(() => expect(mockServerFetch).toHaveBeenCalledTimes(5));
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
      expect(stored?.mediawiki_canonical_server).toBe('https://en.wikipedia.org');
      expect(stored?.mediawiki_article_path).toBe('/wiki/$1');
      expect(stored?.mediawiki_script_path).toBe('/w');
    });
    expect(mockServerFetch.mock.calls[2][0]).toContain('https://en.wikipedia.org/w/load.php?');
    expect(mockServerFetch.mock.calls[2][0]).toContain('skin=vector-2022');
    expect(mockServerFetch.mock.calls[2][0]).toContain('only=styles');
    expect(mockServerFetch.mock.calls[0][1].headers['User-Agent']).toContain('WikiCollab/');
    expect(mockServerFetch.mock.calls[2][1].headers['User-Agent']).toContain('WikiCollab/');
  });

  it('builds MediaWiki CSS API URLs without corrupting existing query strings', async () => {
    mockMediaWikiSiteinfo(
      { server: 'https://wiki.example', articlepath: '/wiki/$1', scriptpath: '/w' },
      [{ code: 'vector', default: '' }]
    );
    mockMediaWikiSiteinfo(
      { server: 'https://wiki.example', articlepath: '/wiki/$1', scriptpath: '/w' },
      [{ code: 'vector', default: '' }]
    );
    mockServerFetch
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
    await vi.waitFor(() => expect(mockServerFetch).toHaveBeenCalledTimes(5));
    for (const index of [0, 1, 3, 4]) {
      const url = new URL(mockServerFetch.mock.calls[index][0]);
      expect(url.searchParams.get('origin')).toBe('*');
      expect(url.searchParams.get('assert')).toBe('user');
      expect(url.searchParams.get('action')).toBe('query');
    }
  });

  it('caps combined MediaWiki CSS before storing it', async () => {
    const largeCss = '.x{' + 'a'.repeat(490_000) + '}';
    mockMediaWikiSiteinfo(
      { server: 'https://wiki.example', articlepath: '/wiki/$1', scriptpath: '/w' },
      [{ code: 'vector', default: '' }]
    );
    mockMediaWikiSiteinfo(
      { server: 'https://wiki.example', articlepath: '/wiki/$1', scriptpath: '/w' },
      [{ code: 'vector', default: '' }]
    );
    mockServerFetch
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
    mockMediaWikiSiteinfo(
      { server: 'https://wiki.example', articlepath: '/wiki/$1', scriptpath: '/w' },
      [{ code: 'vector', default: '' }]
    );
    mockMediaWikiSiteinfo(
      { server: 'https://wiki.example', articlepath: '/wiki/$1', scriptpath: '/w' },
      [{ code: 'vector', default: '' }]
    );
    mockServerFetch
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
      expect(stored?.mediawiki_instance_css).not.toContain('\\');
      expect(stored?.mediawiki_instance_css).toContain('url(data:image/png;base64,abc)');
      expect(stored?.mediawiki_instance_css).toContain('url(#shadow)');
    });
  });

  it('strips quoted external CSS url() references containing closing parentheses', async () => {
    mockMediaWikiSiteinfo(
      { server: 'https://wiki.example', articlepath: '/wiki/$1', scriptpath: '/w' },
      [{ code: 'vector', default: '' }]
    );
    mockMediaWikiSiteinfo(
      { server: 'https://wiki.example', articlepath: '/wiki/$1', scriptpath: '/w' },
      [{ code: 'vector', default: '' }]
    );
    mockServerFetch
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/css' },
        text: () => Promise.resolve('.remote{background:url("https://remote.test/a)b.png")}'),
      })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ query: { pages: {} } }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ query: { pages: {} } }) });

    const res = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Quoted External CSS URL',
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
      expect(stored?.mediawiki_instance_css).not.toContain('https://remote.test/a)b.png');
      expect(stored?.mediawiki_instance_css).toContain('url()');
    });
  });

  it('rejects oversized ResourceLoader CSS before reading the body', async () => {
    const text = vi.fn(async () => '.too-large{}');
    mockMediaWikiSiteinfo(
      {
        server: 'https://en.wikipedia.org',
        articlepath: '/wiki/$1',
        scriptpath: '/w',
      },
      [{ code: 'vector-2022', name: 'Vector', default: '' }]
    );
    mockMediaWikiSiteinfo(
      { server: 'https://en.wikipedia.org', articlepath: '/wiki/$1', scriptpath: '/w' },
      [{ code: 'vector-2022', name: 'Vector', default: '' }]
    );
    mockServerFetch
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
    await vi.waitFor(() => expect(mockServerFetch).toHaveBeenCalledTimes(5));
    expect(text).not.toHaveBeenCalled();
  });

  it('PATCH /:id clears stale CSS while retaining metadata after same-URL refresh', async () => {
    mockMediaWikiSiteinfo({ server: 'https://example.com' }, []);
    mockServerFetch.mockRejectedValueOnce(new Error('siteinfo failed'));

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
        mediawiki_canonical_server: 'https://example.com',
        mediawiki_article_path: '/wiki/$1',
        mediawiki_script_path: '/w',
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
    await drainDocumentMediaWikiCssRefreshesForTest();
    const stored = mockDbModule.db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, created.id))
      .get();
    expect(stored?.mediawiki_instance_css).toBeNull();
    expect(stored?.mediawiki_canonical_server).toBe('https://example.com');
    expect(stored?.mediawiki_article_path).toBe('/wiki/$1');
    expect(stored?.mediawiki_script_path).toBe('/w');
    expect(mockServerFetch).toHaveBeenCalledTimes(2);
  });

  it('PATCH /:id preserves metadata when siteinfo omits general data', async () => {
    let siteinfoCallCount = 0;
    mockServerFetch.mockImplementation((url: string) => {
      if (url.includes('meta=siteinfo')) {
        siteinfoCallCount++;
        if (siteinfoCallCount === 1) {
          // MediaWiki config validation siteinfo call: general present
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            text: () => Promise.resolve(''),
            json: () =>
              Promise.resolve({
                query: {
                  general: {
                    server: 'https://example.com',
                    articlepath: '/wiki/$1',
                    scriptpath: '/w',
                  },
                  skins: [],
                },
              }),
          });
        }
        // CSS refresh siteinfo call: general omitted
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          text: () => Promise.resolve(''),
          json: () => Promise.resolve({ query: { skins: [] } }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: () => Promise.resolve(''),
        json: () => Promise.resolve({ query: { pages: {} } }),
      });
    });

    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Missing Siteinfo General' }),
    });
    const created = await createRes.json();
    mockDbModule.db
      .update(schema.documents)
      .set({
        mediawiki_instance_api_url: 'https://example.com/w/api.php',
        mediawiki_instance_css: '.cached{}',
        mediawiki_canonical_server: 'https://example.com',
        mediawiki_article_path: '/wiki/$1',
        mediawiki_script_path: '/w',
      })
      .where(eq(schema.documents.id, created.id))
      .run();

    const res = await app.request(`/api/docs/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediawiki_instance_api_url: 'https://example.com/w/api.php' }),
    });

    expect(res.status).toBe(200);
    await drainDocumentMediaWikiCssRefreshesForTest();
    const stored = mockDbModule.db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, created.id))
      .get();
    expect(stored?.mediawiki_canonical_server).toBe('https://example.com');
    expect(stored?.mediawiki_article_path).toBe('/wiki/$1');
    expect(stored?.mediawiki_script_path).toBe('/w');
  });

  it('PATCH /:id does not let a stale same-URL refresh overwrite a newer API URL', async () => {
    let resolveOldSiteInfo: () => void = () => {};
    let oldExampleCallCount = 0;
    let newExampleCallCount = 0;
    mockServerFetch.mockImplementation((url: string) => {
      if (url.includes('https://old.example.com') && url.includes('meta=siteinfo')) {
        oldExampleCallCount++;
        if (oldExampleCallCount === 1) {
          // MediaWiki config validation siteinfo call: resolve immediately
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            text: () => Promise.resolve(''),
            json: () =>
              Promise.resolve({
                query: { general: { server: 'https://old.example.com' }, skins: [] },
              }),
          });
        }
        // CSS refresh siteinfo call: deferred
        return new Promise((resolve) => {
          resolveOldSiteInfo = () =>
            resolve({
              json: () =>
                Promise.resolve({
                  query: { general: { server: 'https://old.example.com' }, skins: [] },
                }),
            });
        });
      }
      if (url.includes('https://new.example.com') && url.includes('meta=siteinfo')) {
        newExampleCallCount++;
        if (newExampleCallCount === 1) {
          // MediaWiki config validation siteinfo call: resolve immediately
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            text: () => Promise.resolve(''),
            json: () =>
              Promise.resolve({
                query: {
                  general: {
                    server: 'https://new.example.com',
                    articlepath: '/wiki/$1',
                    scriptpath: '/w',
                  },
                  skins: [],
                },
              }),
          });
        }
        // CSS refresh siteinfo call: fail so no metadata is written for the new URL
        return Promise.reject(new Error('siteinfo failed'));
      }
      return Promise.resolve({ json: () => Promise.resolve({ query: { pages: {} } }) });
    });

    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Concurrent Instance Update' }),
    });
    const created = await createRes.json();
    mockDbModule.db
      .update(schema.documents)
      .set({
        mediawiki_instance_name: 'Old Example',
        mediawiki_instance_api_url: 'https://old.example.com/w/api.php',
        mediawiki_instance_css: '.cached{}',
        mediawiki_canonical_server: 'https://old.example.com',
      })
      .where(eq(schema.documents.id, created.id))
      .run();

    const oldPatch = await app.request(`/api/docs/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediawiki_instance_api_url: 'https://old.example.com/w/api.php' }),
    });
    const newPatch = await app.request(`/api/docs/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediawiki_instance_api_url: 'https://new.example.com/w/api.php' }),
    });

    expect(oldPatch.status).toBe(200);
    expect(newPatch.status).toBe(200);

    resolveOldSiteInfo();

    await drainDocumentMediaWikiCssRefreshesForTest();
    const stored = mockDbModule.db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, created.id))
      .get();
    expect(stored?.mediawiki_instance_api_url).toBe('https://new.example.com/w/api.php');
    expect(stored?.mediawiki_canonical_server).toBeNull();
  });

  it('persists URL metadata when siteinfo succeeds but CSS fetches fail', async () => {
    mockMediaWikiSiteinfo(
      { server: 'https://metadata.example', articlepath: '/$1', scriptpath: '/w' },
      [{ code: 'vector', default: '' }]
    );
    mockMediaWikiSiteinfo(
      { server: 'https://metadata.example', articlepath: '/$1', scriptpath: '/w' },
      [{ code: 'vector', default: '' }]
    );
    mockServerFetch
      .mockRejectedValueOnce(new Error('resource loader failed'))
      .mockRejectedValueOnce(new Error('common css failed'))
      .mockRejectedValueOnce(new Error('skin css failed'));

    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Metadata Without CSS' }),
    });
    const created = await createRes.json();
    mockDbModule.db
      .update(schema.documents)
      .set({ mediawiki_instance_api_url: 'https://metadata.example/w/api.php' })
      .where(eq(schema.documents.id, created.id))
      .run();

    const res = await app.request(`/api/docs/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediawiki_instance_api_url: 'https://metadata.example/w/api.php' }),
    });

    expect(res.status).toBe(200);
    await vi.waitFor(() => {
      const stored = mockDbModule.db
        .select()
        .from(schema.documents)
        .where(eq(schema.documents.id, created.id))
        .get();
      expect(stored?.mediawiki_instance_css).toBeNull();
      expect(stored?.mediawiki_canonical_server).toBe('https://metadata.example');
      expect(stored?.mediawiki_article_path).toBe('/$1');
      expect(stored?.mediawiki_script_path).toBe('/w');
    });
  });

  it('PATCH /:id preserves the MediaWiki instance name when omitted', async () => {
    mockMediaWikiSiteinfo({ server: 'https://new.example.com' }, []);

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
    // MediaWiki config validation siteinfo call
    mockMediaWikiSiteinfo({ server: 'https://new.example.com' });
    mockServerFetch
      .mockReturnValueOnce(
        // CSS refresh siteinfo call (deferred)
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
    expect(mockServerFetch).toHaveBeenCalledTimes(2);

    resolveSiteInfo({ json: () => Promise.resolve({ query: { skins: [] } }) });
    await vi.waitFor(() => expect(mockServerFetch).toHaveBeenCalledTimes(5));
  });

  it('skips duplicate CSS refreshes while one is already in flight for the document', async () => {
    let resolveSiteInfo: (value: {
      json: () => Promise<{ query: { skins: never[] } }>;
    }) => void = () => {};
    // MediaWiki config validation siteinfo call (first PATCH)
    mockMediaWikiSiteinfo({ server: 'https://example.com' });
    mockServerFetch
      .mockReturnValueOnce(
        // CSS refresh siteinfo call (deferred)
        new Promise((resolve) => {
          resolveSiteInfo = resolve;
        })
      )
      .mockResolvedValueOnce({
        // MediaWiki config validation siteinfo call (second PATCH)
        ok: true,
        headers: { get: () => 'application/json' },
        json: () =>
          Promise.resolve({
            query: { general: { server: 'https://example.com' }, skins: [] },
          }),
      })
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
    expect(mockServerFetch).toHaveBeenCalledTimes(3);

    resolveSiteInfo({ json: () => Promise.resolve({ query: { skins: [] } }) });
    await vi.waitFor(() => expect(mockServerFetch).toHaveBeenCalledTimes(6));
  });

  it('runs a follow-up CSS refresh when the API URL changes during an in-flight refresh', async () => {
    let resolveFirstSiteInfo: (value: {
      json: () => Promise<{ query: { skins: never[] } }>;
    }) => void = () => {};
    // MediaWiki config validation siteinfo call (first PATCH, old.example)
    mockMediaWikiSiteinfo({ server: 'https://old.example.com' });
    mockServerFetch
      .mockReturnValueOnce(
        // CSS refresh #1 siteinfo call (old.example, deferred)
        new Promise((resolve) => {
          resolveFirstSiteInfo = resolve;
        })
      )
      .mockResolvedValueOnce({
        // MediaWiki config validation siteinfo call (second PATCH, new.example)
        ok: true,
        headers: { get: () => 'application/json' },
        json: () =>
          Promise.resolve({
            query: { general: { server: 'https://new.example.com' }, skins: [] },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/css' },
        text: () => Promise.resolve('.old{}'),
      })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ query: { pages: {} } }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ query: { pages: {} } }) })
      .mockResolvedValueOnce({
        // CSS refresh #2 siteinfo call (new.example, follow-up)
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
    expect(mockServerFetch).toHaveBeenCalledTimes(3);

    resolveFirstSiteInfo({ json: () => Promise.resolve({ query: { skins: [] } }) });
    await vi.waitFor(() => expect(mockServerFetch).toHaveBeenCalledTimes(10));
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

    const res = await app.request('/api/docs', {
      headers: { 'x-test-user': 'anonymous' },
    });
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

  it('POST /:id/preview retries missing MediaWiki instance CSS in the background', async () => {
    mockServerFetch.mockImplementation((url: string) => {
      if (url.includes('meta=siteinfo')) {
        return Promise.resolve({
          json: () =>
            Promise.resolve({
              query: { skins: [{ code: 'vector', name: 'Vector', default: true }] },
            }),
        });
      }
      if (url.includes('/load.php')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'text/css' },
          text: () => Promise.resolve('.mw-parser-output{color:green}'),
        });
      }
      if (url.includes('titles=MediaWiki%3ACommon.css')) {
        return Promise.resolve({ json: () => Promise.resolve({ query: { pages: {} } }) });
      }
      if (url.includes('titles=MediaWiki%3Avector.css')) {
        return Promise.resolve({ json: () => Promise.resolve({ query: { pages: {} } }) });
      }
      return Promise.resolve({
        json: () => Promise.resolve({ parse: { text: { '*': '<p>Remote preview</p>' } } }),
      });
    });

    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Preview CSS Retry' }),
    });
    const created = await createRes.json();
    mockDbModule.db
      .update(schema.documents)
      .set({
        mediawiki_instance_name: 'Example Wiki',
        mediawiki_instance_api_url: 'https://example.com/w/api.php',
        mediawiki_instance_css: null,
      })
      .where(eq(schema.documents.id, created.id))
      .run();

    const res = await app.request(`/api/docs/${created.id}/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wikitext: 'Hello', page: 'Preview CSS Retry' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.html).toContain('<p>Remote preview</p>');
    expect(data.css).toBeNull();
    await vi.waitFor(() => {
      const stored = mockDbModule.db
        .select()
        .from(schema.documents)
        .where(eq(schema.documents.id, created.id))
        .get();
      expect(stored?.mediawiki_instance_css).toContain('.mw-parser-output{color:green}');
    });
  });

  it('clears a queued CSS refresh when the API URL returns to the in-flight URL', async () => {
    let resolveSiteInfo: (value: unknown) => void = () => {};
    let siteinfoCallCount = 0;
    mockServerFetch.mockImplementation((url: string) => {
      if (url.includes('action=query') && url.includes('meta=siteinfo')) {
        siteinfoCallCount++;
        if (siteinfoCallCount === 1) {
          // MediaWiki config validation siteinfo call (current.example): resolve immediately
          return Promise.resolve({
            ok: true,
            headers: { get: () => 'application/json' },
            json: () =>
              Promise.resolve({
                query: {
                  general: { server: 'https://current.example' },
                  skins: [{ code: 'vector', default: true }],
                },
              }),
          });
        }
        if (siteinfoCallCount === 2) {
          // CSS refresh siteinfo call (current.example): deferred
          return new Promise((resolve) => {
            resolveSiteInfo = () =>
              resolve({
                ok: true,
                headers: { get: () => 'application/json' },
                json: () =>
                  Promise.resolve({ query: { skins: [{ code: 'vector', default: true }] } }),
              });
          });
        }
        // Validation siteinfo calls (stale.example, then current.example again): resolve immediately
        return Promise.resolve({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () =>
            Promise.resolve({
              query: {
                general: { server: 'https://current.example' },
                skins: [{ code: 'vector', default: true }],
              },
            }),
        });
      }
      if (url.includes('/load.php')) {
        return Promise.resolve({
          headers: { get: () => 'text/css' },
          text: () => Promise.resolve('.current{color:green}'),
        });
      }
      return Promise.resolve({ json: () => Promise.resolve({ query: { pages: {} } }) });
    });

    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'CSS Race' }),
    });
    const created = await createRes.json();

    await app.request(`/api/docs/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mediawiki_instance_name: 'Current Wiki',
        mediawiki_instance_api_url: 'https://current.example/w/api.php',
      }),
    });
    await vi.waitFor(() => expect(mockServerFetch).toHaveBeenCalledTimes(2));

    await app.request(`/api/docs/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mediawiki_instance_name: 'Stale Wiki',
        mediawiki_instance_api_url: 'https://stale.example/w/api.php',
      }),
    });
    await app.request(`/api/docs/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mediawiki_instance_name: 'Current Wiki',
        mediawiki_instance_api_url: 'https://current.example/w/api.php',
      }),
    });

    resolveSiteInfo({});

    await vi.waitFor(() => {
      const stored = mockDbModule.db
        .select()
        .from(schema.documents)
        .where(eq(schema.documents.id, created.id))
        .get();
      expect(stored?.mediawiki_instance_css).toContain('.current{color:green}');
    });
    const refreshUrls = mockServerFetch.mock.calls.map(([url]) => url);
    // The queued stale.example CSS refresh must be discarded: no CSS fetch from stale.example
    expect(
      refreshUrls.some((url) => url.includes('stale.example') && url.includes('/w/load.php'))
    ).toBe(false);
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

  it('POST /:id/versions/:v/restore fails on corrupt yjs state', async () => {
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
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to restore version' });
    expect(
      db.select().from(schema.documents).where(eq(schema.documents.id, created.id)).get()!
        .restored_version_id
    ).toBeNull();
  });
});
