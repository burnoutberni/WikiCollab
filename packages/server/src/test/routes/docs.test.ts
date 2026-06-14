import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../db/schema.js';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import * as Y from 'yjs';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Untitled',
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      expiry TEXT,
      mediawiki_instance_id TEXT,
      restored_version_id TEXT
    );
    CREATE TABLE IF NOT EXISTS mediawiki_instances (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      api_url TEXT NOT NULL,
      token TEXT,
      css TEXT,
      configured_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS document_revisions (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      yjs_state TEXT,
      starred INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS template_cache (
      id TEXT PRIMARY KEY,
      instance_id TEXT NOT NULL REFERENCES mediawiki_instances(id) ON DELETE CASCADE,
      template_name TEXT NOT NULL,
      template_data TEXT NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return drizzle(sqlite, { schema });
}

function createDocsRoutes(db: ReturnType<typeof createTestDb>) {
  const docs = new Hono();

  docs.get('/', (c) => {
    const allDocs = db.select().from(schema.documents).all();
    return c.json(allDocs);
  });

  docs.post('/', async (c) => {
    const body = await c.req.json();
    const slug = body.slug?.trim();
    if (slug && !/^[a-zA-Z0-9_-]+$/.test(slug)) {
      return c.json({ error: 'Slug can only contain letters, numbers, hyphens, and underscores' }, 400);
    }
    const id = slug || nanoid(7);
    if (slug) {
      const existing = db.select().from(schema.documents).where(eq(schema.documents.id, id)).get();
      if (existing) {
        return c.json({ error: 'A document with this slug already exists' }, 409);
      }
    }
    const now = new Date().toISOString();
    const doc = {
      id,
      title: body.title || 'Untitled',
      content: body.content || '',
      created_at: now,
      updated_at: now,
      expiry: body.expiry || null,
      mediawiki_instance_id: body.mediawiki_instance_id || null,
    };
    db.insert(schema.documents).values(doc).run();
    return c.json(doc, 201);
  });

  docs.get('/:id', (c) => {
    const id = c.req.param('id');
    const doc = db.select().from(schema.documents).where(eq(schema.documents.id, id)).get();
    if (!doc) return c.json({ error: 'Document not found' }, 404);
    return c.json(doc);
  });

  docs.delete('/:id', (c) => {
    const id = c.req.param('id');
    const result = db.delete(schema.documents).where(eq(schema.documents.id, id)).run();
    if (result.changes === 0) return c.json({ error: 'Document not found' }, 404);
    return c.json({ success: true });
  });

  docs.patch('/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updated_at: now };
    if (body.title !== undefined) updates.title = body.title;
    if (body.mediawiki_instance_id !== undefined) updates.mediawiki_instance_id = body.mediawiki_instance_id;
    if (body.expiry !== undefined) updates.expiry = body.expiry;
    const result = db.update(schema.documents).set(updates).where(eq(schema.documents.id, id)).run();
    if (result.changes === 0) return c.json({ error: 'Document not found' }, 404);
    const doc = db.select().from(schema.documents).where(eq(schema.documents.id, id)).get();
    return c.json(doc);
  });

  docs.get('/:id/versions', (c) => {
    const id = c.req.param('id');
    const versions = db.select()
      .from(schema.documentRevisions)
      .where(eq(schema.documentRevisions.document_id, id))
      .all()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return c.json(versions);
  });

  docs.post('/:id/versions/:v/star', (c) => {
    const vId = c.req.param('v');
    const version = db.select().from(schema.documentRevisions)
      .where(eq(schema.documentRevisions.id, vId)).get();
    if (!version) return c.json({ error: 'Version not found' }, 404);
    db.update(schema.documentRevisions).set({ starred: true })
      .where(eq(schema.documentRevisions.id, vId)).run();
    return c.json({ success: true });
  });

  docs.delete('/:id/versions/:v/star', (c) => {
    const vId = c.req.param('v');
    const version = db.select().from(schema.documentRevisions)
      .where(eq(schema.documentRevisions.id, vId)).get();
    if (!version) return c.json({ error: 'Version not found' }, 404);
    db.update(schema.documentRevisions).set({ starred: false })
      .where(eq(schema.documentRevisions.id, vId)).run();
    return c.json({ success: true });
  });

  docs.post('/:id/push', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    const doc = db.select().from(schema.documents).where(eq(schema.documents.id, id)).get();
    if (!doc) return c.json({ error: 'Document not found' }, 404);
    if (!body.api_url) return c.json({ error: 'api_url is required' }, 400);
    if (!body.token) return c.json({ error: 'token is required' }, 400);
    return c.json({ success: true, result: 'Success' });
  });

  docs.get('/:id/versions/:v/preview', (c) => {
    const vId = c.req.param('v');
    const version = db.select().from(schema.documentRevisions)
      .where(eq(schema.documentRevisions.id, vId)).get();
    if (!version) return c.json({ error: 'Version not found' }, 404);
    if (!version.yjs_state) return c.json({ content: '' });
    try {
      const state = Buffer.from(version.yjs_state, 'base64');
      const doc = new Y.Doc();
      Y.applyUpdate(doc, state);
      const content = doc.getText('wikitext').toString();
      doc.destroy();
      return c.json({ content });
    } catch {
      return c.json({ error: 'Failed to decode version' }, 500);
    }
  });

  docs.post('/:id/versions/:v/restore', (c) => {
    const id = c.req.param('id');
    const vId = c.req.param('v');
    const version = db.select().from(schema.documentRevisions)
      .where(eq(schema.documentRevisions.id, vId)).get();
    if (!version) return c.json({ error: 'Version not found' }, 404);
    db.update(schema.documents).set({ restored_version_id: vId })
      .where(eq(schema.documents.id, id)).run();
    if (!version.yjs_state) return c.json({ success: true, content: '' });
    try {
      const state = Buffer.from(version.yjs_state, 'base64');
      const doc = new Y.Doc();
      Y.applyUpdate(doc, state);
      const content = doc.getText('wikitext').toString();
      doc.destroy();
      return c.json({ success: true, content });
    } catch {
      return c.json({ success: true, content: '' });
    }
  });

  return docs;
}

