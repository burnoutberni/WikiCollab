import { useCallback, useEffect, useState } from 'react';
import type { Document, DocumentVisibility, Version } from 'shared';

export type { Document, Version };

const API_BASE = '/api';

/**
 * Loads the document list and keeps a separate queue of newly discovered documents until accepted.
 * Polls the API every 5 seconds after the initial load.
 */
export function useDocuments() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDocs, setPendingDocs] = useState<Document[]>([]);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/docs`);
      const data = await res.json();
      setDocuments(data);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    if (loading) return;

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/docs`);
        const latest: Document[] = await res.json();
        setDocuments((current) => {
          const currentIds = new Set(current.map((d) => d.id));
          const newDocs = latest.filter((d) => !currentIds.has(d.id));
          if (newDocs.length > 0) {
            setPendingDocs((prev) => {
              const existingIds = new Set(prev.map((d) => d.id));
              const toAdd = newDocs.filter((d) => !existingIds.has(d.id));
              return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
            });
          }
          return current;
        });
      } catch (err) {
        console.error('Failed to poll documents:', err);
      }
    };

    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [loading]);

  const loadPending = useCallback(() => {
    setDocuments((prev) => {
      const existingIds = new Set(prev.map((d) => d.id));
      const toAdd = pendingDocs.filter((d) => !existingIds.has(d.id));
      return toAdd.length > 0 ? [...toAdd, ...prev] : prev;
    });
    setPendingDocs([]);
  }, [pendingDocs]);

  const createDocument = useCallback(
    async (options?: {
      title?: string;
      slug?: string;
      content?: string;
      visibility?: DocumentVisibility;
    }) => {
      const res = await fetch(`${API_BASE}/docs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: options?.title,
          slug: options?.slug || undefined,
          content: options?.content || undefined,
          visibility: options?.visibility || undefined,
        }),
      });
      const doc = await res.json();
      if (!res.ok) {
        throw new Error(doc.error || 'Failed to create document');
      }
      if (doc.visibility !== 'unlisted') {
        setDocuments((prev) => [doc, ...prev]);
      }
      return doc;
    },
    []
  );

  const deleteDocument = useCallback(async (id: string) => {
    await fetch(`${API_BASE}/docs/${id}`, { method: 'DELETE' });
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const updateDocument = useCallback(async (id: string, updates: Partial<Document>) => {
    const res = await fetch(`${API_BASE}/docs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const doc = await res.json();
    setDocuments((prev) => prev.map((d) => (d.id === id ? doc : d)));
    return doc;
  }, []);

  return {
    documents,
    loading,
    pendingCount: pendingDocs.length,
    loadPending,
    createDocument,
    deleteDocument,
    updateDocument,
    refetch: fetchDocuments,
  };
}

/** Loads a single document by id and exposes local state for optimistic updates. */
export function useDocument(id: string | null) {
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    const fetchDoc = async () => {
      try {
        const res = await fetch(`${API_BASE}/docs/${id}`);
        if (res.ok) {
          const data = await res.json();
          setDocument(data);
        }
      } catch (error) {
        console.error('Failed to fetch document:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDoc();
  }, [id]);

  return { document, loading, setDocument };
}

/**
 * Fetches version metadata and optionally mirrors star/version updates over collaborative messages.
 */
export function useVersions(
  documentId: string | null,
  sendCustomMessage?: (type: string, payload: Record<string, string | boolean>) => void,
  onCustomMessage?: <T>(type: string, handler: (data: T) => void) => () => void
) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchVersions = useCallback(async () => {
    if (!documentId) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/docs/${documentId}/versions`);
      const data = await res.json();
      setVersions(data);
    } catch (error) {
      console.error('Failed to fetch versions:', error);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  useEffect(() => {
    if (!onCustomMessage || !documentId) return;

    const unsubscribe = onCustomMessage('new_version', (payload: { documentId: string }) => {
      if (payload.documentId === documentId) {
        fetchVersions();
      }
    });

    return unsubscribe;
  }, [onCustomMessage, documentId, fetchVersions]);

  useEffect(() => {
    if (!onCustomMessage) return;

    const unsubscribe = onCustomMessage(
      'star',
      (payload: { versionId: string; starred: boolean }) => {
        setVersions((prev) =>
          prev.map((v) => (v.id === payload.versionId ? { ...v, starred: payload.starred } : v))
        );
      }
    );

    return unsubscribe;
  }, [onCustomMessage]);

  const starVersion = useCallback(
    async (versionId: string) => {
      if (!documentId) return;

      if (sendCustomMessage) {
        sendCustomMessage('star', { versionId, starred: true });
      } else {
        try {
          const res = await fetch(`${API_BASE}/docs/${documentId}/versions/${versionId}/star`, {
            method: 'POST',
          });
          if (!res.ok) throw new Error('Failed to star version');
          setVersions((prev) =>
            prev.map((v) => (v.id === versionId ? { ...v, starred: true } : v))
          );
        } catch (error) {
          console.error('Failed to star version:', error);
        }
      }
    },
    [documentId, sendCustomMessage]
  );

  const unstarVersion = useCallback(
    async (versionId: string) => {
      if (!documentId) return;

      if (sendCustomMessage) {
        sendCustomMessage('star', { versionId, starred: false });
      } else {
        try {
          const res = await fetch(`${API_BASE}/docs/${documentId}/versions/${versionId}/star`, {
            method: 'DELETE',
          });
          if (!res.ok) throw new Error('Failed to unstar version');
          setVersions((prev) =>
            prev.map((v) => (v.id === versionId ? { ...v, starred: false } : v))
          );
        } catch (error) {
          console.error('Failed to unstar version:', error);
        }
      }
    },
    [documentId, sendCustomMessage]
  );

  const getVersionPreview = useCallback(
    async (versionId: string): Promise<string | null> => {
      if (!documentId) return null;

      try {
        const res = await fetch(`${API_BASE}/docs/${documentId}/versions/${versionId}/preview`);
        if (res.ok) {
          const data = await res.json();
          return data.content || null;
        }
      } catch (error) {
        console.error('Failed to fetch version preview:', error);
      }
      return null;
    },
    [documentId]
  );

  return { versions, loading, fetchVersions, starVersion, unstarVersion, getVersionPreview };
}
