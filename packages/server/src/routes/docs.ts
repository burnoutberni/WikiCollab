import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { CreateDocumentSchema, PreviewSchema, UpdateDocumentSchema } from 'shared';

import { getDocumentById, getVersionById } from '../db/helpers.js';
import { db, schema } from '../db/index.js';
import { logger } from '../logging.js';
import { botSessionCookie } from '../mediawiki-bot-auth.js';
import { fetchMediaWikiCssAndUrlMetadata } from '../mediawiki-css.js';
import { type MediaWikiAuth, validateMediaWikiConfig } from '../mediawiki-http.js';
import { currentUserId } from '../middleware/auth.js';
import { decryptSecret, encryptSecret } from '../middleware/encryption.js';
import { parseAndValidate } from '../middleware/validate.js';
import { generatePreview } from '../preview.js';
import { reconstructRevisionContent, revisionMetadata } from '../services/revision-storage.js';
import { setVersionStarred } from '../services/versions.js';
/** REST endpoints for document CRUD, preview, and versioning. */
const docs = new Hono();
type CssRefresh = { apiUrl: string; nextApiUrl: string | null; promise: Promise<void> };
const inFlightCssRefreshes = new Map<string, CssRefresh>();
function apiDocument(doc: ReturnType<typeof getDocumentById>, userId: string | null) {
  if (!doc) return doc;
  const {
    mediawiki_api_key: encryptedKey,
    mediawiki_bot_password: encryptedPassword,
    ...safe
  } = doc;
  return {
    ...safe,
    is_owner: Boolean(userId && doc.owner_user_id === userId),
    has_mediawiki_api_key: Boolean(encryptedKey),
    has_mediawiki_bot_password: Boolean(encryptedPassword),
  };
}
function documentApiKey(doc: ReturnType<typeof getDocumentById>): string | null {
  return doc?.mediawiki_api_key ? decryptSecret(doc.mediawiki_api_key) : null;
}

export async function documentMediaWikiAuth(
  doc: ReturnType<typeof getDocumentById>
): Promise<MediaWikiAuth> {
  if (!doc?.mediawiki_instance_api_url) return null;
  if (doc.mediawiki_bot_username && doc.mediawiki_bot_password) {
    const cookie = await botSessionCookie(doc.mediawiki_instance_api_url, {
      username: doc.mediawiki_bot_username,
      password: decryptSecret(doc.mediawiki_bot_password),
    });
    return { cookie };
  }
  return documentApiKey(doc);
}

async function proposedMediaWikiAuth(
  apiUrl: string,
  username: string | null | undefined,
  password: string | null | undefined,
  bearer: string | null | undefined
): Promise<MediaWikiAuth> {
  if (username && password) {
    return { cookie: await botSessionCookie(apiUrl, { username, password }, true) };
  }
  return bearer ?? null;
}

