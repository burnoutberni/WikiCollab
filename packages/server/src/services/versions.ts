import { and, eq } from 'drizzle-orm';
import type { DocumentRevision } from 'shared';

import { getVersionById } from '../db/helpers.js';
import { db, schema } from '../db/index.js';

interface VersionServiceDeps {
  db: typeof db;
  schema: typeof schema;
  getVersionById: typeof getVersionById;
}

/**
 * Updates the starred status of a version.
 *
 * @param versionId - The version ID to update
 * @param starred - Whether the version should be starred or unstarred
 * @param documentId - When provided, validates that the version belongs to this document
 * @param deps - Injectable dependencies for testing
 * @returns The updated version if found and updated, or undefined if not found or not updated
 */
export function setVersionStarred(
  versionId: string,
  starred: boolean,
  documentId?: string,
  deps: VersionServiceDeps = { db, schema, getVersionById }
): DocumentRevision | undefined {
  const version = deps.getVersionById(versionId);
  if (!version) return undefined;
  if (documentId !== undefined && version.document_id !== documentId) return undefined;

  const whereClause =
    documentId === undefined
      ? eq(deps.schema.documentRevisions.id, versionId)
      : and(
          eq(deps.schema.documentRevisions.id, versionId),
          eq(deps.schema.documentRevisions.document_id, documentId)
        );

  const result = deps.db
    .update(deps.schema.documentRevisions)
    .set({ starred })
    .where(whereClause)
    .run();

  if (result.changes === 0) return undefined;
  return deps.getVersionById(versionId);
}
