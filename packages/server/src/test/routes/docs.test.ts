import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import * as schema from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import * as Y from 'yjs';
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

  it('POST /:id/push returns 400 without api_url', async () => {
    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Push Test' }),
    });
    const created = await createRes.json();

    const res = await app.request(`/api/docs/${created.id}/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('POST /:id/push returns 400 without token', async () => {
    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Push Test' }),
    });
    const created = await createRes.json();

    const res = await app.request(`/api/docs/${created.id}/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_url: 'https://example.com/w/api.php' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /:id/push returns 404 for missing doc', async () => {
    const res = await app.request('/api/docs/nonexistent/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_url: 'https://example.com/w/api.php', token: 'abc' }),
    });
    expect(res.status).toBe(404);
  });

  it('POST /:id/push calls serverFetch with correct params', async () => {
    mockServerFetch.mockResolvedValue({
      json: () => Promise.resolve({ edit: { result: 'Success' } }),
    });

    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Push Success' }),
    });
    const created = await createRes.json();

    const res = await app.request(`/api/docs/${created.id}/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_url: 'https://en.wikipedia.org/w/api.php',
        token: 'test-token',
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.result).toBe('Success');
    expect(mockServerFetch).toHaveBeenCalledOnce();
    expect(mockServerFetch.mock.calls[0][0]).toBe('https://en.wikipedia.org/w/api.php');

    const [, options] = mockServerFetch.mock.calls[0];
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded');

    const payload = new URLSearchParams(options.body);
    expect(payload.get('action')).toBe('edit');
    expect(payload.get('title')).toBe('Push Success');
    expect(payload.get('token')).toBe('test-token');
    expect(payload.get('format')).toBe('json');
  });

  it('POST /:id/push handles wiki API error response', async () => {
    mockServerFetch.mockResolvedValue({
      json: () => Promise.resolve({ error: { info: 'Invalid token' } }),
    });

    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Push Error' }),
    });
    const created = await createRes.json();

    const res = await app.request(`/api/docs/${created.id}/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_url: 'https://en.wikipedia.org/w/api.php',
        token: 'bad-token',
      }),
    });
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('Invalid token');
  });

  it('POST /:id/push handles network failure', async () => {
    mockServerFetch.mockRejectedValue(new Error('Network error'));

    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Push Network Error' }),
    });
    const created = await createRes.json();

    const res = await app.request(`/api/docs/${created.id}/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_url: 'https://en.wikipedia.org/w/api.php',
        token: 'test-token',
      }),
    });
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('Failed to push to wiki');
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
