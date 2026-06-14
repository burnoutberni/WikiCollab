import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';

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
