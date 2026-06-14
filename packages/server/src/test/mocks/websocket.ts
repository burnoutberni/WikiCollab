import { vi } from 'vitest';

interface MockWebSocket {
  readyState: number;
  binaryType: string;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  ping: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  emit: (event: string, ...args: any[]) => void;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

export function createMockWebSocket(): MockWebSocket {
  const listeners: Record<string, Function[]> = {};

  return {
    readyState: 1,
    binaryType: 'arraybuffer',
    send: vi.fn(),
    close: vi.fn(),
    ping: vi.fn(),
    on: vi.fn((event: string, handler: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    }),
    off: vi.fn((event: string, handler: Function) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((h) => h !== handler);
      }
    }),
    emit(event: string, ...args: any[]) {
      if (listeners[event]) {
        listeners[event].forEach((handler) => handler(...args));
      }
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}
