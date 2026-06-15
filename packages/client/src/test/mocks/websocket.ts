import { vi } from 'vitest';
import type { WebsocketProvider } from 'y-websocket';

export function createMockWebsocketProvider(
  overrides?: Partial<WebsocketProvider>
): WebsocketProvider {
  const { awareness: awarenessOverrides, ...restOverrides } = overrides ?? {};

  const defaultAwareness = {
    setLocalState: vi.fn(),
    setLocalStateField: vi.fn(),
    getStates: vi.fn().mockReturnValue(new Map()),
    on: vi.fn(),
    off: vi.fn(),
    getState: vi.fn().mockReturnValue({}),
  };

  return {
    awareness: awarenessOverrides
      ? { ...defaultAwareness, ...awarenessOverrides }
      : defaultAwareness,
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
    ...restOverrides,
  } as unknown as WebsocketProvider;
}
