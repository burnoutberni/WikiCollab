import { useEffect } from 'react';

/**
 * Debounced PATCH persistence for a single field, with revert on failure.
 *
 * @param id        Document ID (null to disable).
 * @param loading   True while the document is still loading (skips until ready).
 * @param value     Current local value of the field.
 * @param lastPersistedRef  Ref tracking the last successfully persisted value.
 * @param fieldName JSON body key sent in the PATCH (e.g. "title", "visibility").
 * @param revert    Called with the last-known-good value on failure so the
 *                  caller can roll local state back.
 * @param debounce  Debounce delay in ms (default 300).
 */
export function usePersistField<T>(
  id: string | null,
  loading: boolean,
  value: T,
  lastPersistedRef: React.MutableRefObject<T | null>,
  fieldName: string,
  revert: (rollbackValue: T) => void,
  debounce = 300
) {
  useEffect(() => {
    if (!id || loading || value === lastPersistedRef.current) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void fetch(`/api/docs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [fieldName]: value }),
        signal: controller.signal,
      })
        .then((res) => {
          if (!res.ok) throw new Error(`Failed to update ${fieldName} (${res.status})`);
          lastPersistedRef.current = value;
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          console.error(`Failed to update ${fieldName}:`, error);
          if (lastPersistedRef.current != null) {
            revert(lastPersistedRef.current);
          }
        });
    }, debounce);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [id, value, loading, fieldName, debounce, lastPersistedRef, revert]);
}
