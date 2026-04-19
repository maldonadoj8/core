// =============================================================================
// @silas/core — Reactive Store
//
// In-memory database that holds proxified records grouped by table.
// Each record is individually proxified, so subscribers can observe
// individual records or entire collections.
//
// Mirrors the WeeiiWebSDK BDD pattern but is fully generic.
// =============================================================================

import type { Proxified } from '../core/types.js';
import type { StoreOptions, ChangeRecord, ClassifyResult, MutationEvent, StoreInspection } from './types.js';
import { ChangeType as CT } from './types.js';
import { proxify, isProxy } from '../core/proxy.js';
import { invariant } from '../core/errors.js';
import { Schema } from './schema.js';
import { Collection } from './collection.js';
import { PaginatedCollection } from './paginated-collection.js';
import { classifyData } from './classify.js';

// =============================================================================

export class Store {
  /** The schema governing this store. */
  readonly schema: Schema;

  /**
   * Tables: internalKey → Map<recordId, proxifiedRecord>.
   * Record IDs are coerced to strings for consistent Map keys.
   */
  private _tables = new Map<string, Map<string, Proxified<any>>>();

  /** Lazy-created observable collections per table. */
  private _collections = new Map<string, Collection<any>>();

  /** Registered paginated views per table (multiple allowed). */
  private _paginatedCollections = new Map<string, Set<PaginatedCollection<any>>>();

  /** Optional mutation observer callback. */
  private _onMutation: ((event: MutationEvent) => void) | null;

  constructor(options: StoreOptions) {
    this.schema = options.schema instanceof Schema
      ? options.schema
      : new Schema(options.schema);
    this._onMutation = options.onMutation ?? null;
  }

  // ===========================================================================
  // READ API
  // ===========================================================================

  /**
   * Get a single record by table and primary key.
   *
   * ```ts
   * const user = store.get('user', 42);
   * if (user) console.log(user.name);
   * ```
   */
  get<T extends object = Record<string, unknown>>(
    table: string,
    id: string | number,
  ): Proxified<T> | undefined {
    return this._getTable(table).get(String(id)) as Proxified<T> | undefined;
  }

  /**
   * Get all records in a table as an array.
   */
  all<T extends object = Record<string, unknown>>(
    table: string,
  ): Proxified<T>[] {
    return [...this._getTable(table).values()] as Proxified<T>[];
  }

  /**
   * Filter records in a table by predicate.
   */
  filter<T extends object = Record<string, unknown>>(
    table: string,
    predicate: (record: Proxified<T>) => boolean,
  ): Proxified<T>[] {
    return this.all<T>(table).filter(predicate);
  }

  /**
   * Find the first record matching a predicate.
   */
  find<T extends object = Record<string, unknown>>(
    table: string,
    predicate: (record: Proxified<T>) => boolean,
  ): Proxified<T> | undefined {
    return this.all<T>(table).find(predicate);
  }

  /**
   * Count records in a table.
   */
  count(table: string): number {
    return this._getTable(table).size;
  }

  /**
   * Get the observable collection for a table.
   * Lazy-created on first access.
   */
  collection<T extends object = Record<string, unknown>>(
    table: string,
  ): Collection<T> {
    const key = this._resolveTableKey(table);
    let col = this._collections.get(key);
    if (!col) {
      col = new Collection<T>();
      this._collections.set(key, col);
      // Initialise with current records.
      col.refresh(this.all(key));
    }
    return col as Collection<T>;
  }

  /**
   * Create a new paginated view over a table.
   *
   * Unlike regular collections (one per table, auto-created), paginated
   * views are explicitly created and can have multiple instances per table
   * (e.g. two independent scroll panels).
   *
   * Call `disposePaginated()` when the view is no longer needed.
   *
   * ```ts
   * const page = store.paginated<Entrega>('entrega');
   * page.addPage(records, 'descending');
   * ```
   */
  paginated<T extends object = Record<string, unknown>>(
    table: string,
  ): PaginatedCollection<T> {
    const resolved = this.schema.resolveByName(table);
    const key = resolved?.key ?? table;

    const pc = new PaginatedCollection<T>(this, key);

    let set = this._paginatedCollections.get(key);
    if (!set) {
      set = new Set();
      this._paginatedCollections.set(key, set);
    }
    set.add(pc);

    return pc;
  }

