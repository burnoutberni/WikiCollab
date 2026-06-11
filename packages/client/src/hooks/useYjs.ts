import { useState, useEffect, useCallback } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';

export interface Presence {
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

function generateColor(): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
    '#BB8FCE', '#85C1E9', '#82E0AA', '#F8C471',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

export function useYjs(docId: string | null) {
  const [ydoc] = useState(() => new Y.Doc());
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const [ytext, setYtext] = useState<Y.Text | null>(null);
  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState<Presence[]>([]);
  const [userId] = useState(() => {
    const stored = localStorage.getItem('wiki-colab-user-id');
    if (stored) return stored;
    const id = generateUserId();
    localStorage.setItem('wiki-colab-user-id', id);
    return id;
  });
  const [userName] = useState(() => {
    const stored = localStorage.getItem('wiki-colab-user-name');
    if (stored) return stored;
    const name = generateUserName();
    localStorage.setItem('wiki-colab-user-name', name);
    return name;
  });
  const [userColor] = useState(() => {
    const stored = localStorage.getItem('wiki-colab-user-color');
    if (stored) return stored;
    const color = generateColor();
    localStorage.setItem('wiki-colab-user-color', color);
    return color;
  });

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

    wsProvider.awareness.setLocalStateField('user', {
      name: userName,
      color: userColor,
    });
    wsProvider.awareness.setLocalStateField('cursor', null);

    const awareness = wsProvider.awareness;

    const updatePeers = () => {
      const states = Array.from(awareness.getStates().entries());
      const presenceList: Presence[] = states
        .filter(([clientId]) => clientId !== ydoc.clientID)
        .map(([, state]) => {
          const s = state as AwarenessState;
          return {
            userId: s.user?.name || 'Unknown',
            userName: s.user?.name || 'Anonymous',
            color: s.user?.color || '#999',
            cursor: s.cursor || null,
          };
        });
      setPeers(presenceList);
    };

    awareness.on('change', updatePeers);

    const text = ydoc.getText('wikitext');
    setYtext(text);
    setProvider(wsProvider);

    return () => {
      awareness.off('change', updatePeers);
      wsProvider.destroy();
      idbPersistence.destroy();
    };
  }, [docId, ydoc, userName, userColor]);

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

  return {
    ydoc,
    ytext,
    provider,
    connected,
    peers,
    userId,
    userName,
    userColor,
    updateCursor,
    clearCursor,
    getContent,
    setContent,
  };
}
