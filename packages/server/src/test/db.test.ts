import { eq, sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import * as schema from '../db/schema.js';
import { createTestDb } from './setup.js';

describe('Database schema', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('can insert and query documents', () => {
    const { db, close } = createTestDb();
    cleanup = close;

    db.insert(schema.documents)
      .values({
        id: 'test1',
        title: 'Test Document',
        content: 'Hello world',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      })
      .run();

    const result = db.select().from(schema.documents).where(eq(schema.documents.id, 'test1')).get();
    expect(result).toBeDefined();
    expect(result!.title).toBe('Test Document');
    expect(result!.content).toBe('Hello world');
  });

  it('can insert and query mediawiki_instances', () => {
    const { db, close } = createTestDb();
    cleanup = close;

    db.insert(schema.mediawikiInstances)
      .values({
        id: 'inst1',
        name: 'Wikipedia',
        api_url: 'https://en.wikipedia.org/w/api.php',
        configured_at: '2025-01-01T00:00:00Z',
      })
      .run();

    const result = db
      .select()
      .from(schema.mediawikiInstances)
      .where(eq(schema.mediawikiInstances.id, 'inst1'))
      .get();
    expect(result).toBeDefined();
    expect(result!.name).toBe('Wikipedia');
  });

  it('can insert and query document_revisions', () => {
    const { db, close } = createTestDb();
    cleanup = close;

    db.insert(schema.documents)
      .values({
        id: 'doc1',
        title: 'Parent Doc',
        content: 'content',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      })
      .run();

    db.insert(schema.documentRevisions)
      .values({
        id: 'rev1',
        document_id: 'doc1',
        yjs_state: 'base64data',
        starred: false,
        created_at: '2025-01-01T00:00:00Z',
      })
      .run();

    const result = db
      .select()
      .from(schema.documentRevisions)
      .where(eq(schema.documentRevisions.id, 'rev1'))
      .get();
    expect(result).toBeDefined();
    expect(result!.document_id).toBe('doc1');
    expect(result!.starred).toBe(false);
  });

  it('enforces document_revisions foreign key constraint', () => {
    const { db, close } = createTestDb();
    cleanup = close;

    expect(() => {
      db.insert(schema.documentRevisions)
        .values({
          id: 'rev2',
          document_id: 'nonexistent',
          starred: false,
          created_at: '2025-01-01T00:00:00Z',
        })
        .run();
    }).toThrow();
  });

  it('enforces template_cache foreign key constraint', () => {
    const { db, close } = createTestDb();
    cleanup = close;

    expect(() => {
      db.insert(schema.templateCache)
        .values({
          id: 'tc1',
          instance_id: 'nonexistent',
          template_name: 'Infobox',
          template_data: '{}',
          fetched_at: '2025-01-01T00:00:00Z',
        })
        .run();
    }).toThrow();
  });

  it('cascades delete from documents to document_revisions', () => {
    const { db, close } = createTestDb();
    cleanup = close;

    db.insert(schema.documents)
      .values({
        id: 'doc-cascade',
        title: 'Cascade Test',
        content: 'content',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      })
      .run();

    db.insert(schema.documentRevisions)
      .values({
        id: 'rev-cascade-1',
        document_id: 'doc-cascade',
        yjs_state: 'base64data',
        starred: false,
        created_at: '2025-01-01T00:00:00Z',
      })
      .run();

    db.insert(schema.documentRevisions)
      .values({
        id: 'rev-cascade-2',
        document_id: 'doc-cascade',
        yjs_state: 'base64data',
        starred: true,
        created_at: '2025-01-01T00:00:01Z',
      })
      .run();

    db.delete(schema.documents).where(eq(schema.documents.id, 'doc-cascade')).run();

    const remainingRevisions = db
      .select()
      .from(schema.documentRevisions)
      .where(eq(schema.documentRevisions.document_id, 'doc-cascade'))
      .all();
    expect(remainingRevisions).toHaveLength(0);
  });

  it('cascade does not delete unrelated documents', () => {
    const { db, close } = createTestDb();
    cleanup = close;

    db.insert(schema.documents)
      .values({
        id: 'to-delete',
        title: 'To Delete',
        content: 'content',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      })
      .run();

    db.insert(schema.documents)
      .values({
        id: 'to-keep',
        title: 'To Keep',
        content: 'content',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      })
      .run();

    db.insert(schema.documentRevisions)
      .values({
        id: 'rev-keep',
        document_id: 'to-keep',
        yjs_state: 'base64data',
        starred: false,
        created_at: '2025-01-01T00:00:00Z',
      })
      .run();

    db.delete(schema.documents).where(eq(schema.documents.id, 'to-delete')).run();

    const remaining = db
      .select()
      .from(schema.documentRevisions)
      .where(eq(schema.documentRevisions.document_id, 'to-keep'))
      .all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('rev-keep');
  });

  it('handles document expiry field', () => {
    const { db, close } = createTestDb();
    cleanup = close;

    db.insert(schema.documents)
      .values({
        id: 'expired-doc',
        title: 'Expired',
        content: 'content',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        expiry: '2020-01-01T00:00:00Z',
      })
      .run();

    db.insert(schema.documents)
      .values({
        id: 'active-doc',
        title: 'Active',
        content: 'content',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        expiry: '2030-01-01T00:00:00Z',
      })
      .run();

    db.insert(schema.documents)
      .values({
        id: 'no-expiry-doc',
        title: 'No Expiry',
        content: 'content',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        expiry: null,
      })
      .run();

    const expiredDocs = db
      .select()
      .from(schema.documents)
      .where(sql`expiry IS NOT NULL AND datetime(expiry) < datetime('now')`)
      .all();
    expect(expiredDocs).toHaveLength(1);
    expect(expiredDocs[0].id).toBe('expired-doc');
  });

  it('handles many sequential reads', () => {
    const { db, close } = createTestDb();
    cleanup = close;

    db.insert(schema.documents)
      .values({
        id: 'concurrent-doc',
        title: 'Concurrent Test',
        content: 'content',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      })
      .run();

    const results = Array.from({ length: 10 }, () =>
      db.select().from(schema.documents).where(eq(schema.documents.id, 'concurrent-doc')).get()
    );
    expect(results).toHaveLength(10);
    results.forEach((r) => expect(r!.id).toBe('concurrent-doc'));
  });
});
