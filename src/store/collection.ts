// =============================================================================
// @silas-core — Observable Collection
//
// A reactive wrapper around the list of records in a table.
// Subscribing to a collection notifies on INSERT / DELETE (structural changes).
// Individual record UPDATEs are handled by the record's own proxy.
// =============================================================================

import type { Proxified } from '../core/types.js';
import type { CollectionState } from './types.js';
import { proxify } from '../core/proxy.js';

/**
 * An observable collection for a single table.
 *
 * The `proxy` property is a proxified `CollectionState` that subscribers can
 * observe. When records are added or removed, the proxy is updated, triggering
 * notifications to all subscribers.
 */
export class Collection<T extends object = Record<string, unknown>> {
  /** The reactive state. Subscribe to this to observe structural changes. */
  readonly proxy: Proxified<CollectionState<T>>;

  constructor() {
    this.proxy = proxify<CollectionState<T>>(
      { items: [] as Proxified<T>[], count: 0 } as CollectionState<T>,
      { batch: 'sync' }, // Collections notify via the store's batch context.
    );
  }

  /**
   * Replace the entire items array. Called by the Store after a batch of
   * upserts that included INSERTs or DELETEs.
   */
  refresh(items: Proxified<T>[]): void {
    (this.proxy as any).__source = {
      items,
      count: items.length,
    };
  }

  /** Current number of items. */
  get count(): number {
    return this.proxy.count;
  }

  /** Current items snapshot. */
  get items(): Proxified<T>[] {
    return this.proxy.items as Proxified<T>[];
  }
}
