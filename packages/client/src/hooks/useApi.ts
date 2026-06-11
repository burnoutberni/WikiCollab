import { useState, useEffect, useCallback } from 'react';

const API_BASE = '/api';

export interface Document {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  expiry: string | null;
  mediawiki_instance_id: string | null;
  restored_version_id: string | null;
}

export interface MediaWikiInstance {
  id: string;
  name: string;
  api_url: string;
  token: string | null;
  configured_at: string;
  css: string | null;
}

export interface Version {
  id: string;
  document_id: string;
  yjs_state: string | null;
  starred: boolean;
  created_at: string;
}

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

  const createDocument = useCallback(async (title?: string, slug?: string) => {
    const res = await fetch(`${API_BASE}/docs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, slug: slug || undefined }),
    });
    const doc = await res.json();
    if (!res.ok) {
      throw new Error(doc.error || 'Failed to create document');
    }
    setDocuments((prev) => [doc, ...prev]);
    return doc;
  }, []);

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

  return { documents, loading, pendingCount: pendingDocs.length, loadPending, createDocument, deleteDocument, updateDocument, refetch: fetchDocuments };
}

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

export function useInstances() {
  const [instances, setInstances] = useState<MediaWikiInstance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('wikicollab-instances');
      if (stored) {
        const parsed = JSON.parse(stored);
        setInstances(Array.isArray(parsed) ? parsed : parsed ? [parsed] : []);
      }
    } catch (err) {
      console.error('Failed to load instances from localStorage:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== 'wikicollab-instances') return;
      try {
        const parsed = e.newValue ? JSON.parse(e.newValue) : [];
        setInstances(Array.isArray(parsed) ? parsed : parsed ? [parsed] : []);
      } catch (err) {
        console.error('Failed to parse instances from storage event:', err);
        setInstances([]);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const persist = useCallback((next: MediaWikiInstance[]) => {
    setInstances(next);
    localStorage.setItem('wikicollab-instances', JSON.stringify(next));
  }, []);

  const createInstance = useCallback(async (name: string, apiUrl: string, token?: string) => {
    const id = crypto.randomUUID().slice(0, 7);
    const instance: MediaWikiInstance = {
      id,
      name,
      api_url: apiUrl,
      token: token || null,
      configured_at: new Date().toISOString(),
      css: null,
    };
    persist([instance]);
    return instance;
  }, [persist]);

  const deleteInstance = useCallback(async (id: string) => {
    persist(instances.filter((i) => i.id !== id));
  }, [instances, persist]);

  const updateInstance = useCallback(async (id: string, updates: { name?: string; api_url?: string; token?: string }) => {
    const next = instances.map((i) =>
      i.id === id ? { ...i, ...updates } : i
    );
    persist(next);
    return next.find((i) => i.id === id)!;
  }, [instances, persist]);

  return { instances, loading, createInstance, deleteInstance, updateInstance };
}

export function useVersions(
  documentId: string | null,
  sendCustomMessage?: (type: string, payload: Record<string, string | boolean>) => void,
  onCustomMessage?: (type: string, handler: (data: any) => void) => () => void
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

    const unsubscribe = onCustomMessage('star', (payload: { versionId: string; starred: boolean }) => {
      setVersions((prev) =>
        prev.map((v) => (v.id === payload.versionId ? { ...v, starred: payload.starred } : v))
      );
    });

    return unsubscribe;
  }, [onCustomMessage]);

  const starVersion = useCallback(async (versionId: string) => {
    if (!documentId) return;

    if (sendCustomMessage) {
      sendCustomMessage('star', { versionId, starred: true });
    } else {
      try {
        await fetch(`${API_BASE}/docs/${documentId}/versions/${versionId}/star`, {
          method: 'POST',
        });
        setVersions((prev) =>
          prev.map((v) => (v.id === versionId ? { ...v, starred: true } : v))
        );
      } catch (error) {
        console.error('Failed to star version:', error);
      }
    }
  }, [documentId, sendCustomMessage]);

  const unstarVersion = useCallback(async (versionId: string) => {
    if (!documentId) return;

    if (sendCustomMessage) {
      sendCustomMessage('star', { versionId, starred: false });
    } else {
      try {
        await fetch(`${API_BASE}/docs/${documentId}/versions/${versionId}/star`, {
          method: 'DELETE',
        });
        setVersions((prev) =>
          prev.map((v) => (v.id === versionId ? { ...v, starred: false } : v))
        );
      } catch (error) {
        console.error('Failed to unstar version:', error);
      }
    }
  }, [documentId, sendCustomMessage]);

  const getVersionPreview = useCallback(async (versionId: string): Promise<string | null> => {
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
  }, [documentId]);

  return { versions, loading, fetchVersions, starVersion, unstarVersion, getVersionPreview };
}
