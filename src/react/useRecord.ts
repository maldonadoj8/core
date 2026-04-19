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
      // Track whether our specific record exists so we only notify React
      // when this record is added or removed — not on unrelated changes.
      let prevRecord = store.get<T>(table, id);

      const collection = store.collection(table);
      const collectionSub = subscribe(collection.proxy, () => {
        const currentRecord = store.get<T>(table, id);
        if (currentRecord !== prevRecord) {
          prevRecord = currentRecord;
          onStoreChange();
        }
        return false;
      });

      // If the record exists now, also subscribe to its property changes.
      let recordSub: { unsubscribe: () => void } | null = null;
      if (prevRecord) {
        recordSub = subscribe(prevRecord, () => {
          onStoreChange();
          return false;
        });
      }

      return () => {
        collectionSub.unsubscribe();
        try {
          recordSub?.unsubscribe();
        } catch {
          // Ensure cleanup never throws.
        }
      };
    },
    () => store.get<T>(table, id),
  );

  return record ?? undefined;
}
