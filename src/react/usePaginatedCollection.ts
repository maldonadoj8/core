// =============================================================================
// @silasdevs/core/react — usePaginatedCollection
//
// React hook for paginated, bidirectional data fetching over a store table.
// Returns reactive state (items, count, cursors, hasMore) with property-level
// tracking, plus stable action functions for managing the window.
// =============================================================================

import { useRef, useCallback, useEffect, useMemo } from 'react';
import type { Store } from '../store/store.js';
import type { CursorDirection, PaginatedState } from '../store/types.js';
import type { Proxified } from '../core/types.js';
import { PaginatedCollection } from '../store/paginated-collection.js';
import { cursorFor as _cursorFor } from '../store/cursor.js';
import { useProxy } from './useProxy.js';

// =============================================================================
// TYPES
// =============================================================================

/** Return value of `usePaginatedCollection`. */
export interface UsePaginatedCollectionResult<T extends object> {
  /** Ordered records in the current paginated window. */
  items: Proxified<T>[];
  /** Number of records in the window. */
  count: number;
  /** Primary key of the first record (ascending cursor). */
  cursorStart: string | undefined;
  /** Primary key of the last record (descending cursor). */
  cursorEnd: string | undefined;
  /** Whether more records may exist beyond the current window. */
  hasMore: boolean;
  /** Get the cursor value for a given fetch direction. */
  cursorFor: (direction: CursorDirection) => string | undefined;
  /** Add a page of records from a given direction. */
  addPage: (records: T[], direction: CursorDirection) => void;
  /** Add a single record (prepend by default). */
  addRecord: (record: T, prepend?: boolean) => void;
  /** Remove a record by primary key. */
  removeRecord: (id: string | number) => void;
  /** Clear the paginated window. Optionally run a callback after clearing. */
  clear: (then?: (...args: unknown[]) => void, ...args: unknown[]) => void;
  /** Update the `hasMore` flag. */
  setHasMore: (value: boolean) => void;
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Subscribe to a paginated view over a store table.
 *
 * Creates a `PaginatedCollection` on mount and disposes it on unmount.
 * The returned state is reactive with property-level tracking — a component
 * that only reads `count` will not re-render when `items` changes.
 *
 * ```tsx
 * function EntregaList({ store }: Props) {
 *   const {
 *     items, count, cursorFor, hasMore,
 *     addPage, clear,
 *   } = usePaginatedCollection<Entrega>(store, 'entrega');
 *
 *   const fetchMore = (dir: CursorDirection) =>
 *     api.listar({ id_ultimo: cursorFor(dir), filas: 20 })
 *       .then(res => addPage(res.datos.entrega, dir));
 *
 *   return <InfiniteTable items={items} onScroll={fetchMore} />;
 * }
 * ```
 *
 * @param store The store instance.
 * @param table The table name (resolved through schema).
 */
export function usePaginatedCollection<T extends object = Record<string, unknown>>(
  store: Store,
  table: string,
): UsePaginatedCollectionResult<T> {

  // Create / recreate the PaginatedCollection when store or table changes.
  const pcRef = useRef<PaginatedCollection<T> | null>(null);

  const pc = useMemo(() => {
    // Dispose the previous instance if store/table changed.
    if (pcRef.current) {
      store.disposePaginated(pcRef.current);
    }
    const instance = store.paginated<T>(table);
    pcRef.current = instance;
    return instance;
  }, [store, table]);

  // Dispose on true unmount.
  // NOTE: We intentionally do NOT null pcRef here. In StrictMode, React
  // unmounts/remounts effects — nulling the ref would cause in-flight
  // async operations to silently fail. The useMemo above handles disposal
  // when deps change, and this cleanup handles the final unmount.
  useEffect(() => {
    return () => {
      if (pcRef.current) {
        store.disposePaginated(pcRef.current);
      }
    };
  }, [store]);

  // Subscribe to the paginated state via useProxy (property-level tracking).
  const state = useProxy(pc.proxy as unknown as Proxified<PaginatedState<T>>);

  // ===================== Stable action callbacks =============================

  const addPage = useCallback((records: T[], direction: CursorDirection) => {
    pcRef.current?.addPage(records, direction);
  }, []);

  const addRecord = useCallback((record: T, prepend?: boolean) => {
    pcRef.current?.addRecord(record, prepend);
  }, []);

  const removeRecord = useCallback((id: string | number) => {
    pcRef.current?.removeRecord(id);
  }, []);

  const clear = useCallback((then?: (...args: unknown[]) => void, ...args: unknown[]) => {
    pcRef.current?.clear();
    if (then) {
      then(...args);
    }
  }, []);

  const setHasMore = useCallback((value: boolean) => {
    pcRef.current?.setHasMore(value);
  }, []);

  const cursorFor = useCallback((direction: CursorDirection) => {
    return _cursorFor(
      { start: state.cursorStart, end: state.cursorEnd },
      direction,
    );
  }, [state.cursorStart, state.cursorEnd]);

  return {
    items:       state.items as Proxified<T>[],
    count:       state.count,
    cursorStart: state.cursorStart,
    cursorEnd:   state.cursorEnd,
    hasMore:     state.hasMore,
    cursorFor,
    addPage,
    addRecord,
    removeRecord,
    clear,
    setHasMore,
  };
}
