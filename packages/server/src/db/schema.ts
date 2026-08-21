import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Primary document records; `content` mirrors the latest persisted Yjs text. */
export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default('Untitled'),
  content: text('content').notNull().default(''),
  created_at: text('created_at').notNull().default(new Date().toISOString()),
  updated_at: text('updated_at').notNull().default(new Date().toISOString()),
  expiry: text('expiry'),
  mediawiki_instance_name: text('mediawiki_instance_name'),
  mediawiki_instance_api_url: text('mediawiki_instance_api_url'),
  mediawiki_instance_css: text('mediawiki_instance_css'),
  restored_version_id: text('restored_version_id'),
  visibility: text('visibility').notNull().default('public'),
});

/** Immutable revision snapshots stored as base64-encoded Yjs updates. */
export const documentRevisions = sqliteTable('document_revisions', {
  id: text('id').primaryKey(),
  document_id: text('document_id')
    .notNull()
    .references(() => documents.id),
  yjs_state: text('yjs_state'),
  starred: integer('starred', { mode: 'boolean' }).notNull().default(false),
  created_at: text('created_at').notNull().default(new Date().toISOString()),
});
