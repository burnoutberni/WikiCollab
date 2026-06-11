import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { ServerType } from '@hono/node-server';

const docs = new Map<string, Y.Doc>();
const connections = new Map<string, Set<WebSocket>>();

function getDoc(docId: string): Y.Doc {
  if (!docs.has(docId)) {
    const ydoc = new Y.Doc();

    const existingDoc = db.select()
      .from(schema.documents)
      .where(eq(schema.documents.id, docId))
      .get();

    if (existingDoc && existingDoc.content) {
      const ytext = ydoc.getText('wikitext');
      ytext.insert(0, existingDoc.content);
    }

    docs.set(docId, ydoc);
    connections.set(docId, new Set());
  }

  return docs.get(docId)!;
}

function broadcastToDoc(docId: string, message: string, exclude?: WebSocket) {
  const conns = connections.get(docId);
  if (!conns) return;

  for (const conn of conns) {
    if (conn !== exclude && conn.readyState === WebSocket.OPEN) {
      conn.send(message);
    }
  }
}

export function setupWebSocket(server: ServerType) {
  const wss = new WebSocketServer({ server: server as any, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const docId = url.pathname.split('/').pop();

    if (!docId) {
      ws.close(1008, 'Missing document ID');
      return;
    }

    const ydoc = getDoc(docId);
    const conns = connections.get(docId)!;
    conns.add(ws);

    const ytext = ydoc.getText('wikitext');
    const stateVector = Y.encodeStateAsUpdate(ydoc);
    ws.send(JSON.stringify({
      type: 'sync',
      stateVector: Array.from(stateVector),
    }));

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case 'update':
            const update = new Uint8Array(message.update);
            Y.applyUpdate(ydoc, update);

            broadcastToDoc(docId, JSON.stringify({
              type: 'update',
              update: Array.from(update),
            }), ws);

            saveDocDebounced(docId, ydoc);
            break;

          case 'awareness':
            broadcastToDoc(docId, JSON.stringify({
              type: 'awareness',
              data: message.data,
            }), ws);
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', () => {
      conns.delete(ws);

      if (conns.size === 0) {
        saveDoc(docId, ydoc);
        docs.delete(docId);
        connections.delete(docId);
      }
    });
  });

  return wss;
}

const saveTimers = new Map<string, NodeJS.Timeout>();

function saveDocDebounced(docId: string, ydoc: Y.Doc) {
  if (saveTimers.has(docId)) {
    clearTimeout(saveTimers.get(docId)!);
  }

  saveTimers.set(docId, setTimeout(() => {
    saveDoc(docId, ydoc);
    saveTimers.delete(docId);
  }, 1000));
}

function saveDoc(docId: string, ydoc: Y.Doc) {
  const ytext = ydoc.getText('wikitext');
  const content = ytext.toString();

  db.update(schema.documents)
    .set({
      content,
      updated_at: new Date().toISOString(),
    })
    .where(eq(schema.documents.id, docId))
    .run();

  const revisionId = nanoid(7);
  const state = Y.encodeStateAsUpdate(ydoc);

  db.insert(schema.documentRevisions).values({
    id: revisionId,
    document_id: docId,
    yjs_state: Buffer.from(state).toString('base64'),
    created_at: new Date().toISOString(),
  }).run();
}

export { getDoc, broadcastToDoc };
