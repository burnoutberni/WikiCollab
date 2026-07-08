import { act, renderHook, waitFor } from '@testing-library/react';
import type { Document, MediaWikiInstance, Version } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDocument, useDocuments, useInstances, useVersions } from './useApi';

function createDoc(overrides: Partial<Document> = {}): Document {
  return {
    id: 'doc-1',
    title: 'Test Doc',
    content: 'Hello',
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    expiry: null,
    mediawiki_instance_id: null,
    restored_version_id: null,
    visibility: 'public',
    ...overrides,
  };
}

function createInstance(overrides: Partial<MediaWikiInstance> = {}): MediaWikiInstance {
  return {
    id: 'inst-1',
    name: 'Test Wiki',
    api_url: 'https://wiki.example/w/api.php',
    token: null,
    configured_at: '2025-01-01T00:00:00.000Z',
    css: null,
    ...overrides,
  };
}

function createVersion(overrides: Partial<Version> = {}): Version {
  return {
    id: 'ver-1',
    document_id: 'doc-1',
    yjs_state: null,
    starred: false,
    created_at: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useDocuments', () => {
  it('fetches documents on mount', async () => {
    const docs = [createDoc({ id: '1' }), createDoc({ id: '2' })];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(docs) })
    );

    const { result } = renderHook(() => useDocuments());

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.documents).toEqual(docs);
  });

  it('handles fetch error gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const { result } = renderHook(() => useDocuments());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.documents).toEqual([]);
    expect(result.current.pendingCount).toBe(0);
  });

  it('createDocument adds new document to list', async () => {
    const existing = [createDoc({ id: '1' })];
    const newDoc = createDoc({ id: '2', title: 'New Doc' });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(existing) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(newDoc) });
    vi.stubGlobal('fetch', fetch);

    const { result } = renderHook(() => useDocuments());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createDocument('New Doc');
    });

    expect(fetch).toHaveBeenCalledWith('/api/docs', expect.objectContaining({ method: 'POST' }));
    expect(result.current.documents).toHaveLength(2);
    expect(result.current.documents[0].id).toBe('2');
  });

  it('createDocument sends visibility when provided', async () => {
    const newDoc = createDoc({ id: '2', visibility: 'unlisted' });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(newDoc) });
    vi.stubGlobal('fetch', fetch);

    const { result } = renderHook(() => useDocuments());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createDocument('Link only', undefined, 'Secret', 'unlisted');
    });

    expect(fetch).toHaveBeenLastCalledWith(
      '/api/docs',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          title: 'Link only',
          slug: undefined,
          content: 'Secret',
          visibility: 'unlisted',
        }),
      })
    );
  });

  it('deleteDocument removes document from list', async () => {
    const docs = [createDoc({ id: '1' }), createDoc({ id: '2' })];
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(docs) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(undefined) });
    vi.stubGlobal('fetch', fetch);

    const { result } = renderHook(() => useDocuments());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteDocument('1');
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/docs/1',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(result.current.documents).toHaveLength(1);
    expect(result.current.documents[0].id).toBe('2');
  });

  it('updateDocument updates document in list', async () => {
    const docs = [createDoc({ id: '1', title: 'Original' })];
    const updated = createDoc({ id: '1', title: 'Updated' });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(docs) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(updated) });
    vi.stubGlobal('fetch', fetch);

    const { result } = renderHook(() => useDocuments());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateDocument('1', { title: 'Updated' });
    });

    expect(fetch).toHaveBeenCalledWith('/api/docs/1', expect.objectContaining({ method: 'PATCH' }));
    expect(result.current.documents[0].title).toBe('Updated');
  });

  it('loadPending merges pending documents into the list', async () => {
    const docs = [createDoc({ id: '1' })];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(docs) })
    );

    const { result } = renderHook(() => useDocuments());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pendingCount).toBe(0);

    act(() => {
      result.current.loadPending();
    });
  });
});

describe('useDocument', () => {
  it('fetches document by ID', async () => {
    const doc = createDoc({ id: 'doc-42' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(doc) })
    );

    const { result } = renderHook(() => useDocument('doc-42'));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.document).toEqual(doc);
  });

  it('does not fetch when ID is null', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    const { result } = renderHook(() => useDocument(null));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.document).toBeNull();
  });

  it('handles fetch error gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const { result } = renderHook(() => useDocument('doc-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.document).toBeNull();
  });
});

