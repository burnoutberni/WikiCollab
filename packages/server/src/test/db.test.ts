import { describe, it, expect } from 'vitest';
import { createTestDb } from './setup.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';

describe('Database schema', () => {
  it('can insert and query documents', () => {
    const db = createTestDb();
    db.insert(schema.documents).values({
      id: 'test1',
      title: 'Test Document',
      content: 'Hello world',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    }).run();

    const result = db.select().from(schema.documents).where(eq(schema.documents.id, 'test1')).get();
    expect(result).toBeDefined();
    expect(result!.title).toBe('Test Document');
    expect(result!.content).toBe('Hello world');
  });

  it('can insert and query mediawiki_instances', () => {
    const db = createTestDb();
    db.insert(schema.mediawikiInstances).values({
      id: 'inst1',
      name: 'Wikipedia',
      api_url: 'https://en.wikipedia.org/w/api.php',
      configured_at: '2025-01-01T00:00:00Z',
    }).run();

    const result = db.select().from(schema.mediawikiInstances)
      .where(eq(schema.mediawikiInstances.id, 'inst1')).get();
    expect(result).toBeDefined();
    expect(result!.name).toBe('Wikipedia');
  });

  it('can insert and query document_revisions', () => {
    const db = createTestDb();
    db.insert(schema.documents).values({
      id: 'doc1',
      title: 'Parent Doc',
      content: 'content',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    }).run();

    db.insert(schema.documentRevisions).values({
      id: 'rev1',
      document_id: 'doc1',
      yjs_state: 'base64data',
      starred: false,
      created_at: '2025-01-01T00:00:00Z',
    }).run();

    const result = db.select().from(schema.documentRevisions)
      .where(eq(schema.documentRevisions.id, 'rev1')).get();
    expect(result).toBeDefined();
    expect(result!.document_id).toBe('doc1');
    expect(result!.starred).toBe(false);
  });

  it('enforces foreign key constraints', () => {
    const db = createTestDb();
    expect(() => {
      db.insert(schema.documentRevisions).values({
        id: 'rev2',
        document_id: 'nonexistent',
        starred: false,
        created_at: '2025-01-01T00:00:00Z',
      }).run();
    }).toThrow();
  });
});