function clearMediaWikiInstance(docId: string): void {
  db.update(schema.documents)
    .set({
      mediawiki_instance_name: null,
      mediawiki_instance_api_url: null,
      mediawiki_instance_css: null,
      mediawiki_api_key: null,
      mediawiki_bot_username: null,
      mediawiki_bot_password: null,
      mediawiki_canonical_server: null,
      mediawiki_article_path: null,
      mediawiki_script_path: null,
    })
    .where(eq(schema.documents.id, docId))
    .run();
}
async function refreshDocumentMediaWikiCss(documentId: string, apiUrl: string): Promise<void> {
  const doc = getDocumentById(documentId);
  const { css, urlMetadata } = await fetchMediaWikiCssAndUrlMetadata(
    apiUrl,
    await documentMediaWikiAuth(doc)
  );
  const updates: Record<string, string | null> = {};
  if (urlMetadata.fetched) {
    updates.mediawiki_canonical_server = urlMetadata.server;
    updates.mediawiki_article_path = urlMetadata.articlePath;
    updates.mediawiki_script_path = urlMetadata.scriptPath;
  }
  if (css !== null) updates.mediawiki_instance_css = css;
  if (Object.keys(updates).length === 0) return;
  db.update(schema.documents)
    .set(updates)
    .where(
      and(
        eq(schema.documents.id, documentId),
        eq(schema.documents.mediawiki_instance_api_url, apiUrl)
      )
    )
    .run();
}
function refreshDocumentMediaWikiCssInBackground(documentId: string, apiUrl: string): void {
  const current = inFlightCssRefreshes.get(documentId);
  if (current) {
    if (current.apiUrl === apiUrl) {
      current.nextApiUrl = null;
      return;
    }
    current.nextApiUrl = apiUrl;
    return;
  }
  const promise = refreshDocumentMediaWikiCss(documentId, apiUrl)
    .catch((err) => {
      logger.error(
        { docId: documentId, apiUrl, err: err.message },
        'Failed to refresh MediaWiki CSS'
      );
    })
    .finally(() => {
      const nextApiUrl = inFlightCssRefreshes.get(documentId)?.nextApiUrl;
      inFlightCssRefreshes.delete(documentId);
      if (nextApiUrl) refreshDocumentMediaWikiCssInBackground(documentId, nextApiUrl);
    });
  inFlightCssRefreshes.set(documentId, { apiUrl, nextApiUrl: null, promise });
}
export async function drainDocumentMediaWikiCssRefreshesForTest(): Promise<void> {
  for (let i = 0; i < 10 && inFlightCssRefreshes.size > 0; i++) {
    await Promise.all(Array.from(inFlightCssRefreshes.values(), (refresh) => refresh.promise));
  }
}
docs.get('/', (c) => {
  const userId = currentUserId(c);
  const where = userId
    ? or(eq(schema.documents.visibility, 'public'), eq(schema.documents.owner_user_id, userId))
    : eq(schema.documents.visibility, 'public');
  const allDocs = db.select().from(schema.documents).where(where).all();
  return c.json(allDocs.map((doc) => apiDocument(doc, userId)));
});
docs.post('/', async (c) => {
  const result = await parseAndValidate(c, CreateDocumentSchema);
  if (!result.success) return result.response;
  const body = result.data;
  const userId = currentUserId(c);
  if (!userId) {
    return c.json({ error: 'Authentication required to create documents' }, 401);
  }
  if (body.mediawiki_instance_api_url) {
    let auth: MediaWikiAuth;
    try {
      auth = await proposedMediaWikiAuth(
        body.mediawiki_instance_api_url,
        body.mediawiki_bot_username,
        body.mediawiki_bot_password,
        body.mediawiki_api_key
      );
    } catch {
      return c.json({ error: 'Invalid MediaWiki Bot Password credentials or login failed.' }, 400);
    }
    const validation = await validateMediaWikiConfig(body.mediawiki_instance_api_url, auth);
    if (!validation.ok) {
      const status = validation.status === 429 ? 429 : 400;
      return c.json({ error: validation.error ?? 'Invalid MediaWiki instance config.' }, status);
    }
  }
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
    mediawiki_canonical_server: null,
    mediawiki_article_path: null,
    mediawiki_script_path: null,
    restored_version_id: null,
    visibility: body.visibility || 'public',
    owner_user_id: userId,
    mediawiki_api_key: body.mediawiki_api_key ? encryptSecret(body.mediawiki_api_key) : null,
    mediawiki_bot_username: body.mediawiki_bot_username ?? null,
    mediawiki_bot_password: body.mediawiki_bot_password
      ? encryptSecret(body.mediawiki_bot_password)
      : null,
  };
  db.insert(schema.documents).values(doc).run();
  if (doc.mediawiki_instance_api_url) {
    refreshDocumentMediaWikiCssInBackground(doc.id, doc.mediawiki_instance_api_url);
  }
  return c.json(apiDocument(doc, userId), 201);
});
docs.get('/:id', (c) => {
  const id = c.req.param('id');
  const userId = currentUserId(c);
  let doc = getDocumentById(id);
  if (!doc) {
    return c.json({ error: 'Document not found' }, 404);
  }
  if (userId && doc.owner_user_id === null) {
    db.update(schema.documents)
      .set({ owner_user_id: userId })
      .where(and(eq(schema.documents.id, id), isNull(schema.documents.owner_user_id)))
      .run();
    doc = getDocumentById(id);
  }
  return c.json(apiDocument(doc, userId));
});
docs.delete('/:id', (c) => {
  const id = c.req.param('id');
  const userId = currentUserId(c);
  const doc = getDocumentById(id);
  if (!doc) return c.json({ error: 'Document not found' }, 404);
  if (!userId) return c.json({ error: 'Authentication required' }, 401);
  if (doc.owner_user_id !== userId) {
    return c.json({ error: 'Only the owner may delete this document' }, 403);
  }
  const result = db
    .delete(schema.documents)
    .where(and(eq(schema.documents.id, id), eq(schema.documents.owner_user_id, userId)))
    .run();
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
  const existingDoc = getDocumentById(id);
  if (!existingDoc) {
    return c.json({ error: 'Document not found' }, 404);
  }
  const userId = currentUserId(c);
  const changesOwnerSettings =
    body.visibility !== undefined ||
    body.mediawiki_instance_name !== undefined ||
    body.mediawiki_instance_api_url !== undefined ||
    body.mediawiki_api_key !== undefined ||
    body.mediawiki_bot_username !== undefined ||
    body.mediawiki_bot_password !== undefined;
  if (changesOwnerSettings) {
    if (!userId) return c.json({ error: 'Authentication required' }, 401);
    if (existingDoc.owner_user_id !== userId) {
      return c.json({ error: 'Only the owner may change document settings' }, 403);
    }
  }
  const targetApiUrl =
    body.mediawiki_instance_api_url === undefined
      ? existingDoc.mediawiki_instance_api_url
      : body.mediawiki_instance_api_url;
  const changesMediaWikiConnection =
    body.mediawiki_instance_api_url !== undefined ||
    body.mediawiki_api_key !== undefined ||
    body.mediawiki_bot_username !== undefined ||
    body.mediawiki_bot_password !== undefined;
  const originChanged = Boolean(
    targetApiUrl && existingDoc.mediawiki_instance_api_url &&
    new URL(targetApiUrl).origin !== new URL(existingDoc.mediawiki_instance_api_url).origin
  );
  if (originChanged) {
    if (body.mediawiki_api_key === undefined) updates.mediawiki_api_key = null;
    if (body.mediawiki_bot_password === undefined) updates.mediawiki_bot_password = null;
    if (body.mediawiki_bot_username === undefined) updates.mediawiki_bot_username = null;
  }
  if (targetApiUrl && changesMediaWikiConnection) {
    const username =
      body.mediawiki_bot_username !== undefined
        ? body.mediawiki_bot_username
        : originChanged ? null : existingDoc.mediawiki_bot_username;
    const password =
      body.mediawiki_bot_password !== undefined
        ? body.mediawiki_bot_password
        : existingDoc.mediawiki_bot_password && !originChanged
          ? decryptSecret(existingDoc.mediawiki_bot_password)
          : null;
    const bearer =
      body.mediawiki_api_key !== undefined ? body.mediawiki_api_key : originChanged ? null : documentApiKey(existingDoc);
    let auth: MediaWikiAuth;
    try {
      auth = await proposedMediaWikiAuth(targetApiUrl, username, password, bearer);
    } catch {
      return c.json({ error: 'Invalid MediaWiki Bot Password credentials or login failed.' }, 400);
    }
    const validation = await validateMediaWikiConfig(targetApiUrl, auth);
    if (!validation.ok) {
      return c.json(
        { error: validation.error ?? 'Invalid MediaWiki instance config.' },
        validation.status === 429 ? 429 : 400
      );
    }
  }
  if (body.title !== undefined) updates.title = body.title;
  if (body.expiry !== undefined) updates.expiry = body.expiry;
  if (body.visibility !== undefined) updates.visibility = body.visibility;
  if (body.mediawiki_bot_username !== undefined)
    updates.mediawiki_bot_username = body.mediawiki_bot_username;
  if (body.mediawiki_bot_password !== undefined)
    updates.mediawiki_bot_password = body.mediawiki_bot_password
      ? encryptSecret(body.mediawiki_bot_password)
      : null;
  if (body.mediawiki_api_key !== undefined) {
    updates.mediawiki_api_key = body.mediawiki_api_key
      ? encryptSecret(body.mediawiki_api_key)
      : null;
  }
  if (body.mediawiki_instance_api_url !== undefined) {
    if (body.mediawiki_instance_api_url === null) {
      updates.mediawiki_instance_name = null;
      updates.mediawiki_instance_api_url = null;
      updates.mediawiki_instance_css = null;
      updates.mediawiki_api_key = null;
      updates.mediawiki_bot_username = null;
      updates.mediawiki_bot_password = null;
      updates.mediawiki_canonical_server = null;
      updates.mediawiki_article_path = null;
      updates.mediawiki_script_path = null;
    } else {
      updates.mediawiki_instance_api_url = body.mediawiki_instance_api_url;
      if (body.mediawiki_instance_name !== undefined) {
        updates.mediawiki_instance_name = body.mediawiki_instance_name;
      }
      if (body.mediawiki_instance_api_url !== existingDoc.mediawiki_instance_api_url) {
        updates.mediawiki_instance_css = null;
        updates.mediawiki_canonical_server = null;
        updates.mediawiki_article_path = null;
        updates.mediawiki_script_path = null;
      }
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
  const refreshApiUrl =
    body.mediawiki_instance_api_url ??
    (body.mediawiki_api_key !== undefined ||
    body.mediawiki_bot_username !== undefined ||
    body.mediawiki_bot_password !== undefined
      ? doc?.mediawiki_instance_api_url
      : null);
  if (refreshApiUrl) {
    refreshDocumentMediaWikiCssInBackground(id, refreshApiUrl);
  }
  return c.json(apiDocument(doc, userId));
});
docs.post('/:id/preview', async (c) => {
  const id = c.req.param('id');
  const result = await parseAndValidate(c, PreviewSchema);
  if (!result.success) return result.response;
  const { wikitext, page } = result.data;
  const doc = getDocumentById(id);
  if (!doc) return c.json({ error: 'Document not found' }, 404);
  if (doc.mediawiki_instance_api_url && !doc.mediawiki_instance_css) {
    refreshDocumentMediaWikiCssInBackground(id, doc.mediawiki_instance_api_url);
  }
  try {
    const { html, renderer, remoteStatusCode } = await generatePreview(
      wikitext,
      doc.mediawiki_instance_api_url,
      page,
      id,
      doc.mediawiki_canonical_server,
      await documentMediaWikiAuth(doc)
    );
    return c.json({ html, css: doc.mediawiki_instance_css, renderer, remoteStatusCode });
  } catch (err) {
    logger.error(
      { docId: id, err: err instanceof Error ? err.message : String(err) },
      'Preview generation failed'
    );
    return c.json({
      html: '<p class="text-red-500">Failed to generate preview</p>',
      css: doc.mediawiki_instance_css,
      renderer: doc.mediawiki_instance_api_url ? 'error' : 'local',
    });
  }
});
docs.get('/:id/versions', (c) => {
  const id = c.req.param('id');
  const versions = db
    .select(revisionMetadata)
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
  if (!version || version.document_id !== c.req.param('id')) {
    return c.json({ error: 'Version not found' }, 404);
  }
  try {
    const content = reconstructRevisionContent(version);
    db.update(schema.documents)
      .set({ restored_version_id: vId })
      .where(eq(schema.documents.id, id))
      .run();
    return c.json({ success: true, content });
  } catch (err) {
    logger.error(
      { docId: id, err: err instanceof Error ? err.message : String(err) },
      'Failed to decode version for restore'
    );
    return c.json({ error: 'Failed to restore version' }, 500);
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
  if (!version || version.document_id !== c.req.param('id')) {
    return c.json({ error: 'Version not found' }, 404);
  }
  try {
    const content = reconstructRevisionContent(version);
    return c.json({ content });
  } catch (error) {
    logger.error(
      { versionId: vId, err: error instanceof Error ? error.message : String(error) },
      'Failed to decode version for preview'
    );
    return c.json({ content: '' });
  }
});
export default docs;
