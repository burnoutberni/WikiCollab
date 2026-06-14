import { describe, it, expect } from 'vitest';

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
    };
    expect(instance.name).toBe('Wikipedia');
  });

  it('DocumentRevision interface has required fields', () => {
    const revision: DocumentRevision = {
      id: 'rev1',
      document_id: 'doc1',
      yjs_state: new Uint8Array(),
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
