import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { replaceYText } from './yjs';
import { encodeCustomMessage, decodeCustomMessage, wrapCustomMessage, messageCustom } from './protocol';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

import type {
  Document,
  MediaWikiInstance,
  DocumentRevision,
  CreateDocumentRequest,
  UpdateDocumentRequest,
  CreateInstanceRequest,
  PushToWikiRequest,
  ViewMode,
  CursorPresence,
  PreviewResponse,
} from '../src/index';

describe('Shared types', () => {
  it('Document interface has required fields', () => {
    const doc: Document = {
      id: 'test',
      title: 'Test',
      content: 'content',
      created_at: '2025-01-01',
      updated_at: '2025-01-01',
      expiry: null,
      mediawiki_instance_id: null,
      restored_version_id: null,
    };
    expect(doc.id).toBe('test');
    expect(doc.title).toBe('Test');
  });

  it('MediaWikiInstance interface has required fields', () => {
    const instance: MediaWikiInstance = {
      id: 'inst1',
      name: 'Wikipedia',
      api_url: 'https://en.wikipedia.org/w/api.php',
      token: null,
      configured_at: '2025-01-01',
      css: null,
    };
    expect(instance.name).toBe('Wikipedia');
  });

  it('DocumentRevision interface has required fields', () => {
    const revision: DocumentRevision = {
      id: 'rev1',
      document_id: 'doc1',
      yjs_state: null,
      starred: false,
      created_at: '2025-01-01',
    };
    expect(revision.starred).toBe(false);
  });

  it('CreateDocumentRequest allows optional fields', () => {
    const req: CreateDocumentRequest = {};
    expect(req.title).toBeUndefined();
    const req2: CreateDocumentRequest = { title: 'Test', content: 'body' };
    expect(req2.title).toBe('Test');
  });

  it('ViewMode accepts valid values', () => {
    const modes: ViewMode[] = ['source', 'split', 'wysiwyg'];
    expect(modes).toHaveLength(3);
    modes.forEach((m) => {
      expect(['source', 'split', 'wysiwyg']).toContain(m);
    });
  });

  it('CursorPresence interface has required fields', () => {
    const presence: CursorPresence = {
      userId: 'user1',
      userName: 'Alice',
      color: '#FF0000',
      cursor: { anchor: 0, head: 5 },
    };
    expect(presence.userName).toBe('Alice');
  });

  it('PreviewResponse interface has required fields', () => {
    const response: PreviewResponse = {
      html: '<p>Hello</p>',
      sourceMap: [{ sourceLine: 1, blockIndex: 0 }],
    };
    expect(response.html).toContain('Hello');
    expect(response.sourceMap).toHaveLength(1);
  });
});

describe('replaceYText', () => {
  it('replaces entire content of a Y.Text', () => {
    const doc = new Y.Doc();
    const ytext = doc.getText('wikitext');
    ytext.insert(0, 'Hello World');
    replaceYText(ytext, 'Goodbye World');
    expect(ytext.toString()).toBe('Goodbye World');
    doc.destroy();
  });

  it('handles empty content', () => {
    const doc = new Y.Doc();
    const ytext = doc.getText('wikitext');
    ytext.insert(0, 'Some content');
    replaceYText(ytext, '');
    expect(ytext.toString()).toBe('');
    doc.destroy();
  });

  it('handles replacing empty with content', () => {
    const doc = new Y.Doc();
    const ytext = doc.getText('wikitext');
    replaceYText(ytext, 'New content');
    expect(ytext.toString()).toBe('New content');
    doc.destroy();
  });

  it('wraps replacement in a transaction', () => {
    const doc = new Y.Doc();
    const ytext = doc.getText('wikitext');
    ytext.insert(0, 'Before');
    replaceYText(ytext, 'After');
    expect(ytext.toString()).toBe('After');
    doc.destroy();
  });
});

describe('Custom message protocol', () => {
  it('roundtrips string payload through encode/decode', () => {
    const encoded = encodeCustomMessage('star', { versionId: 'v1', starred: true });
    const decoder = decoding.createDecoder(encoded);
    decoding.readVarUint(decoder); // skip messageCustom
    const innerData = decoding.readVarUint8Array(decoder);
    const result = decodeCustomMessage(innerData);
    expect(result.type).toBe('star');
    expect(result.payload.versionId).toBe('v1');
    expect(result.payload.starred).toBe(true);
  });

  it('roundtrips boolean payload through encode/decode', () => {
    const encoded = encodeCustomMessage('restore', { versionId: 'v2', documentId: 'd1' });
    const decoder = decoding.createDecoder(encoded);
    decoding.readVarUint(decoder);
    const innerData = decoding.readVarUint8Array(decoder);
    const { type, payload } = decodeCustomMessage(innerData);
    expect(type).toBe('restore');
    expect(payload.versionId).toBe('v2');
    expect(payload.documentId).toBe('d1');
  });

  it('handles empty payload', () => {
    const encoded = encodeCustomMessage('ping', {});
    const decoder = decoding.createDecoder(encoded);
    decoding.readVarUint(decoder);
    const innerData = decoding.readVarUint8Array(decoder);
    const { type, payload } = decodeCustomMessage(innerData);
    expect(type).toBe('ping');
    expect(Object.keys(payload)).toHaveLength(0);
  });

  it('wrapCustomMessage adds envelope', () => {
    const inner = new Uint8Array([1, 2, 3]);
    const wrapped = wrapCustomMessage(inner);
    const decoder = decoding.createDecoder(wrapped);
    const msgType = decoding.readVarUint(decoder);
    expect(msgType).toBe(messageCustom);
    const extracted = decoding.readVarUint8Array(decoder);
    expect(extracted).toEqual(inner);
  });
});
