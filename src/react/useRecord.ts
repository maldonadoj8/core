// =============================================================================
// @silas/core/react — useRecord
//
// Reads a single record from a Store by table + id and re-renders when
// that record's tracked properties change.
// =============================================================================

import { useSyncExternalStore } from 'react';
import type { Store } from '../store/store.js';
import { subscribe } from '../core/subscription.js';

/**
 * Get a single record from a store and track its changes.
 *
 * ```tsx
 * function UserProfile({ store, userId }: Props) {
 *   const user = useRecord<User>(store, 'user', userId);
 *   if (!user) return <div>Not found</div>;
 *   return <div>{user.name}</div>;
 * }
 * ```
 *
 * Returns `undefined` if the record doesn't exist. The component will
 * NOT automatically re-render when a new record is inserted — use
 * `useCollection` for that. However, once the record is found it will
 * re-render on property changes.
 */
export function useRecord<T extends object = Record<string, unknown>>(
  store: Store,
  table: string,
  id: string | number,
): T | undefined {
  const record = useSyncExternalStore(
    (onStoreChange) => {
      // Always subscribe to the collection so inserts/removals trigger updates.
      const collection = store.collection(table);
      const collectionSub = subscribe(collection.proxy, () => {
        onStoreChange();
        return false;
      });

      // If the record exists now, also subscribe to its property changes.
      const existing = store.get<T>(table, id);
      let recordSub: { unsubscribe: () => void } | null = null;
      if (existing) {
        recordSub = subscribe(existing, () => {
          onStoreChange();
          return false;
        });
      }

      return () => {
        collectionSub.unsubscribe();
        recordSub?.unsubscribe();
      };
    },
    () => store.get<T>(table, id),
  );

  return record ?? undefined;
}
