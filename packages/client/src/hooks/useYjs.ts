import * as decoding from 'lib0/decoding';
import type * as encoding from 'lib0/encoding';
import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeCustomMessage, encodeCustomMessage, messageCustom, replaceYText } from 'shared';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

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
    anchor: Y.RelativePosition | number;
    head: Y.RelativePosition | number;
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
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#96CEB4',
  '#FFEAA7',
  '#DDA0DD',
  '#98D8C8',
  '#F7DC6F',
  '#BB8FCE',
  '#85C1E9',
  '#82E0AA',
  '#F8C471',
];

function generateColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

type CustomMessageHandler<T = unknown> = (data: T) => void;

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
  const [lastConnected, setLastConnected] = useState<number | null>(null);
  const customHandlersRef = useRef<Map<string, Set<CustomMessageHandler>>>(new Map());
  const [userId] = useState(() => {
    const stored = localStorage.getItem('wikicollab-user-id');
    if (stored) return stored;
    const id = generateUserId();
    localStorage.setItem('wikicollab-user-id', id);
    return id;
  });
  const [userName, setUserNameState] = useState(() => {
    const stored = localStorage.getItem('wikicollab-user-name');
    if (stored) return stored;
    const name = generateUserName();
    localStorage.setItem('wikicollab-user-name', name);
    return name;
  });
  const userNameRef = useRef(userName);
  userNameRef.current = userName;

  const setUserName = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setUserNameState(trimmed);
    localStorage.setItem('wikicollab-user-name', trimmed);
  }, []);

  const [userColor, setUserColorState] = useState(() => {
    const stored = localStorage.getItem('wikicollab-user-color');
    if (stored) return stored;
    const color = generateColor();
    localStorage.setItem('wikicollab-user-color', color);
    return color;
  });

  const setUserColor = useCallback((color: string) => {
    setUserColorState(color);
    localStorage.setItem('wikicollab-user-color', color);
  }, []);

  useEffect(() => {
    if (!docId) {
      setProvider(null);
      setConnected(false);
      setPeers([]);
      setLastConnected(null);
      return;
    }

    setProvider(null);
    setConnected(false);
    setPeers([]);
    setLastConnected(null);

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
    const wsProvider = new WebsocketProvider(wsUrl, docId, ydoc, {
      connect: true,
    });

    const idbPersistence = new IndexeddbPersistence(`wikicollab-${docId}`, ydoc);

    wsProvider.on('status', ({ status }: { status: string }) => {
      setConnected(status === 'connected');
      if (status === 'connected') {
        setLastConnected(Date.now());
      }
    });

    wsProvider.awareness.setLocalStateField('cursor', null);

    const awareness = wsProvider.awareness;

    const updatePeers = () => {
      const states = Array.from(awareness.getStates().entries());
      const seen = new Set<string>();
      const presenceList: Presence[] = [];
      const ytext = ydoc.getText('wikitext');
      for (const [clientId, state] of states) {
        if (clientId === ydoc.clientID) continue;
        const s = state as AwarenessState;
        const uid = s.user?.name || 'Anonymous';
        if (uid === userNameRef.current) continue;
        if (seen.has(uid)) continue;
        seen.add(uid);
        let cursor: { anchor: number; head: number } | null = null;
        if (s.cursor?.anchor != null && s.cursor?.head != null) {
          try {
            const anchorRaw = s.cursor.anchor;
            const headRaw = s.cursor.head;
            if (typeof anchorRaw === 'object' && typeof headRaw === 'object') {
              const anchor = Y.createAbsolutePositionFromRelativePosition(anchorRaw, ydoc);
              const head = Y.createAbsolutePositionFromRelativePosition(headRaw, ydoc);
              if (anchor && head && anchor.type === ytext && head.type === ytext) {
                cursor = { anchor: anchor.index, head: head.index };
              }
            } else if (typeof anchorRaw === 'number' && typeof headRaw === 'number') {
              cursor = { anchor: anchorRaw, head: headRaw };
            }
          } catch {
            cursor = null;
          }
        }
        presenceList.push({
          clientId,
          userId: uid,
          userName: uid,
          color: s.user?.color || '#999',
          cursor,
        });
      }
      setPeers(presenceList);
    };

    awareness.on('change', updatePeers);

    wsProvider.messageHandlers[messageCustom] = (
      _encoder: encoding.Encoder,
      decoder: decoding.Decoder
    ) => {
      try {
        const customData = decoding.readVarUint8Array(decoder);
        const { type, payload } = decodeCustomMessage(customData);
        const handlers = customHandlersRef.current.get(type);
        if (handlers) {
          handlers.forEach((handler) => handler(payload));
        }
      } catch (err) {
        console.warn('Dropped malformed custom message', err);
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

  const getContent = useCallback(() => {
    if (!ytext) return '';
    return ytext.toString();
  }, [ytext]);

  const setContent = useCallback(
    (content: string) => {
      if (!ytext) return;
      replaceYText(ytext, content);
    },
    [ytext]
  );

  const sendCustomMessage = useCallback(
    (type: string, payload: Record<string, string | boolean>) => {
      if (!provider?.ws || provider.ws.readyState !== WebSocket.OPEN) return;
      provider.ws.send(encodeCustomMessage(type, payload) as BufferSource);
    },
    [provider]
  );

  const onCustomMessage = useCallback(<T>(type: string, handler: CustomMessageHandler<T>) => {
    if (!customHandlersRef.current.has(type)) {
      customHandlersRef.current.set(type, new Set());
    }
    customHandlersRef.current.get(type)!.add(handler as CustomMessageHandler);

    return () => {
      customHandlersRef.current.get(type)?.delete(handler as CustomMessageHandler);
    };
  }, []);

  return {
    ydoc,
    ytext,
    provider,
    connected,
    lastConnected,
    peers,
    userId,
    userName,
    userColor,
    setUserName,
    setUserColor,
    getContent,
    setContent,
    sendCustomMessage,
    onCustomMessage,
  };
}
