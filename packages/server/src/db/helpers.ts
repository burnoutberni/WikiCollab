import { db, schema } from './index.js';
import { eq } from 'drizzle-orm';

export function getDocumentById(id: string) {
  return db.select().from(schema.documents).where(eq(schema.documents.id, id)).get();
}

export function getVersionById(vId: string) {
  return db.select().from(schema.documentRevisions).where(eq(schema.documentRevisions.id, vId)).get();
}
