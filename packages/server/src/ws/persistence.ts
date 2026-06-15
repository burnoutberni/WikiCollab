import { desc, eq } from 'drizzle-orm';
import * as encoding from 'lib0/encoding';
import { nanoid } from 'nanoid';
import * as Y from 'yjs';

import { getDocumentById } from '../db/helpers.js';
import { db, schema } from '../db/index.js';
import type { WSSharedDoc } from './connection.js';
import { broadcastCustom } from './connection.js';

let contentInitializor: (ydoc: Y.Doc) => Promise<void> = () => Promise.resolve();

/** Overrides how newly opened Yjs docs are hydrated, primarily for app setup and tests. */
export function setContentInitializor(f: (ydoc: Y.Doc) => Promise<void>) {
  contentInitializor = f;
}

/** Runs the current hydration hook before a WebSocket document starts serving clients. */
export async function runContentInitializor(ydoc: Y.Doc): Promise<void> {
  await contentInitializor(ydoc);
}

/** Seeds a Yjs doc from the latest revision, or from stored plain text as a fallback. */
export function initContentInitializor() {
  setContentInitializor(async (ydoc: Y.Doc) => {
    const docName = (ydoc as unknown as { name: string }).name;

    const latestRevision = db
      .select()
      .from(schema.documentRevisions)
      .where(eq(schema.documentRevisions.document_id, docName))
      .orderBy(desc(schema.documentRevisions.created_at), desc(schema.documentRevisions.id))
      .get();

    if (latestRevision?.yjs_state) {
      const state = Buffer.from(latestRevision.yjs_state, 'base64');
      Y.applyUpdate(ydoc, state);
    } else {
      const existingDoc = getDocumentById(docName);
      if (existingDoc?.content) {
        ydoc.getText('wikitext').insert(0, existingDoc.content);
      }
    }
  });
}

const saveTimers = new Map<string, NodeJS.Timeout>();

/** Persists the current document content and writes a revision snapshot on content changes. */
function saveDoc(docName: string, doc: WSSharedDoc) {
  const ytext = doc.getText('wikitext');
  const content = ytext.toString();

  const existing = getDocumentById(docName);

  if (!existing) return;

  const contentChanged = existing.content !== content;

  db.update(schema.documents)
    .set({
      content,
      updated_at: new Date().toISOString(),
    })
    .where(eq(schema.documents.id, docName))
    .run();

  if (contentChanged) {
    const revisionId = nanoid(7);
    const state = Y.encodeStateAsUpdate(doc);

    db.insert(schema.documentRevisions)
      .values({
        id: revisionId,
        document_id: docName,
        yjs_state: Buffer.from(state).toString('base64'),
        created_at: new Date().toISOString(),
      })
      .run();

    const responseEncoder = encoding.createEncoder();
    encoding.writeVarString(responseEncoder, 'new_version');
    encoding.writeVarString(responseEncoder, 'documentId');
    encoding.writeVarUint(responseEncoder, 0);
    encoding.writeVarString(responseEncoder, docName);
    broadcastCustom(doc, encoding.toUint8Array(responseEncoder));
  }
}

/** Coalesces bursty Yjs updates into a single delayed database write per document. */
export function saveDocDebounced(docName: string, doc: WSSharedDoc) {
  if (saveTimers.has(docName)) {
    clearTimeout(saveTimers.get(docName)!);
  }
  saveTimers.set(
    docName,
    setTimeout(() => {
      saveDoc(docName, doc);
      saveTimers.delete(docName);
    }, 1000)
  );
}

/** Forces any pending debounced save to run immediately before shutdown or disconnect. */
export function flushSaveTimers(docName: string, doc: WSSharedDoc) {
  if (saveTimers.has(docName)) {
    clearTimeout(saveTimers.get(docName)!);
    saveTimers.delete(docName);
  }
  saveDoc(docName, doc);
}

/** Minimal persistence contract used by the WebSocket layer. */
export interface Persistence {
  provider: unknown;
  bindState: (docName: string, doc: WSSharedDoc) => void;
  writeState: (docName: string, doc: WSSharedDoc) => Promise<unknown>;
}

let persistence: Persistence | null = null;

/** Returns the active persistence adapter, if one has been installed. */
export function getPersistence(): Persistence | null {
  return persistence;
}

/** Installs the process-wide persistence adapter used by shared documents. */
export function setPersistence(p: Persistence) {
  persistence = p;
}

/** Wires the default SQLite-backed persistence callbacks into the WS layer. */
export function initPersistence() {
  setPersistence({
    provider: null,
    bindState: (docName: string, doc: WSSharedDoc) => {
      doc.on('update', () => {
        saveDocDebounced(docName, doc);
      });
    },
    writeState: async (docName: string, doc: WSSharedDoc) => {
      flushSaveTimers(docName, doc);
    },
  });
}
