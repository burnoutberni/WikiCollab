import { and, asc, desc, eq, isNotNull, or, sql } from 'drizzle-orm';
import * as Y from 'yjs';

import { db } from '../db/index.js';
import * as schema from '../db/schema.js';

const revisions = schema.documentRevisions;
type RevisionPosition = Pick<typeof revisions.$inferSelect, 'id' | 'document_id' | 'created_at'>;

/** Explicit projection shared by metadata readers; never selects either payload column. */
export const revisionMetadata = {
  id: revisions.id,
  document_id: revisions.document_id,
  kind: revisions.kind,
  starred: revisions.starred,
  created_at: revisions.created_at,
};

function atOrBefore(target: RevisionPosition) {
  return sql`(${revisions.created_at}, ${revisions.id}) <= (${target.created_at}, ${target.id})`;
}

function after(target: RevisionPosition) {
  return sql`(${revisions.created_at}, ${revisions.id}) > (${target.created_at}, ${target.id})`;
}

export function getLatestRevision(documentId: string) {
  return db
    .select({
      ...revisionMetadata,
      has_state: sql<number>`${revisions.payload} IS NOT NULL OR length(${revisions.yjs_state}) > 0`,
    })
    .from(revisions)
    .where(eq(revisions.document_id, documentId))
    .orderBy(desc(revisions.created_at), desc(revisions.id))
    .get();
}

function getSnapshot(target: RevisionPosition) {
  return db
    .select(revisionMetadata)
    .from(revisions)
    .where(
      and(
        eq(revisions.document_id, target.document_id),
        atOrBefore(target),
        or(eq(revisions.kind, 'snapshot'), isNotNull(revisions.yjs_state))
      )
    )
    .orderBy(desc(revisions.created_at), desc(revisions.id))
    .get();
}

/** Caller owns the returned document, including destroying it after use. */
export function reconstructRevision(target: RevisionPosition): Y.Doc {
  const snapshot = getSnapshot(target);
  if (!snapshot) throw new Error(`No snapshot for revision ${target.id}`);
  const doc = new Y.Doc();
  try {
    const stored = db.select().from(revisions).where(eq(revisions.id, snapshot.id)).get()!;
    const state = stored.yjs_state ? Buffer.from(stored.yjs_state, 'base64') : stored.payload;
    // Legacy rows without state represented an empty document.
    if (state) Y.applyUpdate(doc, state);
    const deltas = db
      .select({ payload: revisions.payload })
      .from(revisions)
      .where(
        and(eq(revisions.document_id, target.document_id), after(snapshot), atOrBefore(target))
      )
      .orderBy(asc(revisions.created_at), asc(revisions.id))
      .all();
    for (const delta of deltas) {
      if (!delta.payload) throw new Error(`Missing delta payload for revision ${target.id}`);
      Y.applyUpdate(doc, delta.payload);
    }
    return doc;
  } catch (error) {
    doc.destroy();
    throw error;
  }
}

/** The common content reader for both preview and restore. */
export function reconstructRevisionContent(target: RevisionPosition): string {
  const doc = reconstructRevision(target);
  try {
    return doc.getText('wikitext').toString();
  } finally {
    doc.destroy();
  }
}

function positiveIntegerSetting(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

/** Bounds replay work by both revision count and accumulated encoded delta bytes. */
export function needsRevisionSnapshot(
  latest: ReturnType<typeof getLatestRevision>,
  deltaBytes: number
) {
  if (!latest?.has_state) return true;
  const snapshot = getSnapshot(latest);
  if (!snapshot) return true;
  const totals = db
    .select({
      count: sql<number>`count(*)`,
      bytes: sql<number>`coalesce(sum(length(${revisions.payload})), 0)`,
    })
    .from(revisions)
    .where(and(eq(revisions.document_id, latest.document_id), after(snapshot)))
    .get()!;
  return (
    totals.count + 1 >= positiveIntegerSetting('REVISION_SNAPSHOT_INTERVAL', 50) ||
    totals.bytes + deltaBytes >
      positiveIntegerSetting('REVISION_SNAPSHOT_MAX_DELTA_BYTES', 1_000_000)
  );
}