  /**
   * Dispose a paginated view, removing it from the registry and cleaning
   * up its store subscription.
   */
  disposePaginated(pc: PaginatedCollection<any>): void {
    for (const [, set] of this._paginatedCollections) {
      if (set.has(pc)) {
        set.delete(pc);
        pc.dispose();
        return;
      }
    }
  }

  // ===========================================================================
  // WRITE API
  // ===========================================================================

  /**
   * Insert or update a record. The record is proxified if not already.
   *
   * - If the record doesn't exist → INSERT.
   * - If the record exists and version is newer (or no version field) → UPDATE.
   * - If the record is soft-deleted → DELETE.
   * - If the version is older or identical → NONE (no-op).
   *
   * Returns a `ChangeRecord` describing what happened.
   */
  upsert<T extends object = Record<string, unknown>>(
    table: string,
    rawRecord: T,
  ): ChangeRecord<T> {
    invariant(
      rawRecord !== null && rawRecord !== undefined && typeof rawRecord === 'object' && !Array.isArray(rawRecord),
      `store.upsert("${table}"): record must be a non-null, non-array object.`,
    );

    const tableMap = this._getTable(table);
    const internalTable = this._resolveTableKey(table);
    const keyField = this.schema.getKeyField(internalTable);
    const rawKey   = (rawRecord as any)[keyField];

    invariant(
      rawKey !== undefined && rawKey !== null,
      `store.upsert("${table}"): record is missing required primary key field "${keyField}".`,
    );

    const id = String(rawKey);

    // Soft-delete check.
    if (this.schema.isSoftDeleted(internalTable, rawRecord as Record<string, unknown>)) {
      const existing = tableMap.get(id) as Proxified<T> | undefined;
      if (existing) {
        const previous = { ...(existing as any).__source } as T;
        // Update the proxy one last time so subscribers see the deleted state.
        (existing as any).__source = rawRecord;
        tableMap.delete(id);
        this._refreshCollection(internalTable);
        const change: ChangeRecord<T> = { type: CT.DELETE, record: null, previous };
        this._emitMutation({ type: 'upsert', table: internalTable, change: CT.DELETE, record: null, previous: previous as Record<string, unknown> });
        return change;
      }
      // Didn't exist locally — nothing to do.
      return { type: CT.NONE, record: null };
    }

    const existing = tableMap.get(id) as Proxified<T> | undefined;

    // INSERT — record doesn't exist locally.
    if (!existing) {
      const proxy = isProxy(rawRecord)
        ? rawRecord as Proxified<T>
        : proxify(rawRecord);
      tableMap.set(id, proxy);
      this._refreshCollection(internalTable);
      const change: ChangeRecord<T> = { type: CT.INSERT, record: proxy };
      this._emitMutation({ type: 'upsert', table: internalTable, change: CT.INSERT, record: proxy as Proxified<Record<string, unknown>> });
      return change;
    }

    // Version check (if schema defines a version field).
    const versionField = this.schema.getVersionField(internalTable);
    if (versionField) {
      const existingVer = (existing as any)[versionField];
      const newVer      = (rawRecord as any)[versionField];
      if (existingVer !== undefined && newVer !== undefined && newVer < existingVer) {
        // Older version — ignore.
        return { type: CT.NONE, record: existing };
      }
    }

    // UPDATE — replace the proxy's internal data.
    const previous = { ...(existing as any).__source } as T;
    (existing as any).__source = rawRecord;
    // No collection refresh needed — structure didn't change.
    const change: ChangeRecord<T> = { type: CT.UPDATE, record: existing, previous };
    this._emitMutation({ type: 'upsert', table: internalTable, change: CT.UPDATE, record: existing as Proxified<Record<string, unknown>>, previous: previous as Record<string, unknown> });
    return change;
  }

  /**
   * Explicitly remove a record from the store.
   */
  remove<T extends object = Record<string, unknown>>(
    table: string,
    id: string | number,
  ): ChangeRecord<T> | null {
    const tableMap = this._getTable(table);
    const internalTable = this._resolveTableKey(table);
    const strId    = String(id);
    const existing = tableMap.get(strId) as Proxified<T> | undefined;
    if (!existing) return null;

    const previous = { ...(existing as any).__source } as T;
    tableMap.delete(strId);
    this._refreshCollection(internalTable);
    const change: ChangeRecord<T> = { type: CT.DELETE, record: null, previous };
    this._emitMutation({ type: 'remove', table: internalTable, change: CT.DELETE, record: null, previous: previous as Record<string, unknown> });
    return change;
  }