describe('Docs routes', () => {
  let app: Hono;
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    app = new Hono();
    app.route('/api/docs', createDocsRoutes(db));
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

  it('POST /:id/versions/:v/star stars a version', async () => {
    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Star Test' }),
    });
    const created = await createRes.json();

    // Insert a revision
    db.insert(schema.documentRevisions).values({
      id: 'rev-star-1',
      document_id: created.id,
      starred: false,
      created_at: new Date().toISOString(),
    }).run();

    const res = await app.request(`/api/docs/${created.id}/versions/rev-star-1/star`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);

    const version = db.select().from(schema.documentRevisions)
      .where(eq(schema.documentRevisions.id, 'rev-star-1')).get();
    expect(version!.starred).toBe(true);
  });

  it('DELETE /:id/versions/:v/star unstars a version', async () => {
    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Unstar Test' }),
    });
    const created = await createRes.json();

    db.insert(schema.documentRevisions).values({
      id: 'rev-unstar-1',
      document_id: created.id,
      starred: true,
      created_at: new Date().toISOString(),
    }).run();

    const res = await app.request(`/api/docs/${created.id}/versions/rev-unstar-1/star`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);

    const version = db.select().from(schema.documentRevisions)
      .where(eq(schema.documentRevisions.id, 'rev-unstar-1')).get();
    expect(version!.starred).toBe(false);
  });

  it('GET /:id/versions/:v/preview returns content from yjs state', async () => {
    const createRes = await app.request('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Preview Test' }),
    });
    const created = await createRes.json();

    // Create a Yjs doc with content and encode state
    const doc = new Y.Doc();
    doc.getText('wikitext').insert(0, 'Hello from Yjs');
    const state = Y.encodeStateAsUpdate(doc);
    const base64State = Buffer.from(state).toString('base64');
    doc.destroy();

    db.insert(schema.documentRevisions).values({
      id: 'rev-preview-1',
      document_id: created.id,
      yjs_state: base64State,
      starred: false,
      created_at: new Date().toISOString(),
    }).run();

    const res = await app.request(`/api/docs/${created.id}/versions/rev-preview-1/preview`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.content).toBe('Hello from Yjs');
  });
});
