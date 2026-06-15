import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { db, schema } from '../db/index.js';
import { getDocumentById, getVersionById } from '../db/helpers.js';
import { eq, desc } from 'drizzle-orm';
import * as Y from 'yjs';
import { serverFetch, SsrfError } from 'server-fetch';
import { CreateDocumentSchema, UpdateDocumentSchema, PushToWikiSchema } from 'shared';
import { parseAndValidate } from '../middleware/validate.js';

const docs = new Hono();

docs.get('/', (c) => {
  const allDocs = db.select().from(schema.documents).all();
  return c.json(allDocs);
});

docs.post('/', async (c) => {
  const result = await parseAndValidate(c, CreateDocumentSchema);
  if (!result.success) return result.response;
  const body = result.data;

  const slug = body.slug;

  if (slug) {
    const existing = getDocumentById(slug);
    if (existing) {
      return c.json({ error: 'A document with this slug already exists' }, 409);
    }
  }

  const id = slug || nanoid(7);
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
  const doc = getDocumentById(id);

  if (!doc) {
    return c.json({ error: 'Document not found' }, 404);
  }

  return c.json(doc);
});

docs.delete('/:id', (c) => {
  const id = c.req.param('id');
  const result = db.delete(schema.documents).where(eq(schema.documents.id, id)).run();

  if (result.changes === 0) {
    return c.json({ error: 'Document not found' }, 404);
  }

  return c.json({ success: true });
});

docs.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await parseAndValidate(c, UpdateDocumentSchema);
  if (!result.success) return result.response;
  const body = result.data;

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };

  if (body.title !== undefined) updates.title = body.title;
  if (body.mediawiki_instance_id !== undefined) updates.mediawiki_instance_id = body.mediawiki_instance_id;
  if (body.expiry !== undefined) updates.expiry = body.expiry;

  const updateResult = db.update(schema.documents)
    .set(updates)
    .where(eq(schema.documents.id, id))
    .run();

  if (updateResult.changes === 0) {
    return c.json({ error: 'Document not found' }, 404);
  }

  const doc = getDocumentById(id);
  return c.json(doc);
});

docs.get('/:id/versions', (c) => {
  const id = c.req.param('id');
  const versions = db.select()
    .from(schema.documentRevisions)
    .where(eq(schema.documentRevisions.document_id, id))
    .orderBy(desc(schema.documentRevisions.created_at), desc(schema.documentRevisions.id))
    .all();

  return c.json(versions);
});

docs.post('/:id/versions/:v/restore', (c) => {
  const id = c.req.param('id');
  const vId = c.req.param('v');

  const version = getVersionById(vId);

  if (!version) {
    return c.json({ error: 'Version not found' }, 404);
  }

  db.update(schema.documents)
    .set({ restored_version_id: vId })
    .where(eq(schema.documents.id, id))
    .run();

  if (!version.yjs_state) {
    return c.json({ success: true, content: '' });
  }

  try {
    const state = Buffer.from(version.yjs_state, 'base64');
    const doc = new Y.Doc();
    Y.applyUpdate(doc, state);
    const content = doc.getText('wikitext').toString();
    doc.destroy();
    return c.json({ success: true, content });
  } catch (err) {
    console.error('Failed to decode version for restore:', err);
    return c.json({ success: true, content: '' });
  }
});

docs.post('/:id/versions/:v/star', (c) => {
  const vId = c.req.param('v');

  const version = getVersionById(vId);

  if (!version) {
    return c.json({ error: 'Version not found' }, 404);
  }

  db.update(schema.documentRevisions)
    .set({ starred: true })
    .where(eq(schema.documentRevisions.id, vId))
    .run();

  return c.json({ success: true });
});

docs.delete('/:id/versions/:v/star', (c) => {
  const vId = c.req.param('v');

  const version = getVersionById(vId);

  if (!version) {
    return c.json({ error: 'Version not found' }, 404);
  }

  db.update(schema.documentRevisions)
    .set({ starred: false })
    .where(eq(schema.documentRevisions.id, vId))
    .run();

  return c.json({ success: true });
});

docs.get('/:id/versions/:v/preview', (c) => {
  const vId = c.req.param('v');

  const version = getVersionById(vId);

  if (!version) {
    return c.json({ error: 'Version not found' }, 404);
  }

  if (!version.yjs_state) {
    return c.json({ content: '' });
  }

  try {
    const state = Buffer.from(version.yjs_state, 'base64');
    const doc = new Y.Doc();
    Y.applyUpdate(doc, state);
    const ytext = doc.getText('wikitext');
    const content = ytext.toString();
    doc.destroy();
    return c.json({ content });
  } catch (error) {
    console.error('Failed to decode version for preview:', error);
    return c.json({ content: '' });
  }
});

docs.post('/:id/push', async (c) => {
  const id = c.req.param('id');
  const result = await parseAndValidate(c, PushToWikiSchema);
  if (!result.success) return result.response;
  const body = result.data;

  const doc = getDocumentById(id);

  if (!doc) {
    return c.json({ error: 'Document not found' }, 404);
  }

  try {
    const formData = new URLSearchParams();
    formData.append('action', 'edit');
    formData.append('title', body.title || doc.title);
    formData.append('text', body.content || doc.content);
    formData.append('summary', body.summary || 'Updated via WikiCollab');
    formData.append('token', body.token);
    formData.append('format', 'json');

    const response = await serverFetch(body.api_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const result = await response.json() as { edit?: { result: string }; error?: { info: string } };

    if (result.error) {
      return c.json({ error: result.error.info }, 500);
    }

    return c.json({ success: true, result: result.edit?.result });
  } catch (error) {
    if (error instanceof SsrfError) {
      console.error(`SSRF blocked: ${error.url}`);
    }
    return c.json({ error: 'Failed to push to wiki' }, 500);
  }
});

export default docs;
