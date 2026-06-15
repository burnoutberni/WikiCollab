import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useEditorLock } from './useEditorLock';

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  sessionStorage.setItem('wikicollab-tab-id', 'tab-0001');
});

describe('useEditorLock', () => {
  it('claims a lock on mount', () => {
    renderHook(() => useEditorLock('doc-1'));

    const stored = JSON.parse(localStorage.getItem('wikicollab-editor-lock-doc-1')!);
    expect(stored.tabId).toBe('tab-0001');
    expect(stored.documentId).toBe('doc-1');
    expect(typeof stored.timestamp).toBe('number');
  });

  it('detects another tab existing lock on mount', () => {
    const otherLock = { tabId: 'other-tab', documentId: 'doc-1', timestamp: Date.now() };
    localStorage.setItem('wikicollab-editor-lock-doc-1', JSON.stringify(otherLock));

    const { result } = renderHook(() => useEditorLock('doc-1'));

    expect(result.current.lockedByOther).toEqual(otherLock);
  });

  it('does not set lockedByOther when lock belongs to current tab', () => {
    const ownLock = { tabId: 'tab-0001', documentId: 'doc-1', timestamp: Date.now() };
    localStorage.setItem('wikicollab-editor-lock-doc-1', JSON.stringify(ownLock));

    const { result } = renderHook(() => useEditorLock('doc-1'));

    expect(result.current.lockedByOther).toBeNull();
  });

  it('takes over a stale lock on mount', () => {
    const staleLock = { tabId: 'old-tab', documentId: 'doc-1', timestamp: Date.now() - 60000 };
    localStorage.setItem('wikicollab-editor-lock-doc-1', JSON.stringify(staleLock));

    const { result } = renderHook(() => useEditorLock('doc-1'));

    const stored = JSON.parse(localStorage.getItem('wikicollab-editor-lock-doc-1')!);
    expect(stored.tabId).toBe('tab-0001');
    expect(result.current.lockedByOther).toBeNull();
  });

  it('takeOver sets current tab as lock owner', () => {
    const otherLock = { tabId: 'other-tab', documentId: 'doc-1', timestamp: Date.now() };
    localStorage.setItem('wikicollab-editor-lock-doc-1', JSON.stringify(otherLock));

    const { result } = renderHook(() => useEditorLock('doc-1'));

    expect(result.current.lockedByOther).toEqual(otherLock);

    act(() => {
      result.current.takeOver();
    });

    const stored = JSON.parse(localStorage.getItem('wikicollab-editor-lock-doc-1')!);
    expect(stored.tabId).toBe('tab-0001');
    expect(result.current.lockedByOther).toBeNull();
  });

  it('releases lock on unmount', () => {
    const { unmount } = renderHook(() => useEditorLock('doc-1'));

    expect(localStorage.getItem('wikicollab-editor-lock-doc-1')).not.toBeNull();

    unmount();

    expect(localStorage.getItem('wikicollab-editor-lock-doc-1')).toBeNull();
  });

  it('does not release another tab lock on unmount', () => {
    const otherLock = { tabId: 'other-tab', documentId: 'doc-1', timestamp: Date.now() };
    localStorage.setItem('wikicollab-editor-lock-doc-1', JSON.stringify(otherLock));

    const { result, unmount } = renderHook(() => useEditorLock('doc-1'));

    expect(result.current.lockedByOther).toEqual(otherLock);

    unmount();

    const stored = localStorage.getItem('wikicollab-editor-lock-doc-1');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.tabId).toBe('other-tab');
  });

  it('detects another tab lock via storage event', () => {
    const { result } = renderHook(() => useEditorLock('doc-1'));

    const otherLock = { tabId: 'other-tab', documentId: 'doc-1', timestamp: Date.now() };
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'wikicollab-editor-lock-doc-1',
          newValue: JSON.stringify(otherLock),
        })
      );
    });

    expect(result.current.lockedByOther).toEqual(otherLock);
  });

  it('clears lock on storage removal event', () => {
    const otherLock = { tabId: 'other-tab', documentId: 'doc-1', timestamp: Date.now() };
    localStorage.setItem('wikicollab-editor-lock-doc-1', JSON.stringify(otherLock));

    const { result } = renderHook(() => useEditorLock('doc-1'));

    expect(result.current.lockedByOther).toEqual(otherLock);

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'wikicollab-editor-lock-doc-1',
          newValue: null,
        })
      );
    });

    expect(result.current.lockedByOther).toBeNull();
  });

  it('ignores storage events for other documents', () => {
    const { result } = renderHook(() => useEditorLock('doc-1'));

    const otherLock = { tabId: 'other-tab', documentId: 'doc-2', timestamp: Date.now() };
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'wikicollab-editor-lock-doc-2',
          newValue: JSON.stringify(otherLock),
        })
      );
    });

    expect(result.current.lockedByOther).toBeNull();
  });

  it('uses correct localStorage key format', () => {
    renderHook(() => useEditorLock('doc-42'));

    const stored = localStorage.getItem('wikicollab-editor-lock-doc-42');
    expect(stored).not.toBeNull();
  });

  it('does nothing when documentId is null', () => {
    const { result } = renderHook(() => useEditorLock(null));

    expect(result.current.lockedByOther).toBeNull();
    expect(localStorage.getItem('wikicollab-editor-lock-doc-1')).toBeNull();
  });
});
