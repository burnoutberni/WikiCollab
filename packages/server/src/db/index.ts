import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

const dbPath = process.env.DATABASE_PATH || 'wiki-colab.db';
const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'Untitled',
    content TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    expiry TEXT,
    mediawiki_instance_id TEXT
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

// Migration: add css column to existing mediawiki_instances tables
try {
  sqlite.exec(`ALTER TABLE mediawiki_instances ADD COLUMN css TEXT`);
} catch {
  // Column already exists, ignore
}

// Migration: add starred column to existing document_revisions tables
try {
  sqlite.exec(`ALTER TABLE document_revisions ADD COLUMN starred INTEGER NOT NULL DEFAULT 0`);
} catch {
  // Column already exists, ignore
}

export const db = drizzle(sqlite, { schema });
export { schema };
