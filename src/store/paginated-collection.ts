// =============================================================================
// @silas/core — Paginated Collection
//
// A reactive, store-aware windowed view over a table.
// Records live in the Store (single source of truth). This class tracks
// which record IDs are in the current scroll window, in what order, and
// exposes a Proxified state with cursor boundaries.
//
// Multiple PaginatedCollection instances can exist per table (e.g. two
// independent infinite-scroll panels showing different subsets).
// =============================================================================

import type { Proxified } from '../core/types.js';
import type { CursorDirection, PaginatedState } from './types.js';
import type { Store } from './store.js';
import { proxify } from '../core/proxy.js';
import { subscribe } from '../core/subscription.js';
import { invariant } from '../core/errors.js';
import { recalculateCursors } from './cursor.js';

// =============================================================================
// CLASS
// =============================================================================

/**
 * A paginated, reactive view over a store table.
 *
 * The `proxy` property is a `Proxified<PaginatedState>` — subscribers
 * get property-level tracking on `items`, `count`, `cursorStart`,
 * `cursorEnd`, and `hasMore`.
 *
 * Records added through this collection are upserted into the Store,
 * ensuring a single canonical copy. The paginated view only tracks
 * ordering and window boundaries.
 */
export class PaginatedCollection<T extends object = Record<string, unknown>> {
  /** The reactive paginated state. Subscribe for property-level tracking. */
  readonly proxy: Proxified<PaginatedState<T>>;

  /** Reference to the parent store. */
  private _store: Store;

  /** Internal table key (resolved through schema). */
  private _table: string;

  /** Primary key field for this table. */
  private _keyField: string;

  /** Ordered list of record IDs in the current window. */
  private _orderedIds: string[] = [];

  /** O(1) dedup lookup. */
  private _idSet = new Set<string>();

  /** Subscription to the store's collection for this table. */
  private _collectionSub: { unsubscribe: () => void } | null = null;

  constructor(store: Store, table: string) {
    this._store    = store;
    this._table    = table;
    this._keyField = store.schema.getKeyField(table);

    this.proxy = proxify<PaginatedState<T>>(
      {
        items:       [] as any,
        count:       0,
        cursorStart: undefined,
        cursorEnd:   undefined,
        hasMore:     true,
      } as any,
      { batch: 'sync' },
    );

    // Subscribe to the store's collection so we can detect external removals
    // (e.g. a record soft-deleted by another classify() call).
    const col = store.collection(table);
    this._collectionSub = subscribe(col.proxy, () => {
      this._syncWithStore();
      return false; // Keep subscription alive.
    });
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Add a page of records from a fetch. Records are upserted into the Store
   * and appended or prepended to the window based on direction.
   *
   * @param records   Raw records from the server response.
   * @param direction `'ascending'` prepends, `'descending'` appends.
   * @returns The updated items array.
   */
  addPage(records: T[], direction: CursorDirection): Proxified<T>[] {
    invariant(Array.isArray(records), 'addPage() expects an array of records.');
    invariant(
      direction === 'ascending' || direction === 'descending',
      `addPage() expects direction to be 'ascending' or 'descending', got "${String(direction)}".`,
    );

    const unique = this._deduplicate(records);
    if (!unique.length) {
      return this.proxy.items as Proxified<T>[];
    }

    // Upsert into the store and collect resolved IDs.
    const newIds = this._upsertAndCollectIds(unique);

    // Merge into the ordered list.
    if (direction === 'ascending') {
      this._orderedIds = [...newIds, ...this._orderedIds];
    } else {
      this._orderedIds = [...this._orderedIds, ...newIds];
    }

    this._refresh();
    return this.proxy.items as Proxified<T>[];
  }

  /**
   * Add a single record to the window.
   *
   * @param record  The raw record.
   * @param prepend If `true` (default), add to the start; otherwise to the end.
   */
  addRecord(record: T, prepend: boolean = true): void {
    const key = String((record as Record<string, unknown>)[this._keyField]);
    if (this._idSet.has(key)) return;

    this._store.upsert(this._table, record);
    this._idSet.add(key);

    if (prepend) {
      this._orderedIds.unshift(key);
    } else {
      this._orderedIds.push(key);
    }

    this._refresh();
  }

  /**
   * Remove a record from both the paginated window and the store.
   */
  removeRecord(id: string | number): void {
    const strId = String(id);
    if (!this._idSet.has(strId)) return;

    this._idSet.delete(strId);
    this._orderedIds = this._orderedIds.filter(k => k !== strId);
    this._store.remove(this._table, id);
    this._refresh();
  }

  /**
   * Clear the paginated window. Records remain in the store but are no
   * longer tracked by this view.
   */
  clear(): void {
    this._orderedIds = [];
    this._idSet.clear();
    this._refresh();
  }

  /**
   * Update the `hasMore` flag (e.g. when the server returns fewer records
   * than the requested page size).
   */
  setHasMore(value: boolean): void {
    (this.proxy as any).__source = {
      ...this._buildState(),
      hasMore: value,
    };
  }

  /**
   * Unsubscribe from the store's collection. Call this when the paginated
   * view is no longer needed (e.g. component unmount).
   */
  dispose(): void {
    this._collectionSub?.unsubscribe();
    this._collectionSub = null;
  }

  // ===========================================================================
  // INTERNAL
  // ===========================================================================

  /**
   * Filter out records whose primary key is already in the window.
   */
  private _deduplicate(records: T[]): T[] {
    return records.filter(record => {
      const key = String((record as Record<string, unknown>)[this._keyField]);
      return !this._idSet.has(key);
    });
  }

  /**
   * Upsert records into the store and return their string IDs.
   * Also adds each ID to the dedup set.
   */
  private _upsertAndCollectIds(records: T[]): string[] {
    const ids: string[] = [];
    for (const record of records) {
      const key = String((record as Record<string, unknown>)[this._keyField]);
      this._store.upsert(this._table, record);
      this._idSet.add(key);
      ids.push(key);
    }
    return ids;
  }

  /**
   * Resolve ordered IDs to proxified records from the store and update
   * the reactive proxy state.
   */
  private _refresh(): void {
    const state = this._buildState();
    (this.proxy as any).__source = state;
  }

  /**
   * Build the current `PaginatedState` from internal tracking data.
   */
  private _buildState(): PaginatedState<T> {
    // Resolve records from the store, filtering out any that no longer exist.
    const items: Proxified<T>[] = [];
    for (const id of this._orderedIds) {
      const record = this._store.get<T>(this._table, id);
      if (record) {
        items.push(record);
      }
    }

    const cursors = recalculateCursors(
      items as unknown as Record<string, unknown>[],
      this._keyField,
    );

    return {
      items,
      count:       items.length,
      cursorStart: cursors.start,
      cursorEnd:   cursors.end,
      hasMore:     this.proxy.hasMore,
    };
  }

  /**
   * Called when the store's collection changes (INSERT/DELETE).
   * Removes IDs from the window that no longer exist in the store.
   */
  private _syncWithStore(): void {
    // Collect all IDs to remove, then filter once (O(n) instead of O(n²)).
    const toRemove = new Set<string>();

    for (const id of this._orderedIds) {
      const exists = this._store.get(this._table, id);
      if (!exists) {
        toRemove.add(id);
      }
    }

    if (toRemove.size > 0) {
      for (const id of toRemove) {
        this._idSet.delete(id);
      }
      this._orderedIds = this._orderedIds.filter(k => !toRemove.has(k));
      this._refresh();
    }
  }
}
