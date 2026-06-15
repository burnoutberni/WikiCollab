import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('yjs', () => {
  class MockText {
    private _content = '';
    get length() {
      return this._content.length;
    }
    toString() {
      return this._content;
    }
    insert(pos: number, text: string) {
      this._content = this._content.slice(0, pos) + text + this._content.slice(pos);
    }
    delete(pos: number, length: number) {
      this._content = this._content.slice(0, pos) + this._content.slice(pos + length);
    }
  }

  class MockDoc {
    clientID = Math.floor(Math.random() * 1000000);
    private _texts = new Map<string, MockText>();
    getText(name: string): MockText {
      if (!this._texts.has(name)) {
        this._texts.set(name, new MockText());
      }
      return this._texts.get(name)!;
    }
    on() {}
    off() {}
    transact(fn: () => void) {
      fn();
    }
    destroy() {}
  }

  return {
    Doc: MockDoc,
    Text: MockText,
    applyUpdate: vi.fn(),
    encodeStateAsUpdate: vi.fn().mockReturnValue(new Uint8Array()),
    createAbsolutePositionFromRelativePosition: vi.fn().mockReturnValue(null),
    RelativePosition: vi.fn(),
  };
});

vi.mock('y-websocket', () => {
  class MockWebsocketProvider {
    awareness = {
      setLocalState: vi.fn(),
      setLocalStateField: vi.fn(),
      getStates: vi.fn().mockReturnValue(new Map()),
      on: vi.fn(),
      off: vi.fn(),
      getState: vi.fn().mockReturnValue({}),
    };
    private statusListeners: Array<(event: { status: string }) => void> = [];
    on = vi.fn((event: string, handler: (event: { status: string }) => void) => {
      if (event === 'status') {
        this.statusListeners.push(handler);
      }
    });
    off = vi.fn();
    connect = vi.fn();
    disconnect = vi.fn();
    destroy = vi.fn();
    ws = { readyState: 1, send: vi.fn(), close: vi.fn() };
    messageHandlers: Record<string, (...args: unknown[]) => unknown> = {};
    synced = false;
    wsconnected = false;

    emitStatus(status: string) {
      this.statusListeners.forEach((listener) => listener({ status }));
    }
  }
  return { WebsocketProvider: MockWebsocketProvider };
});

vi.mock('y-indexeddb', () => {
  class MockIndexeddbPersistence {
    on = vi.fn();
    off = vi.fn();
    destroy = vi.fn();
  }
  return { IndexeddbPersistence: MockIndexeddbPersistence };
});

vi.mock('lib0/encoding', () => ({
  createEncoder: vi.fn(() => ({})),
  writeVarUint: vi.fn(),
  writeVarString: vi.fn(),
  writeVarUint8Array: vi.fn(),
  toUint8Array: vi.fn(() => new Uint8Array()),
}));

vi.mock('lib0/decoding', () => ({
  createDecoder: vi.fn(() => ({ pos: 0 })),
  readVarUint: vi.fn(() => 0),
  readVarString: vi.fn(() => ''),
  readVarUint8Array: vi.fn(() => new Uint8Array()),
}));

vi.mock('shared', () => ({
  decodeCustomMessage: vi.fn(() => ({ type: '', payload: {} })),
  encodeCustomMessage: vi.fn(() => new Uint8Array()),
  messageCustom: 2,
  replaceYText: vi.fn(),
}));

