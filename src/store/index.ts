// =============================================================================
// @silas/core/store — Public API
// =============================================================================

export { Store, createStore } from './store.js';
export { Schema, defineSchema } from './schema.js';
export type { ResolvedTable } from './schema.js';
export { Collection } from './collection.js';
export { PaginatedCollection } from './paginated-collection.js';
export { classifyData } from './classify.js';
export { recalculateCursors, cursorFor } from './cursor.js';
export type { CursorBoundaries } from './cursor.js';

export {
  ChangeType,
  type ChangeRecord,
  type ClassifyChangeEntry,
  type ClassifyResult,
  type ClassifySummary,
  type CursorDirection,
  type PaginatedState,
  type TableConfig,
  type SchemaConfig,
  type StoreOptions,
  type CollectionState,
  type QueryCacheEntry,
} from './types.js';
