// =============================================================================
// @silas-core/react — useCollection
//
// Subscribes to a store's observable collection for a table.
// Re-renders when the list's structure changes (insert/delete) or
// when the items array reference changes.
// =============================================================================

import type { Store } from '../store/store.js';
import type { CollectionState } from '../store/types.js';
import type { Proxified } from '../core/types.js';
import { useProxy } from './useProxy.js';

/**
 * Subscribe to all records in a table. Re-renders on structural changes
 * (inserts, deletes) and count updates.
 *
 * ```tsx
 * function UserList({ store }: Props) {
 *   const { items, count } = useCollection<User>(store, 'user');
 *   return (
 *     <ul>
 *       {items.map(u => <li key={u.id}>{u.name}</li>)}
 *       <p>Total: {count}</p>
 *     </ul>
 *   );
 * }
 * ```
 *
 * Individual records in `items` are proxified — you can pass them to
 * `useProxy` in child components for property-level tracking.
 */
export function useCollection<T extends object = Record<string, unknown>>(
  store: Store,
  table: string,
): CollectionState<T> {
  const col = store.collection<T>(table);
  const state = useProxy(col.proxy as unknown as Proxified<CollectionState<T>>);
  return state;
}
