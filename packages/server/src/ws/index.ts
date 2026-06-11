import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { WebSocketServer, type WebSocket } from 'ws';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { ServerType } from '@hono/node-server';
import type { Server } from 'http';

const messageSync = 0;
const messageAwareness = 1;

const wsReadyStateConnecting = 0;
const wsReadyStateOpen = 1;

let contentInitializor: (ydoc: Y.Doc) => Promise<void> = () => Promise.resolve();

export function setContentInitializor(f: (ydoc: Y.Doc) => Promise<void>) {
  contentInitializor = f;
}

interface Persistence {
  provider: any;
  bindState: (docName: string, doc: WSSharedDoc) => void;
  writeState: (docName: string, doc: WSSharedDoc) => Promise<any>;
}

let persistence: Persistence | null = null;

export function setPersistence(p: Persistence) {
  persistence = p;
}

class WSSharedDoc extends Y.Doc {
  name: string;
  conns: Map<WebSocket, Set<number>>;
  awareness: awarenessProtocol.Awareness;

  constructor(name: string) {
    super({ gc: true });
    this.name = name;
    this.conns = new Map();
    this.awareness = new awarenessProtocol.Awareness(this);
    this.awareness.setLocalState(null);

    this.awareness.on('update', ({ added, updated, removed }: { added: number[], updated: number[], removed: number[] }, conn: WebSocket | null) => {
      const changedClients = added.concat(updated, removed);
      if (conn !== null) {
        const connControlledIDs = this.conns.get(conn);
        if (connControlledIDs !== undefined) {
          added.forEach((clientID: number) => connControlledIDs.add(clientID));
          removed.forEach((clientID: number) => connControlledIDs.delete(clientID));
        }
      }
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
      );
      const buff = encoding.toUint8Array(encoder);
      this.conns.forEach((_, c) => send(this, c, buff));
    });

    this.on('update', ((update: Uint8Array, _origin: any, doc: WSSharedDoc) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);
      doc.conns.forEach((_, conn) => send(doc, conn, message));
    }) as any);

    contentInitializor(this);
  }
}

const docs = new Map<string, WSSharedDoc>();

function getYDoc(docname: string, gc = true): WSSharedDoc {
  let doc = docs.get(docname);
  if (!doc) {
    doc = new WSSharedDoc(docname);
    doc.gc = gc;
    if (persistence !== null) {
      persistence.bindState(docname, doc);
    }
    docs.set(docname, doc);
  }
  return doc;
}

function send(doc: WSSharedDoc, conn: WebSocket, m: Uint8Array) {
  if (conn.readyState !== wsReadyStateConnecting && conn.readyState !== wsReadyStateOpen) {
    closeConn(doc, conn);
    return;
  }
  try {
    conn.send(m, (err) => {
      if (err) closeConn(doc, conn);
    });
  } catch (_e) {
    closeConn(doc, conn);
  }
}

function closeConn(doc: WSSharedDoc, conn: WebSocket) {
  if (doc.conns.has(conn)) {
    const controlledIds = doc.conns.get(conn)!;
    doc.conns.delete(conn);
    awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlledIds), null);
    if (doc.conns.size === 0 && persistence !== null) {
      persistence.writeState(doc.name, doc).then(() => {
        doc.destroy();
      });
      docs.delete(doc.name);
    }
  }
  conn.close();
}

function messageListener(conn: WebSocket, doc: WSSharedDoc, message: Uint8Array) {
  try {
    const encoder = encoding.createEncoder();
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);
    switch (messageType) {
      case messageSync:
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
        if (encoding.length(encoder) > 1) {
          send(doc, conn, encoding.toUint8Array(encoder));
        }
        break;
      case messageAwareness:
        awarenessProtocol.applyAwarenessUpdate(
          doc.awareness,
          decoding.readVarUint8Array(decoder),
          conn
        );
        break;
    }
  } catch (err) {
    console.error(err);
  }
}

const pingTimeout = 30000;

