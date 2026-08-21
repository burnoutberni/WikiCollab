import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { CreateDocumentSchema, PreviewSchema, UpdateDocumentSchema } from 'shared';
import * as Y from 'yjs';

import { getDocumentById, getVersionById } from '../db/helpers.js';
import { db, schema } from '../db/index.js';
import { fetchMediaWikiCss } from '../mediawiki-css.js';
import { parseAndValidate } from '../middleware/validate.js';
import { generatePreview } from '../preview.js';
import { setVersionStarred } from '../services/versions.js';

/** REST endpoints for document CRUD, preview, and versioning. */
const docs = new Hono();

async function refreshDocumentMediaWikiCss(documentId: string, apiUrl: string): Promise<void> {
  const css = await fetchMediaWikiCss(apiUrl);
  if (css === null) return;

  db.update(schema.documents)
    .set({ mediawiki_instance_css: css })
    .where(
      and(
        eq(schema.documents.id, documentId),
        eq(schema.documents.mediawiki_instance_api_url, apiUrl)
      )
    )
    .run();
}

function refreshDocumentMediaWikiCssInBackground(documentId: string, apiUrl: string): void {
  void refreshDocumentMediaWikiCss(documentId, apiUrl).catch((err) => {
    console.error('Failed to refresh MediaWiki CSS:', err);
  });
}

docs.get('/', (c) => {
  const allDocs = db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.visibility, 'public'))
    .all();
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
    mediawiki_instance_name: body.mediawiki_instance_api_url
      ? (body.mediawiki_instance_name ?? null)
      : null,
    mediawiki_instance_api_url: body.mediawiki_instance_api_url ?? null,
    mediawiki_instance_css: null,
    restored_version_id: null,
    visibility: body.visibility || 'public',
  };

  db.insert(schema.documents).values(doc).run();
  if (doc.mediawiki_instance_api_url) {
    refreshDocumentMediaWikiCssInBackground(doc.id, doc.mediawiki_instance_api_url);
  }
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
  if (body.expiry !== undefined) updates.expiry = body.expiry;
  if (body.visibility !== undefined) updates.visibility = body.visibility;

  if (body.mediawiki_instance_api_url !== undefined) {
    if (body.mediawiki_instance_api_url === null) {
      updates.mediawiki_instance_name = null;
      updates.mediawiki_instance_api_url = null;
      updates.mediawiki_instance_css = null;
    } else {
      updates.mediawiki_instance_api_url = body.mediawiki_instance_api_url;
      updates.mediawiki_instance_name = body.mediawiki_instance_name ?? null;
    }
  } else if (body.mediawiki_instance_name !== undefined) {
    updates.mediawiki_instance_name = body.mediawiki_instance_name;
  }

  const updateResult = db
    .update(schema.documents)
    .set(updates)
    .where(eq(schema.documents.id, id))
    .run();

  if (updateResult.changes === 0) {
    return c.json({ error: 'Document not found' }, 404);
  }

  const doc = getDocumentById(id);
  if (body.mediawiki_instance_api_url) {
    refreshDocumentMediaWikiCssInBackground(id, body.mediawiki_instance_api_url);
  }
  return c.json(doc);
});

docs.post('/:id/preview', async (c) => {
  const id = c.req.param('id');
  const result = await parseAndValidate(c, PreviewSchema);
  if (!result.success) return result.response;
  const { wikitext, page } = result.data;

  const doc = getDocumentById(id);
  if (!doc) return c.json({ error: 'Document not found' }, 404);

  try {
    const { html, sourceMap } = await generatePreview(
      wikitext,
      doc.mediawiki_instance_api_url,
      page,
      id
    );
    return c.json({ html, sourceMap, css: doc.mediawiki_instance_css });
  } catch (err) {
    console.error('Preview generation failed:', err);
    return c.json({
      html: '<p class="text-red-500">Failed to generate preview</p>',
      sourceMap: [],
      css: doc.mediawiki_instance_css,
    });
  }
});

docs.get('/:id/versions', (c) => {
  const id = c.req.param('id');
  const versions = db
    .select()
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
  const id = c.req.param('id');
  const vId = c.req.param('v');
  const updated = setVersionStarred(vId, true, id, { db, schema, getVersionById });
  if (!updated) {
    return c.json({ error: 'Version not found' }, 404);
  }
  return c.json({ success: true });
});

docs.delete('/:id/versions/:v/star', (c) => {
  const id = c.req.param('id');
  const vId = c.req.param('v');
  const updated = setVersionStarred(vId, false, id, { db, schema, getVersionById });
  if (!updated) {
    return c.json({ error: 'Version not found' }, 404);
  }
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

export default docs;
