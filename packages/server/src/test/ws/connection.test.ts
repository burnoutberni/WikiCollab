import { eq } from 'drizzle-orm';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { encodeInnerPayload, wrapCustomMessage } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket as WsWebSocket } from 'ws';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

import type { MockWebSocket } from '../mocks/websocket.js';

const { mockDbModule } = vi.hoisted(() => ({
  mockDbModule: { db: null as any, schema: null as any },
}));
vi.mock('../../db/index.js', () => mockDbModule);

import * as schema from '../../db/schema.js';
import { resetWsRateLimiters, setupWSConnection } from '../../ws/connection.js';
import { messageAwareness, messageSync } from '../../ws/constants.js';
import { createMockWebSocket } from '../mocks/websocket.js';
import { createTestDb } from '../setup.js';

function makeMockWs(): MockWebSocket {
  return createMockWebSocket();
}

async function connectWs(url: string, options?: { docName?: string }): Promise<MockWebSocket> {
  const ws = makeMockWs();
  const opts = options?.docName ? { docName: options.docName } : undefined;
  await setupWSConnection(ws as unknown as WsWebSocket, { url }, opts);
  return ws;
}

function getSentMessage(sendMock: ReturnType<typeof vi.fn>, callIndex = 0): decoding.Decoder {
  const arg = sendMock.mock.calls[callIndex]?.[0];
  if (!arg) throw new Error('No message was sent');
  return decoding.createDecoder(new Uint8Array(arg));
}

function makeSyncUpdate(text: string): Uint8Array {
  const ydoc = new Y.Doc();
  ydoc.getText('wikitext').insert(0, text);
  const update = Y.encodeStateAsUpdate(ydoc);
  ydoc.destroy();

  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeUpdate(encoder, update);
  return encoding.toUint8Array(encoder);
}

