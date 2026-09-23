import Database from 'better-sqlite3';
import { asc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { migrateRevisionStorage } from '../db/revision-storage.js';
import * as schema from '../db/schema.js';
import { createTestDb } from './setup.js';

const { mockDbModule } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockDbModule: { db: null as any, schema: null as any },
}));
vi.mock('../db/index.js', () => mockDbModule);
vi.mock('../ws/connection.js', () => ({ broadcastCustom: vi.fn() }));

import docsRoutes from '../routes/docs.js';
import { reconstructRevisionContent } from '../services/revision-storage.js';
import type { WSSharedDoc } from '../ws/connection.js';
import {
  flushSaveTimers,
  getPersistence,
  initContentInitializor,
  initPersistence,
  runContentInitializor,
} from '../ws/persistence.js';

const documentId = 'history-doc';

describe('Checkpointed revision history', () => {
  let testDb: ReturnType<typeof createTestDb>;
  let app: Hono;
  const docs: WSSharedDoc[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T12:00:00.000Z'));
    testDb = createTestDb();
    mockDbModule.db = testDb.db;
    mockDbModule.schema = schema;
    testDb.db.insert(schema.documents).values({ id: documentId }).run();
    app = new Hono().route('/api/docs', docsRoutes);
    initContentInitializor();
    initPersistence();
  });

  afterEach(() => {
    for (const doc of docs.splice(0)) {
      flushSaveTimers(doc.name, doc);
      doc.destroy();
    }
    testDb.close();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  async function openDoc() {
    const doc = Object.assign(new Y.Doc(), { name: documentId }) as WSSharedDoc;
    docs.push(doc);
    await runContentInitializor(doc);
    getPersistence()!.bindState(documentId, doc);
    return doc;
  }

  function revisions() {
    return testDb.db
      .select()
      .from(schema.documentRevisions)
      .where(eq(schema.documentRevisions.document_id, documentId))
      .orderBy(asc(schema.documentRevisions.created_at), asc(schema.documentRevisions.id))
      .all();
  }

  function save(doc: WSSharedDoc, text: string) {
    doc.getText('wikitext').insert(doc.getText('wikitext').length, text);
    flushSaveTimers(documentId, doc);
    return revisions().at(-1)!;
  }

  async function expectPreviewAndRestore(id: string, content: string) {
    const preview = await app.request(`/api/docs/${documentId}/versions/${id}/preview`);
    expect(preview.status).toBe(200);
    expect(await preview.json()).toEqual({ content });
    const restore = await app.request(`/api/docs/${documentId}/versions/${id}/restore`, {
      method: 'POST',
    });
    expect(restore.status).toBe(200);
    expect(await restore.json()).toEqual({ success: true, content });
    expect(testDb.db.select().from(schema.documents).get()!.restored_version_id).toBe(id);
  }

  function insertLegacy(text: string) {
    const doc = new Y.Doc();
    doc.getText('wikitext').insert(0, text);
    testDb.db
      .insert(schema.documentRevisions)
      .values({
        id: 'legacy',
        document_id: documentId,
        yjs_state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),
        created_at: '2026-09-22T12:00:00.000Z',
      })
      .run();
    testDb.db
      .update(schema.documents)
      .set({ content: text })
      .where(eq(schema.documents.id, documentId))
      .run();
    doc.destroy();
  }

  it('lists only metadata for legacy snapshots, BLOB checkpoints, and deltas', async () => {
    insertLegacy('legacy');
    vi.stubEnv('REVISION_SNAPSHOT_INTERVAL', '2');
    const doc = await openDoc();
    save(doc, ' delta');
    save(doc, ' checkpoint');
    const res = await app.request(`/api/docs/${documentId}/versions`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(
      revisions()
        .reverse()
        .map(({ id, document_id, kind, starred, created_at }) => ({
          id,
          document_id,
          kind,
          starred,
          created_at,
        }))
    );
  });

  it('previews/restores legacy snapshots and deltas based on them', async () => {
    insertLegacy('legacy');
    const doc = await openDoc();
    const delta = save(doc, ' plus delta');
    expect(delta.kind).toBe('delta');
    await expectPreviewAndRestore('legacy', 'legacy');
    await expectPreviewAndRestore(delta.id, 'legacy plus delta');
  });

  it('does not mark a version restored when reconstruction fails', async () => {
    testDb.db
      .update(schema.documents)
      .set({ restored_version_id: 'previous' })
      .where(eq(schema.documents.id, documentId))
      .run();
    testDb.db
      .insert(schema.documentRevisions)
      .values({
        id: 'corrupt',
        document_id: documentId,
        kind: 'snapshot',
        payload: Buffer.from('broken'),
        created_at: '2026-09-22T12:00:00.000Z',
      })
      .run();

    const restore = await app.request(`/api/docs/${documentId}/versions/corrupt/restore`, {
      method: 'POST',
    });

    expect(restore.status).toBe(500);
    expect(await restore.json()).toEqual({ error: 'Failed to restore version' });
    expect(testDb.db.select().from(schema.documents).get()!.restored_version_id).toBe('previous');
  });

  it('merges debounce updates into one binary delta, including deletions', async () => {
    const doc = await openDoc();
    const snapshot = save(doc, 'Hello world');
    const updates: Uint8Array[] = [];
    doc.on('update', (update: Uint8Array) => updates.push(update));
    doc.getText('wikitext').delete(5, 6);
    vi.advanceTimersByTime(600);
    doc.getText('wikitext').insert(5, ' Wiki');
    vi.advanceTimersByTime(999);
    expect(revisions()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    const delta = revisions()[1];
    expect(delta.kind).toBe('delta');
    expect(delta.yjs_state).toBeNull();
    expect(delta.payload).toEqual(Buffer.from(Y.mergeUpdates(updates)));
    expect(
      testDb.db
        .select({ type: sql<string>`typeof(payload)` })
        .from(schema.documentRevisions)
        .all()
    ).toEqual([{ type: 'blob' }, { type: 'blob' }]);
    await expectPreviewAndRestore(snapshot.id, 'Hello world');
    await expectPreviewAndRestore(delta.id, 'Hello Wiki');
  });

  it('replays only the nearest checkpoint and following deltas through the target', async () => {
    vi.stubEnv('REVISION_SNAPSHOT_INTERVAL', '2');
    const doc = await openDoc();
    const first = save(doc, 'one');
    save(doc, ' two');
    const checkpoint = save(doc, ' three');
    const target = save(doc, ' four');
    save(doc, ' five');
    expect(revisions().map(({ kind }) => kind)).toEqual([
      'snapshot',
      'delta',
      'snapshot',
      'delta',
      'snapshot',
    ]);
    // Earlier corruption must not affect a later independent checkpoint.
    testDb.db
      .update(schema.documentRevisions)
      .set({ payload: Buffer.from('broken') })
      .where(eq(schema.documentRevisions.id, first.id))
      .run();
    await expectPreviewAndRestore(checkpoint.id, 'one two three');
    await expectPreviewAndRestore(target.id, 'one two three four');
  });

  it('checkpoints every 50 revisions by default, with monotonic timestamps', async () => {
    const doc = await openDoc();
    for (let i = 0; i < 52; i++) save(doc, 'x');
    const rows = revisions();
    expect(rows.filter(({ kind }) => kind === 'snapshot').map((row) => rows.indexOf(row))).toEqual([
      0, 50,
    ]);
    expect(new Set(rows.map(({ created_at }) => created_at)).size).toBe(52);
    await expectPreviewAndRestore(rows[51].id, 'x'.repeat(52));
  });

  it('checkpoints when accumulated deltas exceed the configured byte threshold and resets it', async () => {
    const doc = await openDoc();
    save(doc, 'initial');
    const firstDelta = save(doc, 'a'.repeat(100));
    vi.stubEnv('REVISION_SNAPSHOT_MAX_DELTA_BYTES', String(firstDelta.payload!.length + 20));
    expect(save(doc, 'b'.repeat(100)).kind).toBe('snapshot');
    const next = save(doc, 'c'.repeat(100));
    expect(next.kind).toBe('delta');
    await expectPreviewAndRestore(
      next.id,
      'initial' + 'a'.repeat(100) + 'b'.repeat(100) + 'c'.repeat(100)
    );
  });

  it('uses the default 1 MB threshold', async () => {
    const doc = await openDoc();
    save(doc, 'initial');
    expect(save(doc, 'a'.repeat(600_000)).kind).toBe('delta');
    const checkpoint = save(doc, 'b'.repeat(600_000));
    expect(checkpoint.kind).toBe('snapshot');
    expect(reconstructRevisionContent(checkpoint)).toBe(doc.getText('wikitext').toString());
  });

  it('retains net-zero edits needed by later updates and reconnects without duplicating text', async () => {
    const doc = await openDoc();
    save(doc, 'start');
    doc.getText('wikitext').insert(5, 'temporary');
    doc.getText('wikitext').delete(5, 9);
    flushSaveTimers(documentId, doc);
    const final = save(doc, ' end');
    await expectPreviewAndRestore(final.id, 'start end');
    const reopened = await openDoc();
    expect(reopened.getText('wikitext').toString()).toBe('start end');
    expect(Y.encodeStateVector(reopened)).toEqual(Y.encodeStateVector(doc));
    const next = save(reopened, ' again');
    expect(next.kind).toBe('delta');
    await expectPreviewAndRestore(next.id, 'start end again');
  });

  it('flushes once on disconnect and creates no revision for an unchanged document', async () => {
    const doc = await openDoc();
    flushSaveTimers(documentId, doc);
    expect(revisions()).toHaveLength(0);
    doc.getText('wikitext').insert(0, 'pending');
    await getPersistence()!.writeState(documentId, doc);
    vi.advanceTimersByTime(2000);
    flushSaveTimers(documentId, doc);
    expect(revisions()).toHaveLength(1);
    await expectPreviewAndRestore(revisions()[0].id, 'pending');
  });

  it('falls back to plain text when latest revision reconstruction fails during initialization', async () => {
    testDb.db.update(schema.documents).set({ content: 'plain text fallback' }).run();
    testDb.db
      .insert(schema.documentRevisions)
      .values({
        id: 'corrupt-latest',
        document_id: documentId,
        kind: 'snapshot',
        payload: Buffer.from('broken'),
        created_at: '2026-09-22T12:00:00.000Z',
      })
      .run();

    const doc = await openDoc();

    expect(doc.getText('wikitext').toString()).toBe('plain text fallback');
    const row = save(doc, ' changed');
    expect(row.kind).toBe('snapshot');
    await expectPreviewAndRestore(row.id, 'plain text fallback changed');
  });

  it('checkpoints initial plain text when there is no usable legacy state', async () => {
    testDb.db.update(schema.documents).set({ content: 'initial' }).run();
    testDb.db
      .insert(schema.documentRevisions)
      .values({ id: 'empty', document_id: documentId })
      .run();
    const doc = await openDoc();
    expect(doc.getText('wikitext').toString()).toBe('initial');
    const row = save(doc, ' changed');
    expect(row.kind).toBe('snapshot');
    await expectPreviewAndRestore(row.id, 'initial changed');
  });

  it('rejects preview/restore through another document and isolates revision chains', async () => {
    const doc = await openDoc();
    const row = save(doc, 'mine');
    testDb.db.insert(schema.documents).values({ id: 'other' }).run();
    for (const [action, method] of [
      ['preview', 'GET'],
      ['restore', 'POST'],
    ]) {
      const response = await app.request(`/api/docs/other/versions/${row.id}/${action}`, {
        method,
      });
      expect(response.status).toBe(404);
    }
    expect(
      testDb.db.select().from(schema.documents).where(eq(schema.documents.id, 'other')).get()!
        .restored_version_id
    ).toBeNull();
  });
});

it('migrates existing legacy rows without rewriting them and is safe to run again', () => {
  const sqlite = new Database(':memory:');
  try {
    sqlite.exec(`CREATE TABLE document_revisions (id TEXT PRIMARY KEY, document_id TEXT NOT NULL,
      yjs_state TEXT, starred INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      INSERT INTO document_revisions VALUES ('legacy', 'doc', 'base64-data', 1, '2026-09-22');`);
    migrateRevisionStorage(sqlite);
    migrateRevisionStorage(sqlite);
    expect(sqlite.prepare('SELECT * FROM document_revisions').get()).toEqual({
      id: 'legacy',
      document_id: 'doc',
      yjs_state: 'base64-data',
      starred: 1,
      created_at: '2026-09-22',
      kind: 'snapshot',
      payload: null,
    });
  } finally {
    sqlite.close();
  }
});
