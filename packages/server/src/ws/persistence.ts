import { desc, eq } from 'drizzle-orm';
import * as encoding from 'lib0/encoding';
import { nanoid } from 'nanoid';
import * as Y from 'yjs';

import { db, schema } from '../db/index.js';
import type { WSSharedDoc } from './connection.js';
import { broadcastCustom } from './connection.js';

let contentInitializor: (ydoc: Y.Doc) => Promise<void> = () => Promise.resolve();

export function setContentInitializor(f: (ydoc: Y.Doc) => Promise<void>) {
  contentInitializor = f;
}

export async function runContentInitializor(ydoc: Y.Doc): Promise<void> {
  await contentInitializor(ydoc);
}

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
      const existingDoc = db
        .select()
        .from(schema.documents)
        .where(eq(schema.documents.id, docName))
        .get();
      if (existingDoc?.content) {
        ydoc.getText('wikitext').insert(0, existingDoc.content);
      }
    }
  });
}

const saveTimers = new Map<string, NodeJS.Timeout>();

function saveDoc(docName: string, doc: WSSharedDoc) {
  const ytext = doc.getText('wikitext');
  const content = ytext.toString();

  const existing = db.select().from(schema.documents).where(eq(schema.documents.id, docName)).get();

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

export function flushSaveTimers(docName: string, doc: WSSharedDoc) {
  if (saveTimers.has(docName)) {
    clearTimeout(saveTimers.get(docName)!);
    saveTimers.delete(docName);
  }
  saveDoc(docName, doc);
}

export interface Persistence {
  provider: unknown;
  bindState: (docName: string, doc: WSSharedDoc) => void;
  writeState: (docName: string, doc: WSSharedDoc) => Promise<unknown>;
}

let persistence: Persistence | null = null;

export function getPersistence(): Persistence | null {
  return persistence;
}

export function setPersistence(p: Persistence) {
  persistence = p;
}

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