export function setupWSConnection(conn: WebSocket, req: any, { docName, gc = true }: { docName?: string; gc?: boolean } = {}) {
  conn.binaryType = 'arraybuffer';
  const name = docName || (req.url || '').slice(1).split('?')[0];
  const doc = getYDoc(name, gc);
  doc.conns.set(conn, new Set());

  conn.on('message', (message: Buffer | ArrayBuffer | Buffer[]) => {
    let data: Uint8Array;
    if (Array.isArray(message)) {
      data = new Uint8Array(Buffer.concat(message));
    } else if (message instanceof Buffer) {
      data = new Uint8Array(message);
    } else {
      data = new Uint8Array(message);
    }
    messageListener(conn, doc, data);
  });

  let pongReceived = true;
  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      if (doc.conns.has(conn)) {
        closeConn(doc, conn);
      }
      clearInterval(pingInterval);
    } else if (doc.conns.has(conn)) {
      pongReceived = false;
      try {
        conn.ping();
      } catch (_e) {
        closeConn(doc, conn);
        clearInterval(pingInterval);
      }
    }
  }, pingTimeout);

  conn.on('close', () => {
    closeConn(doc, conn);
    clearInterval(pingInterval);
  });

  conn.on('pong', () => {
    pongReceived = true;
  });

  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, doc);
    send(doc, conn, encoding.toUint8Array(encoder));

    const awarenessStates = doc.awareness.getStates();
    if (awarenessStates.size > 0) {
      const encoderAwareness = encoding.createEncoder();
      encoding.writeVarUint(encoderAwareness, messageAwareness);
      encoding.writeVarUint8Array(
        encoderAwareness,
        awarenessProtocol.encodeAwarenessUpdate(doc.awareness, Array.from(awarenessStates.keys()))
      );
      send(doc, conn, encoding.toUint8Array(encoderAwareness));
    }
  }
}

const saveTimers = new Map<string, NodeJS.Timeout>();

function saveDoc(docName: string, doc: WSSharedDoc) {
  const ytext = doc.getText('wikitext');
  const content = ytext.toString();

  db.update(schema.documents)
    .set({
      content,
      updated_at: new Date().toISOString(),
    })
    .where(eq(schema.documents.id, docName))
    .run();

  const revisionId = nanoid(7);
  const state = Y.encodeStateAsUpdate(doc);

  db.insert(schema.documentRevisions).values({
    id: revisionId,
    document_id: docName,
    yjs_state: Buffer.from(state).toString('base64'),
    created_at: new Date().toISOString(),
  }).run();
}

function saveDocDebounced(docName: string, doc: WSSharedDoc) {
  if (saveTimers.has(docName)) {
    clearTimeout(saveTimers.get(docName)!);
  }
  saveTimers.set(docName, setTimeout(() => {
    saveDoc(docName, doc);
    saveTimers.delete(docName);
  }, 1000));
}

setContentInitializor(async (ydoc: Y.Doc) => {
  const docName = (ydoc as any).name;
  const existingDoc = db.select()
    .from(schema.documents)
    .where(eq(schema.documents.id, docName))
    .get();

  if (existingDoc && existingDoc.content) {
    const ytext = ydoc.getText('wikitext');
    ytext.insert(0, existingDoc.content);
  }
});

setPersistence({
  provider: null,
  bindState: (docName: string, doc: WSSharedDoc) => {
    doc.on('update', (_update: Uint8Array) => {
      saveDocDebounced(docName, doc);
    });
  },
  writeState: async (docName: string, doc: WSSharedDoc) => {
    if (saveTimers.has(docName)) {
      clearTimeout(saveTimers.get(docName)!);
      saveTimers.delete(docName);
    }
    saveDoc(docName, doc);
  },
});

export function setupWebSocket(server: ServerType) {
  const wss = new WebSocketServer({ server: server as unknown as Server });

  wss.on('connection', (ws: WebSocket, req: any) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const docName = url.pathname.split('/').pop();

    if (!docName) {
      ws.close(1008, 'Missing document ID');
      return;
    }

    setupWSConnection(ws, req, { docName });
  });

  return wss;
}
