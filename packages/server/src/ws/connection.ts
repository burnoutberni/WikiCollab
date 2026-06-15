import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { WebSocketServer, type WebSocket } from 'ws';
import { db, schema } from '../db/index.js';
import { getVersionById } from '../db/helpers.js';
import { eq } from 'drizzle-orm';
import type { ServerType } from '@hono/node-server';
import type { Server } from 'http';
import {
  messageSync,
  messageAwareness,
  messageCustom,
  wsReadyStateConnecting,
  wsReadyStateOpen,
  pingTimeout,
} from './constants.js';
import { runContentInitializor, getPersistence } from './persistence.js';
import { decodeCustomMessage, encodeInnerPayload, wrapCustomMessage } from 'shared';
import { createOriginValidator } from './origin.js';
import { generatePreview } from '../preview.js';
import { envInt } from '../utils/env.js';

export class WSSharedDoc extends Y.Doc {
  name: string;
  conns: Map<WebSocket, Set<number>>;
  awareness: awarenessProtocol.Awareness;
  private initialized: Promise<void>;

  constructor(name: string) {
    super({ gc: true });
    this.name = name;
    this.conns = new Map();
    this.awareness = new awarenessProtocol.Awareness(this);
    this.awareness.setLocalState(null);

    this.awareness.on(
      'update',
      (
        { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
        conn: WebSocket | null
      ) => {
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
      }
    );

    this.on('update', ((update: Uint8Array, _origin: unknown, doc: WSSharedDoc) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);
      doc.conns.forEach((_, conn) => send(doc, conn, message));
    }) as unknown as (eventName: string, ...args: unknown[]) => void);

    this.initialized = runContentInitializor(this);
  }

  async whenReady(): Promise<void> {
    await this.initialized;
  }
}

const docs = new Map<string, WSSharedDoc>();

function getYDoc(docname: string, gc = true): WSSharedDoc {
  let doc = docs.get(docname);
  if (!doc) {
    doc = new WSSharedDoc(docname);
    doc.gc = gc;
    const persistence = getPersistence();
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
  } catch {
    closeConn(doc, conn);
  }
}

function closeConn(doc: WSSharedDoc, conn: WebSocket) {
  if (doc.conns.has(conn)) {
    const controlledIds = doc.conns.get(conn)!;
    doc.conns.delete(conn);
    awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlledIds), null);
    if (doc.conns.size === 0) {
      const persistence = getPersistence();
      if (persistence !== null) {
        persistence.writeState(doc.name, doc).then(() => {
          doc.destroy();
        });
      }
      docs.delete(doc.name);
    }
  }
  conn.close();
}

export function broadcastCustom(
  doc: WSSharedDoc,
  data: Uint8Array,
  excludeConn: WebSocket | null = null
) {
  const message = wrapCustomMessage(data);
  doc.conns.forEach((_, conn) => {
    if (conn !== excludeConn) {
      send(doc, conn, message);
    }
  });
}

const previewDebounces = new Map<string, ReturnType<typeof setTimeout>>();
const MAX_PREVIEW_DEBOUNCE_KEYS = 100;

function evictPreviewDebounce(): void {
  if (previewDebounces.size >= MAX_PREVIEW_DEBOUNCE_KEYS) {
    const oldest = previewDebounces.keys().next().value;
    if (oldest !== undefined) {
      const timer = previewDebounces.get(oldest);
      if (timer) clearTimeout(timer);
      previewDebounces.delete(oldest);
    }
  }
}

