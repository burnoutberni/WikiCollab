import { vi } from 'vitest';

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

vi.mock('y-websocket', () => ({
  WebsocketProvider: vi.fn().mockImplementation(() => ({
    awareness: {
      setLocalState: vi.fn(),
      setLocalStateField: vi.fn(),
      getStates: vi.fn().mockReturnValue(new Map()),
      on: vi.fn(),
      off: vi.fn(),
      getState: vi.fn().mockReturnValue({}),
    },
    on: vi.fn(),
    off: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    destroy: vi.fn(),
    ws: { readyState: 1, send: vi.fn(), close: vi.fn() },
    messageHandlers: {},
    synced: false,
    wsconnected: false,
  })),
}));

vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    off: vi.fn(),
    destroy: vi.fn(),
  })),
}));

vi.mock('y-codemirror.next', () => ({
  yCollab: vi.fn().mockReturnValue({}),
}));

vi.mock('lib0/encoding', () => ({
  createEncoder: vi.fn().mockReturnValue({}),
  writeVarUint: vi.fn(),
  writeVarString: vi.fn(),
  writeVarUint8Array: vi.fn(),
  toUint8Array: vi.fn().mockReturnValue(new Uint8Array()),
}));

vi.mock('lib0/decoding', () => ({
  createDecoder: vi.fn().mockReturnValue({ pos: 0 }),
  readVarUint: vi.fn().mockReturnValue(0),
  readVarString: vi.fn().mockReturnValue(''),
  readVarUint8Array: vi.fn().mockReturnValue(new Uint8Array()),
}));
