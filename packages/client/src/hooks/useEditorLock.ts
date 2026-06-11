import { useState, useEffect, useCallback, useRef } from 'react';

const TAB_ID_KEY = 'wikicollab-tab-id';

function getTabId(): string {
  let id = sessionStorage.getItem(TAB_ID_KEY);
  if (!id) {
    id = crypto.randomUUID().slice(0, 8);
    sessionStorage.setItem(TAB_ID_KEY, id);
  }
  return id;
}

interface Lock {
  tabId: string;
  documentId: string;
  timestamp: number;
}

function lockKey(documentId: string) {
  return `wikicollab-editor-lock-${documentId}`;
}

const STALE_MS = 30_000;

export function useEditorLock(documentId: string | null) {
  const [lockedByOther, setLockedByOther] = useState<Lock | null>(null);
  const tabIdRef = useRef(getTabId());
  const activeLockRef = useRef<Lock | null>(null);

  const claim = useCallback(() => {
    if (!documentId) return;
    const lock: Lock = { tabId: tabIdRef.current, documentId, timestamp: Date.now() };
    localStorage.setItem(lockKey(documentId), JSON.stringify(lock));
    activeLockRef.current = lock;
    setLockedByOther(null);
  }, [documentId]);

  const takeOver = useCallback(() => {
    claim();
  }, [claim]);

  const release = useCallback(() => {
    if (!documentId) return;
    const stored = localStorage.getItem(lockKey(documentId));
    if (stored) {
      try {
        const lock: Lock = JSON.parse(stored);
        if (lock.tabId === tabIdRef.current) {
          localStorage.removeItem(lockKey(documentId));
        }
      } catch {
        localStorage.removeItem(lockKey(documentId));
      }
    }
    activeLockRef.current = null;
    setLockedByOther(null);
  }, [documentId]);

  const isStale = useCallback((lock: Lock) => {
    return Date.now() - lock.timestamp > STALE_MS;
  }, []);

  // Claim lock on mount, release on unmount, refresh periodically
  useEffect(() => {
    if (!documentId) return;

    // Check existing lock
    const stored = localStorage.getItem(lockKey(documentId));
    if (stored) {
      try {
        const lock: Lock = JSON.parse(stored);
        if (lock.tabId === tabIdRef.current) {
          claim();
        } else if (isStale(lock)) {
          claim();
        } else {
          setLockedByOther(lock);
        }
      } catch {
        claim();
      }
    } else {
      claim();
    }

    const interval = setInterval(() => {
      const current = localStorage.getItem(lockKey(documentId));
      if (current) {
        try {
          const lock: Lock = JSON.parse(current);
          if (lock.tabId === tabIdRef.current) {
            claim();
          } else if (isStale(lock)) {
            claim();
          }
        } catch {
          // ignore
        }
      }
    }, 10_000);

    const handleBeforeUnload = () => {
      release();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      release();
    };
  }, [documentId, claim, release, isStale]);

  // Listen for lock changes from other tabs
  useEffect(() => {
    if (!documentId) return;

    const handler = (e: StorageEvent) => {
      if (e.key !== lockKey(documentId)) return;

      if (e.newValue) {
        // Someone claimed or refreshed the lock
        try {
          const lock: Lock = JSON.parse(e.newValue);
          if (lock.tabId !== tabIdRef.current) {
            setLockedByOther(lock);
          }
        } catch {
          // ignore
        }
      } else {
        // Lock was removed
        setLockedByOther(null);
      }
    };

    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [documentId]);

  return { lockedByOther, takeOver, claim };
}