describe('useInstances', () => {
  it('loads instances from localStorage on mount', () => {
    const instances = [createInstance(), createInstance({ id: 'inst-2', name: 'Wiki 2' })];
    localStorage.setItem('wikicollab-instances', JSON.stringify(instances));

    const { result } = renderHook(() => useInstances());

    expect(result.current.instances).toEqual(instances);
    expect(result.current.loading).toBe(false);
  });

  it('handles empty localStorage', () => {
    const { result } = renderHook(() => useInstances());

    expect(result.current.instances).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('handles non-array localStorage value', () => {
    localStorage.setItem('wikicollab-instances', JSON.stringify({ id: 'single' }));

    const { result } = renderHook(() => useInstances());

    expect(result.current.instances).toHaveLength(1);
  });

  it('handles invalid JSON in localStorage', () => {
    localStorage.setItem('wikicollab-instances', 'not-json');

    const { result } = renderHook(() => useInstances());

    expect(result.current.instances).toEqual([]);
  });

  it('createInstance adds to instances and persists to localStorage', async () => {
    const { result } = renderHook(() => useInstances());

    await act(async () => {
      await result.current.createInstance('My Wiki', 'https://wiki.example/w/api.php');
    });

    expect(result.current.instances).toHaveLength(1);
    expect(result.current.instances[0].name).toBe('My Wiki');
    expect(result.current.instances[0].api_url).toBe('https://wiki.example/w/api.php');

    const stored = JSON.parse(localStorage.getItem('wikicollab-instances')!);
    expect(stored).toEqual(result.current.instances);
  });

  it('deleteInstance removes instance', async () => {
    localStorage.setItem(
      'wikicollab-instances',
      JSON.stringify([createInstance({ id: '1' }), createInstance({ id: '2' })])
    );

    const { result } = renderHook(() => useInstances());

    await act(async () => {
      await result.current.deleteInstance('1');
    });

    expect(result.current.instances).toHaveLength(1);
    expect(result.current.instances[0].id).toBe('2');
  });

  it('updateInstance updates instance fields', async () => {
    const { result } = renderHook(() => useInstances());

    await act(async () => {
      await result.current.createInstance('Original', 'https://wiki.example/w/api.php');
    });

    const id = result.current.instances[0].id;

    await act(async () => {
      await result.current.updateInstance(id, { name: 'Updated' });
    });

    const stored = JSON.parse(localStorage.getItem('wikicollab-instances')!);
    const updatedInstance = stored.find((i: { id: string }) => i.id === id);
    expect(updatedInstance?.name).toBe('Updated');
  });

  it('updateInstance throws for unknown id', async () => {
    const { result } = renderHook(() => useInstances());

    await expect(
      act(async () => {
        await result.current.updateInstance('nonexistent', { name: 'Nope' });
      })
    ).rejects.toThrow('Instance not found');
  });

  it('handles storage events from other tabs', () => {
    const { result } = renderHook(() => useInstances());

    const newInstances = [createInstance({ id: 'from-other-tab' })];
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'wikicollab-instances',
          newValue: JSON.stringify(newInstances),
        })
      );
    });

    expect(result.current.instances).toEqual(newInstances);
  });

  it('ignores storage events for other keys', () => {
    const { result } = renderHook(() => useInstances());

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'other-key',
          newValue: JSON.stringify([createInstance()]),
        })
      );
    });

    expect(result.current.instances).toEqual([]);
  });
});

