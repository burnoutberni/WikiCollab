import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

import { logger } from '../logging.js';
import * as schema from './schema.js';

const dbPath = process.env.DATABASE_PATH || 'wikicollab.db';
mkdirSync(dirname(dbPath), { recursive: true });
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
`);

// Migration: add starred column to existing document_revisions tables
try {
  sqlite.exec(`ALTER TABLE document_revisions ADD COLUMN starred INTEGER NOT NULL DEFAULT 0`);
} catch (err: unknown) {
  if (!String((err as Error)?.message).includes('duplicate column')) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(
      {
        migration: 'document_revisions.starred',
        err: error,
      },
      'Migration failed'
    );
  }
}

// Migration: add per-document MediaWiki instance fields.
for (const [column, definition] of [
  ['mediawiki_instance_name', 'TEXT'],
  ['mediawiki_instance_api_url', 'TEXT'],
  ['mediawiki_instance_css', 'TEXT'],
] as const) {
  try {
    sqlite.exec(`ALTER TABLE documents ADD COLUMN ${column} ${definition}`);
  } catch (err: unknown) {
    if (!String((err as Error)?.message).includes('duplicate column')) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error({ migration: `documents.${column}`, err: error }, 'Migration failed');
    }
  }
}

// Migration: add restored_version_id column to existing documents tables
try {
  sqlite.exec(`ALTER TABLE documents ADD COLUMN restored_version_id TEXT`);
} catch (err: unknown) {
  if (!String((err as Error)?.message).includes('duplicate column')) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(
      {
        migration: 'documents.restored_version_id',
        err: error,
      },
      'Migration failed'
    );
  }
}

// Migration: add visibility column to existing documents tables
try {
  sqlite.exec(`ALTER TABLE documents ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'`);
} catch (err: unknown) {
  if (!String((err as Error)?.message).includes('duplicate column')) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error({ migration: 'documents.visibility', err: error }, 'Migration failed');
  }
}

/** Shared Drizzle client backed by the process-local SQLite database. */
export const db = drizzle(sqlite, { schema });
export { schema };
