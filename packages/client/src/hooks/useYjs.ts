import { useState, useEffect, useCallback, useRef } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

export interface Presence {
  clientId: number;
  userId: string;
  userName: string;
  color: string;
  cursor: { anchor: number; head: number } | null;
}

export interface AwarenessState {
  user: {
    name: string;
    color: string;
  };
  cursor: {
    anchor: number;
    head: number;
  } | null;
}

function generateUserId(): string {
  return Math.random().toString(36).substring(2, 15);
}

function generateUserName(): string {
  const adjectives = ['Happy', 'Swift', 'Brave', 'Calm', 'Eager', 'Fair', 'Kind', 'Bold'];
  const nouns = ['Panda', 'Eagle', 'Tiger', 'Dolphin', 'Wolf', 'Fox', 'Bear', 'Hawk'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj} ${noun}`;
}

export const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#BB8FCE', '#85C1E9', '#82E0AA', '#F8C471',
];

function generateColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

type CustomMessageHandler = (data: any) => void;

export function useYjs(docId: string | null) {
  const ydocRef = useRef<Y.Doc | null>(null);
  if (!ydocRef.current) {
    ydocRef.current = new Y.Doc();
  }
  const ydoc = ydocRef.current;
  const ytextRef = useRef<Y.Text>(ydoc.getText('wikitext'));
  const ytext = ytextRef.current;
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState<Presence[]>([]);
  const customHandlersRef = useRef<Map<string, Set<CustomMessageHandler>>>(new Map());
  const [userId] = useState(() => {
    const stored = localStorage.getItem('wiki-colab-user-id');
    if (stored) return stored;
    const id = generateUserId();
    localStorage.setItem('wiki-colab-user-id', id);
    return id;
  });
  const [userName, setUserNameState] = useState(() => {
    const stored = localStorage.getItem('wiki-colab-user-name');
    if (stored) return stored;
    const name = generateUserName();
    localStorage.setItem('wiki-colab-user-name', name);
    return name;
  });

  const setUserName = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setUserNameState(trimmed);
    localStorage.setItem('wiki-colab-user-name', trimmed);
  }, []);

  const [userColor, setUserColorState] = useState(() => {
    const stored = localStorage.getItem('wiki-colab-user-color');
    if (stored) return stored;
    const color = generateColor();
    localStorage.setItem('wiki-colab-user-color', color);
    return color;
  });

  const setUserColor = useCallback((color: string) => {
    setUserColorState(color);
    localStorage.setItem('wiki-colab-user-color', color);
  }, []);

  useEffect(() => {
    if (!docId) return;

    const wsUrl = `ws://${window.location.host}/ws`;
    const wsProvider = new WebsocketProvider(wsUrl, docId, ydoc, {
      connect: true,
    });

    const idbPersistence = new IndexeddbPersistence(`wiki-colab-${docId}`, ydoc);

    wsProvider.on('status', ({ status }: { status: string }) => {
      setConnected(status === 'connected');
    });

    wsProvider.awareness.setLocalStateField('cursor', null);

    const awareness = wsProvider.awareness;

    const updatePeers = () => {
      const states = Array.from(awareness.getStates().entries());
      const presenceList: Presence[] = states
        .filter(([clientId]) => clientId !== ydoc.clientID)
        .map(([clientId, state]) => {
          const s = state as AwarenessState;
          return {
            clientId,
            userId: s.user?.name || 'Unknown',
            userName: s.user?.name || 'Anonymous',
            color: s.user?.color || '#999',
            cursor: s.cursor || null,
          };
        });
      setPeers(presenceList);
    };

    awareness.on('change', updatePeers);

    const messageCustom = 2;
    wsProvider.messageHandlers[messageCustom] = (
      _encoder: encoding.Encoder,
      decoder: decoding.Decoder,
      _provider: WebsocketProvider,
      _inc: boolean
    ) => {
      const customData = decoding.readVarUint8Array(decoder);
      const customDecoder = decoding.createDecoder(customData);
      const customType = decoding.readVarString(customDecoder);
      const handlers = customHandlersRef.current.get(customType);
      if (handlers) {
        const payload: any = {};
        try {
          while (customDecoder.pos < customData.length) {
            const key = decoding.readVarString(customDecoder);
            const valueType = decoding.readVarUint(customDecoder);
            switch (valueType) {
              case 0: payload[key] = decoding.readVarString(customDecoder); break;
              case 1: payload[key] = decoding.readVarUint(customDecoder) === 1; break;
            }
          }
        } catch {}
        handlers.forEach((handler) => handler(payload));
      }
    };

    setProvider(wsProvider);

    return () => {
      awareness.off('change', updatePeers);
      wsProvider.destroy();
      idbPersistence.destroy();
    };
  }, [docId, ydoc]);

  useEffect(() => {
    if (!provider) return;
    provider.awareness.setLocalStateField('user', {
      name: userName,
      color: userColor,
    });
  }, [provider, userName, userColor]);

  const updateCursor = useCallback((anchor: number, head: number) => {
    if (!provider) return;
    provider.awareness.setLocalStateField('cursor', { anchor, head });
  }, [provider]);

  const clearCursor = useCallback(() => {
    if (!provider) return;
    provider.awareness.setLocalStateField('cursor', null);
  }, [provider]);

  const getContent = useCallback(() => {
    if (!ytext) return '';
    return ytext.toString();
  }, [ytext]);

  const setContent = useCallback((content: string) => {
    if (!ytext) return;
    ydoc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, content);
    });
  }, [ytext, ydoc]);

  const sendCustomMessage = useCallback((type: string, payload: Record<string, string | boolean>) => {
    if (!provider?.ws || provider.ws.readyState !== WebSocket.OPEN) return;

    const messageCustom = 2;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageCustom);

    const payloadEncoder = encoding.createEncoder();
    encoding.writeVarString(payloadEncoder, type);
    for (const [key, value] of Object.entries(payload)) {
      encoding.writeVarString(payloadEncoder, key);
      if (typeof value === 'string') {
        encoding.writeVarUint(payloadEncoder, 0);
        encoding.writeVarString(payloadEncoder, value);
      } else {
        encoding.writeVarUint(payloadEncoder, 1);
        encoding.writeVarUint(payloadEncoder, value ? 1 : 0);
      }
    }

    encoding.writeVarUint8Array(encoder, encoding.toUint8Array(payloadEncoder));
    provider.ws.send(encoding.toUint8Array(encoder));
  }, [provider]);

  const onCustomMessage = useCallback((type: string, handler: CustomMessageHandler) => {
    if (!customHandlersRef.current.has(type)) {
      customHandlersRef.current.set(type, new Set());
    }
    customHandlersRef.current.get(type)!.add(handler);

    return () => {
      customHandlersRef.current.get(type)?.delete(handler);
    };
  }, []);

  return {
    ydoc,
    ytext,
    provider,
    connected,
    peers,
    userId,
    userName,
    userColor,
    setUserName,
    setUserColor,
    updateCursor,
    clearCursor,
    getContent,
    setContent,
    sendCustomMessage,
    onCustomMessage,
  };
}
