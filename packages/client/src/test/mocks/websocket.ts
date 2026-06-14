import { vi } from 'vitest';
import type { WebsocketProvider } from 'y-websocket';

export function createMockWebsocketProvider(overrides?: Partial<WebsocketProvider>): WebsocketProvider {
  return {
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
    ws: {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
    },
    messageHandlers: {},
    synced: false,
    wsconnected: false,
    ...overrides,
  } as unknown as WebsocketProvider;
}
