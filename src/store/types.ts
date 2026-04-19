// =============================================================================
// @silas/core — Store Types
// =============================================================================

import type { Proxified } from '../core/types.js';

// ======================== CHANGE TRACKING ====================================

/** How a record changed relative to the local store. */
export enum ChangeType {
  /** No change — record already existed with same version/data. */
  NONE   = 0,
  /** New record that didn't exist in the local store. */
  INSERT = 1,
  /** Existing record updated with a newer version. */
  UPDATE = 2,
  /** Record was soft-deleted or explicitly removed. */
  DELETE = 3,
}

/** Describes a single record change after classification. */
export interface ChangeRecord<T extends object = Record<string, unknown>> {
  /** What happened. */
  type: ChangeType;
  /** The proxified record (after the change). Null if DELETE. */
  record: Proxified<T> | null;
  /** The previous raw data (before the change). Undefined if INSERT. */
  previous?: T;
}

/** A single entry in the classify result's changes array. */
export interface ClassifyChangeEntry<T extends object = Record<string, unknown>> extends ChangeRecord<T> {
  /** Which table this change belongs to. */
  table: string;
}

/** Result of classifying a server response. */
export interface ClassifyResult {
  /** Flat list of all changes (with table info). */
  changes: ClassifyChangeEntry[];
  /** Quick numeric summary. */
  summary: ClassifySummary;
  /** List of tables that were affected. */
  tables: string[];
}

/** Quick numeric summary of changes from a classify operation. */
export interface ClassifySummary {
  /** Number of inserts. */
  inserts: number;
  /** Number of updates. */
  updates: number;
  /** Number of deletes. */
  deletes: number;
  /** Number of skipped (no-op) records. */
  skipped: number;
}

// ======================== SCHEMA ============================================

/** Configuration for a single table in the schema. */
export interface TableConfig {
  /** Primary key field. Default: 'id'. */
  key?: string;
  /** Version field for optimistic concurrency. Default: undefined (no version check). */
  version?: string;
  /**
   * Soft-delete field.
   * - `string`: field name to check (falsy = deleted).
   * - `false`: no soft-delete.
   * Default: false.
   */
  softDelete?: string | false;
  /**
   * The record property to inspect for routing during classification.
   * When set, each incoming record's `record[resolverProp]` is compared
   * against `resolverValue` to determine if it belongs to this table.
   *
   * When not set, the table is resolved by response key name (default).
   *
   * Requires `resolverValue` to be set.
   */
  resolverProp?: string;
  /**
   * The value that `record[resolverProp]` must match for the record
   * to be routed to this table during classification.
   *
   * Requires `resolverProp` to be set.
   */
  resolverValue?: string | number | boolean;
  /**
   * External name of the table (as it appears in server responses).
   * If different from the internal key. Default: same as the key.
   */
  name?: string;
}

/** Full schema configuration. */
export interface SchemaConfig {
  /** Table definitions, keyed by internal table name. */
  tables: Record<string, TableConfig>;
}

/** Options for creating a Store. */
export interface StoreOptions {
  /** Schema defining tables and their configuration. Pass a SchemaConfig or a Schema instance. */
  schema: SchemaConfig | import('./schema.js').Schema;
  /** Optional callback invoked on every mutation (upsert, remove, clear). */
  onMutation?: (event: MutationEvent) => void;
}

/** Describes a store mutation event for observability. */
export interface MutationEvent {
  /** The type of mutation. */
  type: 'upsert' | 'remove' | 'clear';
  /** The resolved internal table key (canonical name, not the caller-provided alias). */
  table: string;
  /** The change type result (for upsert/remove). Undefined for clear. */
  change?: ChangeType;
  /** The record after mutation (proxified). Null for DELETE, remove, and clear. */
  record: Proxified<Record<string, unknown>> | null;
  /** The previous raw data (before the change, non-proxified snapshot). */
  previous?: Record<string, unknown>;
}

/** Result of `store.inspect()`. */
export interface StoreInspection {
  /** The internal table name. */
  table: string;
  /** Number of records in the table. */
  recordCount: number;
  /** All record IDs in the table. */
  recordIds: string[];
  /** Whether an observable collection exists for this table. */
  hasCollection: boolean;
  /** Number of paginated views registered for this table. */
  paginatedViewCount: number;
}

// ======================== COLLECTION ========================================

/** Observable collection state for a table. */
export interface CollectionState<T extends object = Record<string, unknown>> {
  /** The current array of proxified records. */
  items: Proxified<T>[];
  /** Number of records. */
  count: number;
}

// ======================== PAGINATION ========================================

/** Scroll / fetch direction for paginated collections. */
export type CursorDirection = 'ascending' | 'descending';

/**
 * Observable state for a paginated view over a store table.
 * All properties are reactive via the proxy system.
 */
export interface PaginatedState<T extends object = Record<string, unknown>> {
  /** Ordered records currently in the paginated window. */
  items: Proxified<T>[];
  /** Number of records in the window. */
  count: number;
  /** Primary key of the first record (used as cursor for ascending fetches). */
  cursorStart: string | undefined;
  /** Primary key of the last record (used as cursor for descending fetches). */
  cursorEnd: string | undefined;
  /** Whether more records are expected to exist beyond the current window. */
  hasMore: boolean;
}

// ======================== QUERY CACHE =======================================

/** Internal state for a cached query. */
export interface QueryCacheEntry {
  /** The raw data from the last successful fetch. */
  data: Record<string, unknown[]> | null;
  /** Timestamp of last successful fetch. */
  timestamp: number;
  /** Tables involved in this query. */
  tables: string[];
  /** Whether this entry has been invalidated. */
  stale: boolean;
}