describe('useVersions', () => {
  it('fetchVersions fetches versions for document on mount', async () => {
    const versions = [createVersion({ id: 'v1' })];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(versions) })
    );

    const { result } = renderHook(() => useVersions('doc-1'));

    await waitFor(() => expect(result.current.versions).toEqual(versions));
  });

  it('does not fetch when documentId is null', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    const { result } = renderHook(() => useVersions(null));

    expect(result.current.loading).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('starVersion uses REST when no sendCustomMessage provided', async () => {
    const versions = [createVersion({ id: 'v1', starred: false })];
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(versions) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(undefined) })
    );

    const { result } = renderHook(() => useVersions('doc-1'));

    await waitFor(() => expect(result.current.versions).toEqual(versions));

    await act(async () => {
      await result.current.starVersion('v1');
    });

    expect(result.current.versions[0].starred).toBe(true);
  });

  it('starVersion uses WebSocket when sendCustomMessage is provided', async () => {
    const versions = [createVersion({ id: 'v1', starred: false })];
    const sendCustomMessage = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(versions) })
    );

    const { result } = renderHook(() => useVersions('doc-1', sendCustomMessage));

    await waitFor(() => expect(result.current.versions).toEqual(versions));

    await act(async () => {
      await result.current.starVersion('v1');
    });

    expect(sendCustomMessage).toHaveBeenCalledWith('star', { versionId: 'v1', starred: true });
  });

  it('unstarVersion uses REST when no sendCustomMessage', async () => {
    const versions = [createVersion({ id: 'v1', starred: true })];
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(versions) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(undefined) })
    );

    const { result } = renderHook(() => useVersions('doc-1'));

    await waitFor(() => expect(result.current.versions).toEqual(versions));

    await act(async () => {
      await result.current.unstarVersion('v1');
    });

    expect(result.current.versions[0].starred).toBe(false);
  });

  it('unstarVersion uses WebSocket when sendCustomMessage is provided', async () => {
    const versions = [createVersion({ id: 'v1', starred: true })];
    const sendCustomMessage = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(versions) })
    );

    const { result } = renderHook(() => useVersions('doc-1', sendCustomMessage));

    await waitFor(() => expect(result.current.versions).toEqual(versions));

    await act(async () => {
      await result.current.unstarVersion('v1');
    });

    expect(sendCustomMessage).toHaveBeenCalledWith('star', { versionId: 'v1', starred: false });
  });

  it('starVersion does nothing when documentId is null', async () => {
    const { result } = renderHook(() => useVersions(null));

    await act(async () => {
      await result.current.starVersion('v1');
    });

    expect(result.current.versions).toEqual([]);
  });

  it('getVersionPreview returns content', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: 'Preview content' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useVersions('doc-1'));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const preview = await result.current.getVersionPreview('v1');
    expect(preview).toBe('Preview content');
  });

  it('getVersionPreview returns null when documentId is null', async () => {
    const { result } = renderHook(() => useVersions(null));

    const preview = await result.current.getVersionPreview('v1');
    expect(preview).toBeNull();
  });

  it('getVersionPreview returns null on error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useVersions('doc-1'));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const preview = await result.current.getVersionPreview('v1');
    expect(preview).toBeNull();
  });

  it('subscribes to new_version custom message', () => {
    const onCustomMessage = vi.fn().mockReturnValue(vi.fn());
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) })
    );

    renderHook(() => useVersions('doc-1', undefined, onCustomMessage));

    expect(onCustomMessage).toHaveBeenCalledWith('new_version', expect.any(Function));
  });

  it('subscribes to star custom message', () => {
    const onCustomMessage = vi.fn().mockReturnValue(vi.fn());
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) })
    );

    renderHook(() => useVersions('doc-1', undefined, onCustomMessage));

    expect(onCustomMessage).toHaveBeenCalledWith('star', expect.any(Function));
  });

  it('new_version message triggers refetch for matching document', async () => {
    const versions = [createVersion({ id: 'v1' })];
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(versions) });
    vi.stubGlobal('fetch', fetch);

    let newVersionHandler: (payload: { documentId: string }) => void = () => {};
    const onCustomMessage = vi
      .fn()
      .mockImplementation((type: string, handler: (payload: { documentId: string }) => void) => {
        if (type === 'new_version') newVersionHandler = handler;
        return vi.fn();
      });

    renderHook(() => useVersions('doc-1', undefined, onCustomMessage));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    await act(async () => {
      newVersionHandler({ documentId: 'doc-1' });
    });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });

  it('new_version message ignores other document IDs', async () => {
    const versions = [createVersion({ id: 'v1' })];
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(versions) });
    vi.stubGlobal('fetch', fetch);

    let newVersionHandler: (payload: { documentId: string }) => void = () => {};
    const onCustomMessage = vi
      .fn()
      .mockImplementation((type: string, handler: (payload: { documentId: string }) => void) => {
        if (type === 'new_version') newVersionHandler = handler;
        return vi.fn();
      });

    renderHook(() => useVersions('doc-1', undefined, onCustomMessage));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    await act(async () => {
      newVersionHandler({ documentId: 'other-doc' });
    });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });

  it('star custom message updates version starred state', async () => {
    const versions = [createVersion({ id: 'v1', starred: false })];
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(versions) });
    vi.stubGlobal('fetch', fetch);

    let starHandler: (payload: { versionId: string; starred: boolean }) => void = () => {};
    const onCustomMessage = vi
      .fn()
      .mockImplementation(
        (type: string, handler: (payload: { versionId: string; starred: boolean }) => void) => {
          if (type === 'star') starHandler = handler;
          return vi.fn();
        }
      );

    const { result } = renderHook(() => useVersions('doc-1', undefined, onCustomMessage));

    await waitFor(() => expect(result.current.versions).toHaveLength(1));

    act(() => {
      starHandler({ versionId: 'v1', starred: true });
    });

    expect(result.current.versions[0].starred).toBe(true);
  });

  it('unsubscribes custom messages on unmount', () => {
    const unsubscribeNew = vi.fn();
    const unsubscribeStar = vi.fn();
    const onCustomMessage = vi
      .fn()
      .mockReturnValueOnce(unsubscribeNew)
      .mockReturnValueOnce(unsubscribeStar);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) })
    );

    const { unmount } = renderHook(() => useVersions('doc-1', undefined, onCustomMessage));

    unmount();

    expect(unsubscribeNew).toHaveBeenCalled();
    expect(unsubscribeStar).toHaveBeenCalled();
  });
});