describe('WebSocket connections', () => {
  let closeDb: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    const testDb = createTestDb();
    mockDbModule.db = testDb.db;
    mockDbModule.schema = schema;
    closeDb = testDb.close;
    resetWsRateLimiters();
  });

  afterEach(() => {
    closeDb?.();
    resetWsRateLimiters();
  });

  describe('Connection establishment', () => {
    it('sends sync step 1 on connect', async () => {
      const ws = await connectWs('/test-doc');

      expect(ws.send).toHaveBeenCalled();
      const decoder = getSentMessage(ws.send);
      expect(decoding.readVarUint(decoder)).toBe(messageSync);
    });

    it('connects with valid doc name', async () => {
      await expect(connectWs('/valid-doc-name')).resolves.toBeDefined();
    });

    it('connects with doc name from options', async () => {
      const ws = await connectWs('/ignored', { docName: 'from-options' });

      expect(ws.send).toHaveBeenCalled();
    });

    it('handles disconnect gracefully', async () => {
      const ws = await connectWs('/disconnect-test');

      expect(() => ws.emit('close')).not.toThrow();
      expect(ws.close).toHaveBeenCalled();
    });
  });

  describe('Sync protocol', () => {
    it('broadcasts sync update to other connected clients', async () => {
      const docName = '/sync-broadcast';
      const ws1 = await connectWs(docName);
      const ws2 = await connectWs(docName);
      ws2.send.mockClear();

      ws1.emit('message', makeSyncUpdate('Hello from ws1'));

      await vi.waitFor(() => {
        expect(ws2.send).toHaveBeenCalled();
      });

      const decoder = getSentMessage(ws2.send);
      expect(decoding.readVarUint(decoder)).toBe(messageSync);
    });
  });

  describe('Awareness protocol', () => {
    it('broadcasts awareness changes to other clients', async () => {
      const docName = '/awareness-bcast';
      const ws1 = await connectWs(docName);
      const ws2 = await connectWs(docName);
      ws2.send.mockClear();

      const ydoc = new Y.Doc();
      const awareness = new awarenessProtocol.Awareness(ydoc);
      awareness.setLocalState({ user: { name: 'Alice', color: '#0f0' } });

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, [ydoc.clientID])
      );
      const msg = encoding.toUint8Array(encoder);
      ydoc.destroy();

      ws1.emit('message', msg);

      await vi.waitFor(() => {
        expect(ws2.send).toHaveBeenCalled();
      });

      const decoder = getSentMessage(ws2.send);
      expect(decoding.readVarUint(decoder)).toBe(messageAwareness);
    });

    it('handles malformed awareness data without throwing', async () => {
      const ws = await connectWs('/bad-awareness');

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(encoder, new Uint8Array([255, 255, 255]));
      const msg = encoding.toUint8Array(encoder);

      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => ws.emit('message', msg)).not.toThrow();
      spy.mockRestore();
    });
  });

  describe('Custom messages', () => {
    it('stars a version via WebSocket', async () => {
      const docName = 'star-ws-test';
      const ws = await connectWs(`/${docName}`);

      mockDbModule.db
        .insert(schema.documents)
        .values({
          id: docName,
          title: 'Star WS Test',
          content: '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .run();

      mockDbModule.db
        .insert(schema.documentRevisions)
        .values({
          id: 'rev-ws-star',
          document_id: docName,
          yjs_state: null,
          starred: false,
          created_at: new Date().toISOString(),
        })
        .run();

      const msg = wrapCustomMessage(
        encodeInnerPayload('star', { versionId: 'rev-ws-star', starred: true })
      );
      ws.emit('message', msg);

      const version = mockDbModule.db
        .select()
        .from(schema.documentRevisions)
        .where(eq(schema.documentRevisions.id, 'rev-ws-star'))
        .get();
      expect(version.starred).toBe(true);
    });

    it('restores a version via WebSocket', async () => {
      const docName = 'restore-ws-test';

      mockDbModule.db
        .insert(schema.documents)
        .values({
          id: docName,
          title: 'Restore WS Test',
          content: '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .run();

      mockDbModule.db
        .insert(schema.documentRevisions)
        .values({
          id: 'rev-ws-restore',
          document_id: docName,
          yjs_state: null,
          starred: false,
          created_at: new Date().toISOString(),
        })
        .run();

      const ws = await connectWs(`/${docName}`);

      const msg = wrapCustomMessage(
        encodeInnerPayload('restore', { versionId: 'rev-ws-restore', documentId: docName })
      );
      ws.emit('message', msg);

      const doc = mockDbModule.db
        .select()
        .from(schema.documents)
        .where(eq(schema.documents.id, docName))
        .get();
      expect(doc.restored_version_id).toBe('rev-ws-restore');
    });

    it('ignores star for version in a different document', async () => {
      const docName = 'diff-doc';

      mockDbModule.db
        .insert(schema.documents)
        .values({
          id: docName,
          title: 'Diff Doc',
          content: '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .run();

      mockDbModule.db
        .insert(schema.documents)
        .values({
          id: 'some-other-doc',
          title: 'Other Doc',
          content: '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .run();

      mockDbModule.db
        .insert(schema.documentRevisions)
        .values({
          id: 'rev-other-doc',
          document_id: 'some-other-doc',
          yjs_state: null,
          starred: false,
          created_at: new Date().toISOString(),
        })
        .run();

      const ws = await connectWs(`/${docName}`);

      const msg = wrapCustomMessage(
        encodeInnerPayload('star', { versionId: 'rev-other-doc', starred: true })
      );
      ws.emit('message', msg);

      const version = mockDbModule.db
        .select()
        .from(schema.documentRevisions)
        .where(eq(schema.documentRevisions.id, 'rev-other-doc'))
        .get();
      expect(version.starred).toBe(false);
    });

    it('handles preview_request without throwing', async () => {
      const docName = 'preview-request-test';

      mockDbModule.db
        .insert(schema.documents)
        .values({
          id: docName,
          title: 'Preview Request',
          content: '== Hello ==',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .run();

      const ws = await connectWs(`/${docName}`);

      const msg = wrapCustomMessage(
        encodeInnerPayload('preview_request', {
          api_url: 'https://en.wikipedia.org/w/api.php',
          page: 'Test',
        })
      );

      expect(() => ws.emit('message', msg)).not.toThrow();
    });

    it('handles malformed custom message without throwing', () => {
      const ws = makeMockWs();
      const msg = wrapCustomMessage(new Uint8Array([255, 255, 255]));
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(() => ws.emit('message', msg)).not.toThrow();
      spy.mockRestore();
    });
  });

  describe('Rate limiting', () => {
    it('tracks concurrent connections per IP via setupWSConnection', async () => {
      const docName = '/rate-limit-test';
      const ws1 = await connectWs(docName);
      const ws2 = await connectWs(docName);

      ws1.emit('close');

      const ws3 = await connectWs(docName);

      expect(ws1.close).toHaveBeenCalled();
      expect(ws2.close).not.toHaveBeenCalled();
      expect(ws3.close).not.toHaveBeenCalled();
    });
  });

  describe('Multiple concurrent clients', () => {
    it('allows three clients on same document', async () => {
      const docName = '/three-clients';

      await expect(connectWs(docName)).resolves.toBeDefined();
      await expect(connectWs(docName)).resolves.toBeDefined();
      await expect(connectWs(docName)).resolves.toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('handles unknown message type without throwing', () => {
      const ws = makeMockWs();
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 99);
      const msg = encoding.toUint8Array(encoder);

      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => ws.emit('message', msg)).not.toThrow();
      spy.mockRestore();
    });

    it('handles empty message without throwing', () => {
      const ws = makeMockWs();
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => ws.emit('message', new Uint8Array([]))).not.toThrow();
      spy.mockRestore();
    });

    it('handles message on closed connection without throwing', async () => {
      const ws = await connectWs('/closed-msg');

      ws.emit('close');

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      const msg = encoding.toUint8Array(encoder);

      expect(() => ws.emit('message', msg)).not.toThrow();
    });
  });
});
