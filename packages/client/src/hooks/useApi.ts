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
}

export interface MediaWikiInstance {
  id: string;
  name: string;
  api_url: string;
  token: string | null;
  configured_at: string;
}

export interface Template {
  id: string;
  instance_id: string;
  template_name: string;
  template_data: string;
  fetched_at: string;
}

export interface Version {
  id: string;
  document_id: string;
  yjs_state: string | null;
  created_at: string;
}

export function useDocuments() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

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

  const createDocument = useCallback(async (title?: string) => {
    const res = await fetch(`${API_BASE}/docs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const doc = await res.json();
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

  return { documents, loading, createDocument, deleteDocument, updateDocument, refetch: fetchDocuments };
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

  const fetchInstances = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/instances`);
      const data = await res.json();
      setInstances(data);
    } catch (error) {
      console.error('Failed to fetch instances:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  const createInstance = useCallback(async (name: string, apiUrl: string, token?: string) => {
    const res = await fetch(`${API_BASE}/instances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, api_url: apiUrl, token }),
    });
    const instance = await res.json();
    setInstances((prev) => [...prev, instance]);
    return instance;
  }, []);

  const deleteInstance = useCallback(async (id: string) => {
    await fetch(`${API_BASE}/instances/${id}`, { method: 'DELETE' });
    setInstances((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const refreshTemplates = useCallback(async (id: string) => {
    const res = await fetch(`${API_BASE}/instances/${id}/templates/refresh`, {
      method: 'POST',
    });
    return res.json();
  }, []);

  return { instances, loading, createInstance, deleteInstance, refreshTemplates, refetch: fetchInstances };
}

export function useTemplates(documentId: string | null) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!documentId) return;

    const fetchTemplates = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/docs/${documentId}/templates`);
        const data = await res.json();
        setTemplates(data);
      } catch (error) {
        console.error('Failed to fetch templates:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTemplates();
  }, [documentId]);

  return { templates, loading };
}

export function useVersions(documentId: string | null) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!documentId) return;

    const fetchVersions = async () => {
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
    };

    fetchVersions();
  }, [documentId]);

  return { versions, loading };
}
