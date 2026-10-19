import { eq } from 'drizzle-orm';

import { db, schema } from './index.js';
import type { documentRevisions, documents, users } from './schema.js';

type DocumentRow = typeof documents.$inferSelect;
type UserRow = typeof users.$inferSelect;
type VersionRow = typeof documentRevisions.$inferSelect;

/** Returns a single document row, or `undefined` when the ID does not exist. */
export function getDocumentById(id: string): DocumentRow | undefined {
  return db.select().from(schema.documents).where(eq(schema.documents.id, id)).get();
}

/** Returns a Wikimedia OAuth user row, or `undefined` when it does not exist. */
export function getUserById(id: string): UserRow | undefined {
  return db.select().from(schema.users).where(eq(schema.users.id, id)).get();
}

/** Returns a stored revision row by ID for restore, preview, and star operations. */
export function getVersionById(vId: string): VersionRow | undefined {
  return db
    .select()
    .from(schema.documentRevisions)
    .where(eq(schema.documentRevisions.id, vId))
    .get();
}
