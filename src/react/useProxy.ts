// =============================================================================
// @silasdevs/core/react — useProxy
//
// The foundational React hook. Subscribes to a proxified object and triggers
// re-renders only when properties **actually read during render** change.
//
// Uses `useSyncExternalStore` for tear-free reads compatible with React 18
// concurrent features. Property-level granularity is achieved via a tracking
// proxy: the hook returns a lightweight proxy wrapper that records which
// properties the component reads during render; on the next mutation, only
// changes to those properties trigger a re-render.
//
// Architecture:
//   1. A shallow snapshot is cached in `snapRef` (plain object).
//   2. `getSnapshot` returns the cached snapshot (stable reference).
//   3. The subscription callback builds a new snapshot, compares only
//      tracked properties, and skips `onStoreChange` if irrelevant.
//   4. A tracking proxy wraps `snapRef` — reads go through the proxy's
//      get trap which records access in `trackedRef`.
// =============================================================================

import { useSyncExternalStore, useRef, useCallback, useMemo } from 'react';
import type { Proxified, Subscription } from '../core/types.js';
import { subscribe } from '../core/subscription.js';

/**
 * Subscribe to a proxified object and re-render **only** when tracked
 * properties change.
 *
 * Returns a tracking snapshot — property reads during render are recorded
 * so that mutations to unread properties are silently ignored.
 *
 * ```tsx
 * function UserCard({ user }: { user: Proxified<User> }) {
 *   const snap = useProxy(user);
 *   return <div>{snap.name}</div>; // Only re-renders when `name` changes.
 * }
 * ```
 */
export function useProxy<T extends object>(proxy: Proxified<T>): T {
  const subRef     = useRef<Subscription<T> | null>(null);
  const snapRef    = useRef<T>(null!);
  const trackedRef = useRef(new Set<string | symbol>());
  const proxyIdRef = useRef<string>('');

  // Detect proxy identity change → rebuild snapshot.
  const proxyId = proxy.__proxy_id;
  if (proxyIdRef.current !== proxyId) {
    proxyIdRef.current = proxyId;
    snapRef.current = shallowSnapshot(proxy);
    trackedRef.current = new Set();
  }

  // subscribe / unsubscribe for useSyncExternalStore.
  const subscribeStore = useCallback(
    (onStoreChange: () => void) => {
      // Clean up any stale subscription (e.g., proxy identity changed).
      if (subRef.current) {
        subRef.current.unsubscribe();
      }

      const sub = subscribe(proxy, () => {
        const oldSnap = snapRef.current;
        const newSnap = shallowSnapshot(proxy);
        const tracked = trackedRef.current;

        // Sync tracked props into the subscription system so that future
        // flushes can skip this callback entirely for unrelated mutations
        // (filtering at the handleFlush level, before the callback).
        if (tracked.size > 0) {
          sub.setTrackedProps(tracked);
        }

        // Snapshot comparison remains the primary filter for THIS
        // notification — on the first mutation after mount, _trackedProps
        // wasn't populated yet so handleFlush couldn't pre-filter.
        if (tracked.size > 0) {
          let changed = false;
          for (const prop of tracked) {
            if (!Object.is((oldSnap as Record<string | symbol, unknown>)[prop], (newSnap as Record<string | symbol, unknown>)[prop])) {
              changed = true;
              break;
            }
          }
          if (!changed) return; // Irrelevant mutation — skip re-render.
        }

        snapRef.current = newSnap;
        onStoreChange();
      });
      subRef.current = sub;

      return () => {
        sub.unsubscribe();
        subRef.current = null;
      };
    },
    [proxy],
  );

  // Stable getSnapshot — returns the cached snapshot (same reference until
  // the callback invalidates it).
  const getSnapshot = useCallback((): T => snapRef.current, []);

  useSyncExternalStore(subscribeStore, getSnapshot, getSnapshot);

  // Reset tracked props for this render pass. Reads during the rest of the
  // render function will repopulate the set via the tracking proxy.
  trackedRef.current = new Set();

  // The tracking proxy is stable per proxy identity. It delegates reads to
  // `snapRef.current` (always the latest snapshot) and records each
  // property name in `trackedRef.current` for granular filtering.
  return useMemo(
    () => createTrackingProxy<T>(snapRef, trackedRef),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [proxyId],
  );
}

// ======================== HELPERS ==========================================

/**
 * Build a shallow snapshot of a proxified object's data.
 *
 * Reads values through the proxy (preserving deep-proxified children) but
 * stores them in a plain object so the snapshot is detached from the proxy.
 * @internal
 */
function shallowSnapshot<T extends object>(proxy: Proxified<T>): T {
  const snap: Record<string, unknown> = {};
  const source = proxy.__source;
  for (const key of Object.keys(source)) {
    snap[key] = (source as Record<string, unknown>)[key];
  }
  return snap as T;
}

/**
 * Create a lightweight proxy that:
 *   - Records every string property read in `trackedRef`.
 *   - Delegates the actual value lookup to `snapRef.current`.
 *
 * The proxy identity is stable (created once per reactive proxy) so child
 * components receiving it as a prop won't needlessly re-render.
 * @internal
 */
function createTrackingProxy<T extends object>(
  snapRef: React.RefObject<T>,
  trackedRef: React.RefObject<Set<string | symbol>>,
): T {
  return new Proxy({} as T, {
    get(_, prop) {
      if (typeof prop === 'string') {
        trackedRef.current!.add(prop);
      }
      return (snapRef.current as Record<string | symbol, unknown>)[prop];
    },
    has(_, prop) {
      return prop in (snapRef.current as object);
    },
    ownKeys() {
      return Reflect.ownKeys(snapRef.current as object);
    },
    getOwnPropertyDescriptor(_, prop) {
      const snap = snapRef.current as Record<string | symbol, unknown>;
      if (prop in snap) {
        return {
          configurable: true,
          enumerable: true,
          value: snap[prop],
          writable: true,
        };
      }
      return undefined;
    },
  });
}
