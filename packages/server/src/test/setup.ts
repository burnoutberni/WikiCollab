import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import * as schema from '../db/schema.js';

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'Untitled',
    content TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    expiry TEXT,
    mediawiki_instance_name TEXT,
    mediawiki_instance_api_url TEXT,
    mediawiki_instance_css TEXT,
    restored_version_id TEXT,
    visibility TEXT NOT NULL DEFAULT 'public'
  );
  CREATE TABLE IF NOT EXISTS document_revisions (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    yjs_state TEXT,
    starred INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

export interface TestDb {
  db: ReturnType<typeof drizzle>;
  close: () => void;
}

export function createTestDb(): TestDb {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(SCHEMA_SQL);
  const db = drizzle(sqlite, { schema });
  return {
    db,
    close: () => sqlite.close(),
  };
}
