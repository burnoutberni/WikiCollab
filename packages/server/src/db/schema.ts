import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default('Untitled'),
  content: text('content').notNull().default(''),
  created_at: text('created_at').notNull().default(new Date().toISOString()),
  updated_at: text('updated_at').notNull().default(new Date().toISOString()),
  expiry: text('expiry'),
  mediawiki_instance_id: text('mediawiki_instance_id'),
});

export const mediawikiInstances = sqliteTable('mediawiki_instances', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  api_url: text('api_url').notNull(),
  token: text('token'),
  css: text('css'),
  configured_at: text('configured_at').notNull().default(new Date().toISOString()),
});

export const documentRevisions = sqliteTable('document_revisions', {
  id: text('id').primaryKey(),
  document_id: text('document_id').notNull().references(() => documents.id),
  yjs_state: text('yjs_state'),
  starred: integer('starred', { mode: 'boolean' }).notNull().default(false),
  created_at: text('created_at').notNull().default(new Date().toISOString()),
});

export const templateCache = sqliteTable('template_cache', {
  id: text('id').primaryKey(),
  instance_id: text('instance_id').notNull().references(() => mediawikiInstances.id),
  template_name: text('template_name').notNull(),
  template_data: text('template_data').notNull(),
  fetched_at: text('fetched_at').notNull().default(new Date().toISOString()),
});