import { useYjs } from './useYjs';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('useYjs', () => {
  it('creates a Yjs document and text object', () => {
    const { result } = renderHook(() => useYjs('test-doc'));

    expect(result.current.ydoc).toBeDefined();
    expect(result.current.ytext).toBeDefined();
  });

  it('reads existing user identity from localStorage', () => {
    localStorage.setItem('wikicollab-user-id', 'custom-id');
    localStorage.setItem('wikicollab-user-name', 'Custom User');
    localStorage.setItem('wikicollab-user-color', '#123456');

    const { result } = renderHook(() => useYjs('test-doc'));

    expect(result.current.userId).toBe('custom-id');
    expect(result.current.userName).toBe('Custom User');
    expect(result.current.userColor).toBe('#123456');
  });

  it('generates and stores user identity when localStorage is empty', () => {
    const { result } = renderHook(() => useYjs('test-doc'));

    expect(result.current.userId).toBeTruthy();
    expect(result.current.userName).toBeTruthy();
    expect(result.current.userColor).toBeTruthy();
    expect(localStorage.getItem('wikicollab-user-id')).toBe(result.current.userId);
    expect(localStorage.getItem('wikicollab-user-name')).toBe(result.current.userName);
    expect(localStorage.getItem('wikicollab-user-color')).toBe(result.current.userColor);
  });

  it('setUserName persists to localStorage', () => {
    const { result } = renderHook(() => useYjs('test-doc'));

    act(() => {
      result.current.setUserName('New Name');
    });

    expect(result.current.userName).toBe('New Name');
    expect(localStorage.getItem('wikicollab-user-name')).toBe('New Name');
  });

  it('setUserName ignores empty or whitespace-only names', () => {
    const { result } = renderHook(() => useYjs('test-doc'));

    const original = result.current.userName;

    act(() => {
      result.current.setUserName('   ');
    });

    expect(result.current.userName).toBe(original);
  });

  it('setUserColor persists to localStorage', () => {
    const { result } = renderHook(() => useYjs('test-doc'));

    act(() => {
      result.current.setUserColor('#FF0000');
    });

    expect(result.current.userColor).toBe('#FF0000');
    expect(localStorage.getItem('wikicollab-user-color')).toBe('#FF0000');
  });

  it('registers custom message handlers via onCustomMessage', () => {
    const { result } = renderHook(() => useYjs('test-doc'));

    const handler = vi.fn();
    act(() => {
      result.current.onCustomMessage('test_type', handler);
    });
  });

  it('onCustomMessage returns an unsubscribe function', () => {
    const { result } = renderHook(() => useYjs('test-doc'));

    const handler = vi.fn();
    let unsubscribe: (() => void) | undefined;

    act(() => {
      unsubscribe = result.current.onCustomMessage('test_type', handler);
    });

    expect(typeof unsubscribe).toBe('function');
  });

  it('getContent returns empty string when no content set', () => {
    const { result } = renderHook(() => useYjs('test-doc'));

    expect(result.current.getContent()).toBe('');
  });

  it('resets connection metadata when the document id changes', async () => {
    const { result, rerender } = renderHook(({ docId }) => useYjs(docId), {
      initialProps: { docId: 'doc-a' as string | null },
    });

    await waitFor(() => {
      expect(result.current.provider).toBeDefined();
    });

    act(() => {
      const provider = result.current.provider as unknown as {
        emitStatus: (status: string) => void;
      };
      provider.emitStatus('connected');
    });

    expect(result.current.connected).toBe(true);
    expect(result.current.lastConnected).not.toBeNull();

    rerender({ docId: 'doc-b' });

    await waitFor(() => {
      expect(result.current.connected).toBe(false);
      expect(result.current.lastConnected).toBeNull();
      expect(result.current.peers).toEqual([]);
    });
  });

  it('clears provider state when the document id becomes null', async () => {
    const { result, rerender } = renderHook(({ docId }) => useYjs(docId), {
      initialProps: { docId: 'doc-a' as string | null },
    });

    await waitFor(() => {
      expect(result.current.provider).toBeDefined();
    });

    act(() => {
      const provider = result.current.provider as unknown as {
        emitStatus: (status: string) => void;
      };
      provider.emitStatus('connected');
    });

    rerender({ docId: null });

    await waitFor(() => {
      expect(result.current.provider).toBeNull();
      expect(result.current.connected).toBe(false);
      expect(result.current.lastConnected).toBeNull();
      expect(result.current.peers).toEqual([]);
    });
  });
});
