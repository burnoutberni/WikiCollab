import { useCallback, useEffect, useReducer, useState } from 'react';
import type { Document, DocumentVisibility, User, Version } from 'shared';

export type { Document, Version };

export const API_BASE = '/api';
const DOCUMENT_POLL_TIMEOUT_MS = 15_000;

interface DocumentListState {
  documents: Document[];
  pendingDocs: Document[];
}

type DocumentListAction =
  | { type: 'replace'; documents: Document[] }
  | { type: 'poll'; documents: Document[] }
  | { type: 'acceptPending' }
  | { type: 'add'; document: Document }
  | { type: 'remove'; id: string }
  | { type: 'update'; document: Document };

async function parseDocumentsResponse(response: Response): Promise<Document[]> {
  if (!response.ok) throw new Error(`Unexpected status ${response.status}`);

  const data: unknown = await response.json();
  if (
    !Array.isArray(data) ||
    !data.every((item) => item !== null && typeof item === 'object' && typeof item.id === 'string')
  ) {
    throw new Error('Unexpected documents response shape');
  }

  return data as Document[];
}

function documentListReducer(
  state: DocumentListState,
  action: DocumentListAction
): DocumentListState {
  switch (action.type) {
    case 'replace': {
      const replacementIds = new Set(action.documents.map((doc) => doc.id));
      return {
        documents: action.documents,
        pendingDocs: state.pendingDocs.filter((doc) => !replacementIds.has(doc.id)),
      };
    }
    case 'poll': {
      const currentIds = new Set(state.documents.map((doc) => doc.id));
      const latestById = new Map(action.documents.map((doc) => [doc.id, doc]));
      const pendingDocs = state.pendingDocs
        .filter((doc) => latestById.has(doc.id))
        .map((doc) => latestById.get(doc.id)!);
      const pendingIds = new Set(pendingDocs.map((doc) => doc.id));
      pendingDocs.push(
        ...action.documents.filter((doc) => !currentIds.has(doc.id) && !pendingIds.has(doc.id))
      );

      return {
        documents: state.documents
          .filter((doc) => latestById.has(doc.id))
          .map((doc) => latestById.get(doc.id)!),
        pendingDocs,
      };
    }
    case 'acceptPending': {
      const documentIds = new Set(state.documents.map((doc) => doc.id));
      return {
        documents: [
          ...state.pendingDocs.filter((doc) => !documentIds.has(doc.id)),
          ...state.documents,
        ],
        pendingDocs: [],
      };
    }
    case 'add':
      return { ...state, documents: [action.document, ...state.documents] };
    case 'remove':
      return {
        documents: state.documents.filter((doc) => doc.id !== action.id),
        pendingDocs: state.pendingDocs.filter((doc) => doc.id !== action.id),
      };
    case 'update':
      return {
        ...state,
        documents: state.documents.map((doc) =>
          doc.id === action.document.id ? action.document : doc
        ),
      };
  }
}

export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetch(input, { ...init, credentials: 'include' });
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/auth/me', { credentials: 'include' });
      const data = (await res.json()) as { user: User | null };
      setUser(data.user);
    } catch (error) {
      console.error('Failed to load auth state:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    const response = await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    if (!response.ok) throw new Error('Logout failed');
    setUser(null);
    window.location.reload();
  }, []);

  return { user, loading, refresh, logout };
}

/**
 * Loads the document list and keeps a separate queue of newly discovered documents until accepted.
 * Polls the API every 5 seconds after the initial load.
 */
export function useDocuments() {
  const [{ documents, pendingDocs }, dispatch] = useReducer(documentListReducer, {
    documents: [],
    pendingDocs: [],
  });
  const [loading, setLoading] = useState(true);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/docs`);
      const data = await parseDocumentsResponse(res);
      dispatch({ type: 'replace', documents: data });
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

    let pollController: AbortController | null = null;
    const poll = async () => {
      if (pollController) return;
      const controller = new AbortController();
      pollController = controller;
      const timeout = window.setTimeout(() => {
        if (pollController === controller) pollController = null;
        controller.abort();
      }, DOCUMENT_POLL_TIMEOUT_MS);
      try {
        const res = await apiFetch(`${API_BASE}/docs`, { signal: controller.signal });
        const latest = await parseDocumentsResponse(res);
        dispatch({ type: 'poll', documents: latest });
      } catch (err) {
        console.error('Failed to poll documents:', err);
      } finally {
        window.clearTimeout(timeout);
        if (pollController === controller) pollController = null;
      }
    };

    const interval = setInterval(poll, 5000);
    return () => {
      clearInterval(interval);
      pollController?.abort();
      pollController = null;
    };
  }, [loading]);

  const loadPending = useCallback(() => dispatch({ type: 'acceptPending' }), []);

  const createDocument = useCallback(
    async (options?: {
      title?: string;
      slug?: string;
      content?: string;
      visibility?: DocumentVisibility;
    }) => {
      const res = await apiFetch(`${API_BASE}/docs`, {
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
        dispatch({ type: 'add', document: doc });
      }
      return doc;
    },
    []
  );

  const deleteDocument = useCallback(async (id: string) => {
    await apiFetch(`${API_BASE}/docs/${id}`, { method: 'DELETE' });
    dispatch({ type: 'remove', id });
  }, []);

  const updateDocument = useCallback(async (id: string, updates: Partial<Document>) => {
    const res = await apiFetch(`${API_BASE}/docs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const doc = await res.json();
    dispatch({ type: 'update', document: doc });
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
        const res = await apiFetch(`${API_BASE}/docs/${id}`);
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
      const res = await apiFetch(`${API_BASE}/docs/${documentId}/versions`);
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
          const res = await apiFetch(`${API_BASE}/docs/${documentId}/versions/${versionId}/star`, {
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
          const res = await apiFetch(`${API_BASE}/docs/${documentId}/versions/${versionId}/star`, {
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
        const res = await apiFetch(`${API_BASE}/docs/${documentId}/versions/${versionId}/preview`);
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
