import { eq } from 'drizzle-orm';
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
 * @returns The updated version if found, or undefined if the version doesn't exist
 */
export function setVersionStarred(
  versionId: string,
  starred: boolean,
  deps: VersionServiceDeps = { db, schema, getVersionById }
): DocumentRevision | undefined {
  const version = deps.getVersionById(versionId);
  if (!version) return undefined;

  deps.db
    .update(deps.schema.documentRevisions)
    .set({ starred })
    .where(eq(deps.schema.documentRevisions.id, versionId))
    .run();

  return { ...version, starred };
}
