import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Wikimedia OAuth users. OAuth tokens are encrypted before storage. */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  wiki_username: text('wiki_username').notNull(),
  oauth_access_token: text('oauth_access_token'),
  oauth_refresh_token: text('oauth_refresh_token'),
  created_at: text('created_at').notNull().default(new Date().toISOString()),
});

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
  mediawiki_canonical_server: text('mediawiki_canonical_server'),
  mediawiki_article_path: text('mediawiki_article_path'),
  mediawiki_script_path: text('mediawiki_script_path'),
  restored_version_id: text('restored_version_id'),
  visibility: text('visibility').notNull().default('public'),
  owner_user_id: text('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  mediawiki_api_key: text('mediawiki_api_key'),
  mediawiki_bot_username: text('mediawiki_bot_username'),
  mediawiki_bot_password: text('mediawiki_bot_password'),
});

/** Immutable Yjs checkpoints/deltas, with legacy base64 snapshots retained for compatibility. */
export const documentRevisions = sqliteTable('document_revisions', {
  id: text('id').primaryKey(),
  document_id: text('document_id')
    .notNull()
    .references(() => documents.id),
  yjs_state: text('yjs_state'),
  kind: text('kind', { enum: ['snapshot', 'delta'] })
    .notNull()
    .default('snapshot'),
  payload: blob('payload', { mode: 'buffer' }),
  starred: integer('starred', { mode: 'boolean' }).notNull().default(false),
  created_at: text('created_at').notNull().default(new Date().toISOString()),
});
