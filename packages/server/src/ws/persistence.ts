import { eq } from 'drizzle-orm';
import * as encoding from 'lib0/encoding';
import { nanoid } from 'nanoid';
import * as Y from 'yjs';

import { getDocumentById } from '../db/helpers.js';
import { db, schema } from '../db/index.js';
import {
  getLatestRevision,
  needsRevisionSnapshot,
  reconstructRevision,
} from '../services/revision-storage.js';
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
    const seedPlainText = () => {
      const existingDoc = getDocumentById(docName);
      if (existingDoc?.content) {
        ydoc.getText('wikitext').insert(0, existingDoc.content);
      }
    };

    const latestRevision = getLatestRevision(docName);

    if (latestRevision?.has_state) {
      let restored: Y.Doc | undefined;
      try {
        restored = reconstructRevision(latestRevision);
        Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(restored));
      } catch {
        seedPlainText();
      } finally {
        restored?.destroy();
      }
    } else {
      seedPlainText();
    }
  });
}

const saveTimers = new Map<string, NodeJS.Timeout>();
const pendingUpdates = new WeakMap<WSSharedDoc, Uint8Array[]>();

/** Atomically persist text and its checkpoint/delta before notifying clients. */
function saveDoc(docName: string, doc: WSSharedDoc) {
  const content = doc.getText('wikitext').toString();
  const updates = pendingUpdates.get(doc) ?? [];
  const saved = db.transaction(() => {
    const existing = getDocumentById(docName);
    if (!existing) return false;
    const contentChanged = existing.content !== content;
    // Even edits that cancel out can introduce Yjs structs needed by future deltas.
    if (!contentChanged && updates.length === 0) return false;

    const latest = getLatestRevision(docName);
    const delta = updates.length > 0 ? Y.mergeUpdates(updates) : undefined;
    const snapshot = !delta || needsRevisionSnapshot(latest, delta.byteLength);
    const payload = snapshot ? Y.encodeStateAsUpdate(doc) : delta!;
    // IDs are random, so force increasing timestamps for deterministic replay even
    // when saves share a millisecond or the system clock moves backwards.
    const createdAt = new Date(
      Math.max(Date.now(), latest ? Date.parse(latest.created_at) + 1 : 0)
    ).toISOString();

    db.update(schema.documents)
      .set({ content, updated_at: createdAt })
      .where(eq(schema.documents.id, docName))
      .run();
    db.insert(schema.documentRevisions)
      .values({
        id: nanoid(7),
        document_id: docName,
        kind: snapshot ? 'snapshot' : 'delta',
        payload: Buffer.from(payload),
        created_at: createdAt,
      })
      .run();
    return true;
  });
  pendingUpdates.delete(doc);

  if (saved) {
    const responseEncoder = encoding.createEncoder();
    encoding.writeVarString(responseEncoder, 'new_version');
    encoding.writeVarString(responseEncoder, 'documentId');
    encoding.writeVarUint(responseEncoder, 0);
    encoding.writeVarString(responseEncoder, docName);
    broadcastCustom(doc, encoding.toUint8Array(responseEncoder));
  }
}

/** Collect bursty Yjs updates for a single merged delta per debounce window. */
export function saveDocDebounced(docName: string, doc: WSSharedDoc, update?: Uint8Array) {
  if (update) {
    const updates = pendingUpdates.get(doc) ?? [];
    updates.push(update);
    pendingUpdates.set(doc, updates);
  }
  if (saveTimers.has(docName)) {
    clearTimeout(saveTimers.get(docName)!);
  }
  saveTimers.set(
    docName,
    setTimeout(() => {
      saveTimers.delete(docName);
      saveDoc(docName, doc);
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
      doc.on('update', (update: Uint8Array) => {
        saveDocDebounced(docName, doc, update);
      });
    },
    writeState: async (docName: string, doc: WSSharedDoc) => {
      flushSaveTimers(docName, doc);
    },
  });
}
