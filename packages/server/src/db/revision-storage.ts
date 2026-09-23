import type Database from 'better-sqlite3';

/** Additive migration: existing base64 states remain untouched and default to snapshots. */
export function migrateRevisionStorage(sqlite: Database.Database): void {
  const columns = sqlite.pragma('table_info(document_revisions)') as { name: string }[];
  if (!columns.some(({ name }) => name === 'kind')) {
    sqlite.exec("ALTER TABLE document_revisions ADD COLUMN kind TEXT NOT NULL DEFAULT 'snapshot'");
  }
  if (!columns.some(({ name }) => name === 'payload')) {
    sqlite.exec('ALTER TABLE document_revisions ADD COLUMN payload BLOB');
  }
  sqlite.exec(`CREATE INDEX IF NOT EXISTS document_revisions_history
    ON document_revisions(document_id, created_at, id)`);
}