function handleCustomMessage(doc: WSSharedDoc, data: Uint8Array) {
  const { type, payload } = decodeCustomMessage(data);

  switch (type) {
    case 'star': {
      const versionId = typeof payload.versionId === 'string' ? payload.versionId : '';
      const starred = typeof payload.starred === 'boolean' ? payload.starred : false;
      if (!versionId) break;

      const version = getVersionById(versionId);
      if (!version) break;
      if (version.document_id !== doc.name) break;

      db.update(schema.documentRevisions)
        .set({ starred })
        .where(eq(schema.documentRevisions.id, versionId))
        .run();

      broadcastCustom(doc, encodeInnerPayload('star', { versionId, starred }));
      break;
    }
    case 'restore': {
      const versionId = typeof payload.versionId === 'string' ? payload.versionId : '';
      const documentId = typeof payload.documentId === 'string' ? payload.documentId : '';
      if (!versionId || !documentId) break;
      if (documentId !== doc.name) break;

      const version = getVersionById(versionId);
      if (!version) break;
      if (version.document_id !== doc.name) break;

      db.update(schema.documents)
        .set({ restored_version_id: versionId })
        .where(eq(schema.documents.id, documentId))
        .run();

      broadcastCustom(doc, encodeInnerPayload('restore', { versionId }));
      break;
    }
    case 'preview_request': {
      const api_url = typeof payload.api_url === 'string' ? payload.api_url : '';
      const page = typeof payload.page === 'string' ? payload.page : '';

      const key = `${doc.name}:${api_url}:${page}`;
      const existing = previewDebounces.get(key);
      if (existing) clearTimeout(existing);

      if (!existing) {
        evictPreviewDebounce();
      }
      previewDebounces.set(
        key,
        setTimeout(async () => {
          previewDebounces.delete(key);
          try {
            const wikitext = doc.getText('wikitext').toString();
            const { html } = await generatePreview(wikitext, api_url || null, page || null);
            broadcastCustom(doc, encodeInnerPayload('preview_update', { html, api_url, page }));
          } catch (err) {
            console.error('WS preview generation failed:', err);
          }
        }, 500)
      );
      break;
    }
  }
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
      case messageCustom: {
        const customData = decoding.readVarUint8Array(decoder);
        handleCustomMessage(doc, customData);
        break;
      }
    }
  } catch (err) {
    console.error(err);
  }
}

// --- Connection rate limiting ---

const WS_CONCURRENT = envInt('RATE_LIMIT_WS_CONCURRENT', 100);
const WS_RATE_MAX = envInt('RATE_LIMIT_WS_RATE_MAX', 100);
const WS_RATE_WINDOW_MS = envInt('RATE_LIMIT_WS_RATE_WINDOW', 60) * 1000;

const wsConnectionCounts = new Map<string, number>();
const wsConnectionRate = new Map<string, number[]>();

function getWsIp(req: {
  headers?: Record<string, string | undefined>;
  socket?: { remoteAddress?: string };
}): string {
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = req?.headers?.['x-real-ip'];
  if (realIp) return realIp;
  return req?.socket?.remoteAddress || 'unknown';
}

function checkWsRateLimit(ip: string): boolean {
  const current = wsConnectionCounts.get(ip) || 0;
  if (current >= WS_CONCURRENT) return false;

  const now = Date.now();
  let timestamps = wsConnectionRate.get(ip) || [];
  timestamps = timestamps.filter((t) => now - t < WS_RATE_WINDOW_MS);

  if (timestamps.length >= WS_RATE_MAX) return false;

  timestamps.push(now);
  wsConnectionRate.set(ip, timestamps);
  return true;
}

// Cleanup WS rate tracking periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of wsConnectionRate) {
    const filtered = timestamps.filter((t) => now - t < WS_RATE_WINDOW_MS);
    if (filtered.length === 0) {
      wsConnectionRate.delete(ip);
    } else {
      wsConnectionRate.set(ip, filtered);
    }
  }
}, 60000).unref();

export async function setupWSConnection(
  conn: WebSocket,
  req: { url?: string },
  { docName, gc = true }: { docName?: string; gc?: boolean } = {}
) {
  conn.binaryType = 'arraybuffer';
  const name = docName || (req.url || '').slice(1).split('?')[0];
  const doc = getYDoc(name, gc);

  await doc.whenReady();

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
      } catch {
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

export function setupWebSocket(server: ServerType) {
  const wss = new WebSocketServer({
    server: server as unknown as Server,
    verifyClient: createOriginValidator(),
  });

  wss.on(
    'connection',
    (
      ws: WebSocket,
      req: {
        url?: string;
        headers?: Record<string, string | undefined>;
        socket?: { remoteAddress?: string };
      }
    ) => {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const docName = url.pathname.split('/').pop();

      if (!docName) {
        ws.close(1008, 'Missing document ID');
        return;
      }

      const ip = getWsIp(req);
      if (!checkWsRateLimit(ip)) {
        ws.close(1013, 'Too many connections');
        return;
      }

      const current = wsConnectionCounts.get(ip) || 0;
      wsConnectionCounts.set(ip, current + 1);

      ws.on('close', () => {
        const count = wsConnectionCounts.get(ip);
        if (count !== undefined) {
          if (count <= 1) {
            wsConnectionCounts.delete(ip);
          } else {
            wsConnectionCounts.set(ip, count - 1);
          }
        }
      });

      setupWSConnection(ws, req, { docName });
    }
  );

  return wss;
}

export function resetWsRateLimiters(): void {
  wsConnectionCounts.clear();
  wsConnectionRate.clear();
  for (const timer of previewDebounces.values()) {
    clearTimeout(timer);
  }
  previewDebounces.clear();
}