  /**
   * Classify a server data payload and upsert all records.
   *
   * This is the primary integration point: pass the unwrapped `datos`
   * object from a server response and the store handles everything.
   *
   * The payload must be a flat `Record<string, unknown>` where each key
   * maps to an array of records (or a single record object). Records are
   * routed to tables using prop-based resolution first (if configured),
   * then name-based resolution, then an alphanumeric key fallback.
   *
   * All upserts are wrapped in a batch for a single notification round.
   *
   * ```ts
   * // Name-based: key "user" → table "user"
   * store.classify({ user: [{ id: 1, name: 'Alice' }] });
   *
   * // Prop-based: record.id_entidad determines the target table
   * store.classify({
   *   registro: [
   *     { id: 1, id_entidad: 31, titulo: 'A' },
   *     { id: 2, id_entidad: 50, peso: 1.2 },
   *   ],
   * });
   * ```
   */
  classify(data: Record<string, unknown>): ClassifyResult {
    invariant(
      data !== null && data !== undefined && typeof data === 'object' && !Array.isArray(data),
      'store.classify() expects a non-null, non-array object.',
    );
    return classifyData(this, data);
  }

  /**
   * Clear all records from a table, or all tables if no argument given.
   */
  clear(table?: string): void {
    if (table) {
      const internalTable = this._resolveTableKey(table);
      this._getTable(internalTable).clear();
      this._refreshCollection(internalTable);
      this._clearPaginatedCollections(internalTable);
      this._emitMutation({ type: 'clear', table: internalTable, record: null });
    } else {
      for (const [key, map] of this._tables) {
        map.clear();
        this._refreshCollection(key);
        this._clearPaginatedCollections(key);
        this._emitMutation({ type: 'clear', table: key, record: null });
      }
    }
  }

  // ===========================================================================
  // INTERNAL
  // ===========================================================================

  /** Resolve an external or internal table name to the canonical internal key. */
  private _resolveTableKey(table: string): string {
    const resolved = this.schema.resolveByName(table);
    return resolved?.key ?? table;
  }

  /** Get or create the Map for a table. */
  private _getTable(table: string): Map<string, Proxified<any>> {
    const key = this._resolveTableKey(table);

    let map = this._tables.get(key);
    if (!map) {
      map = new Map();
      this._tables.set(key, map);
    }
    return map;
  }

  /** Refresh the observable collection for a table (if it exists). */
  private _refreshCollection(table: string): void {
    const key = this._resolveTableKey(table);

    const col = this._collections.get(key);
    if (col) {
      col.refresh(this.all(key));
    }
  }

  /** Clear all paginated views for a table. */
  private _clearPaginatedCollections(table: string): void {
    const key = this._resolveTableKey(table);
    const set = this._paginatedCollections.get(key);
    if (set) {
      for (const pc of set) {
        pc.clear();
      }
    }
  }

  /** Emit a mutation event (if an onMutation callback is registered). */
  private _emitMutation(event: MutationEvent): void {
    if (this._onMutation) {
      try {
        this._onMutation(event);
      } catch {
        // Never let observer errors break store operations.
      }
    }
  }

  // ===========================================================================
  // INSPECTION API
  // ===========================================================================

  /**
   * List all table keys that have been initialised in this store.
   */
  tables(): string[] {
    return [...this._tables.keys()];
  }

  /**
   * Inspect a single table's state for debugging.
   * If no table is given, returns an array of inspections for all initialised tables
   * (tables that have had at least one record inserted).
   */
  inspect(table: string): StoreInspection;
  inspect(): StoreInspection[];
  inspect(table?: string): StoreInspection | StoreInspection[] {
    if (table) {
      const key = this._resolveTableKey(table);
      const map = this._tables.get(key);
      return {
        table: key,
        recordCount: map?.size ?? 0,
        recordIds: map ? [...map.keys()] : [],
        hasCollection: this._collections.has(key),
        paginatedViewCount: this._paginatedCollections.get(key)?.size ?? 0,
      };
    }
    return [...this._tables.keys()].map(k => this.inspect(k));
  }
}

// ======================== FACTORY ===========================================

/**
 * Create a new Store instance.
 *
 * ```ts
 * import { createStore, defineSchema } from '@silas/core/store';
 *
 * const store = createStore({
 *   schema: defineSchema({
 *     tables: {
 *       user: { key: 'id' },
 *       post: { key: 'id', version: 'updated_at' },
 *     }
 *   })
 * });
 * ```
 */
export function createStore(options: StoreOptions): Store {
  return new Store(options);
}
