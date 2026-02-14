// =============================================================================
// @silas/core — Reactive Proxy
//
// Creates ES Proxy wrappers around plain objects that:
//   - Track property reads (for granular subscription notifications).
//   - Detect property writes and schedule notifications via the batch system.
//   - Expose virtual properties (__proxy_id, __source, __is_proxy).
//   - Support atomic full-replacement via __source setter.
//   - Optionally deep-proxify nested plain objects.
// =============================================================================

import type { ProxyId, Proxified, ProxifyOptions, BatchMode } from './types.js';
import { markDirty, batch as batchFn } from './batch.js';
import { recordAccess } from './subscription.js';

// ======================== STATE =============================================

/** Monotonic counter for unique proxy IDs. */
let _nextProxyId = 1;

/** Cache of child proxies for deep mode (avoids re-proxifying on every get). */
const _childProxyCache = new WeakMap<object, Proxified<any>>();

// ======================== HELPERS ===========================================

/** Returns true if `value` is a plain object suitable for deep proxifying. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Returns true if `value` is already a Silas proxy. */
export function isProxy(value: unknown): value is Proxified {
  if (value === null || typeof value !== 'object') return false;
  try {
    return (value as any).__is_proxy === true;
  } catch {
    return false;
  }
}

// ======================== PUBLIC API ========================================

/**
 * Create a reactive proxy around a plain object.
 *
 * ```ts
 * import { proxify } from '@silas/core';
 *
 * const state = proxify({ count: 0, name: 'Alice' });
 *
 * // Mutations are detected automatically:
 * state.count = 1;       // schedules notification
 * state.name  = 'Bob';   // schedules notification
 *
 * // Full replacement (atomic):
 * state.__source = { count: 0, name: 'Carol' };
 * ```
 *
 * @param target   The plain object to make reactive.
 * @param options  Configuration (deep proxifying, batch mode).
 * @returns        A `Proxified<T>` that triggers subscriptions on mutation.
 */
export function proxify<T extends object>(
  target: T,
  options: ProxifyOptions = {},
): Proxified<T> {
  // Don't double-proxify.
  if (isProxy(target)) return target as Proxified<T>;

  const {
    deep = false,
    batch: batchMode,
  } = options;

  const proxyId: ProxyId = String(_nextProxyId++);
  const effectiveMode: BatchMode | undefined = batchMode;

  const handler: ProxyHandler<T> = {
    // ------------------------------------------------------------------
    // GET
    // ------------------------------------------------------------------
    get(obj, prop, receiver) {
      // Virtual properties.
      switch (prop) {
        case '__proxy_id':
          return proxyId;
        case '__source':
          return obj;
        case '__is_proxy':
          return true;
      }

      // Record access for granular tracking.
      if (typeof prop === 'string' || typeof prop === 'symbol') {
        recordAccess(prop);
      }

      const value = Reflect.get(obj, prop, receiver);

      // Deep mode: lazily proxify nested plain objects.
      if (deep && isPlainObject(value) && !isProxy(value)) {
        let cached = _childProxyCache.get(value);
        if (!cached) {
          cached = proxify(value, { deep, batch: batchMode });
          _childProxyCache.set(value, cached);
        }
        return cached;
      }

      return value;
    },

    // ------------------------------------------------------------------
    // SET
    // ------------------------------------------------------------------
    set(obj, prop, val, receiver) {
      // Virtual: __source setter — atomic full replacement.
      if (prop === '__source') {
        // Batch the entire replacement so subscribers get ONE notification.
        batchFn(() => {
          // Delete all existing own properties.
          const existingKeys = Object.keys(obj);
          for (const key of existingKeys) {
            if (!(key in (val as object))) {
              delete (obj as any)[key];
            }
          }
          // Copy all properties from the new value.
          const newKeys = Object.keys(val as object);
          for (const key of newKeys) {
            (obj as any)[key] = (val as any)[key];
          }
          markDirty(proxyId, undefined, effectiveMode);
        });
        return true;
      }

      // Virtual: __proxy_id (allow reassignment for compat).
      if (prop === '__proxy_id') {
        // No-op: ID is fixed. This is only for compat layer mapping.
        return true;
      }

      // Equality guard — don't notify if value didn't change.
      const oldVal = Reflect.get(obj, prop, receiver);
      if (Object.is(oldVal, val)) {
        return true;
      }

      const result = Reflect.set(obj, prop, val, receiver);

      if (result) {
        // Invalidate child proxy cache if the new value is different.
        if (deep && isPlainObject(oldVal)) {
          _childProxyCache.delete(oldVal);
        }

        markDirty(proxyId, prop as string | symbol, effectiveMode);
      }

      return result;
    },

    // ------------------------------------------------------------------
    // DELETE
    // ------------------------------------------------------------------
    deleteProperty(obj, prop) {
      const hadProp = prop in obj;
      const oldVal = (obj as any)[prop];
      const result = Reflect.deleteProperty(obj, prop);

      if (result && hadProp) {
        if (deep && isPlainObject(oldVal)) {
          _childProxyCache.delete(oldVal);
        }
        markDirty(proxyId, prop as string | symbol, effectiveMode);
      }

      return result;
    },

    // ------------------------------------------------------------------
    // HAS — for `'prop' in proxy` checks
    // ------------------------------------------------------------------
    has(obj, prop) {
      if (prop === '__is_proxy' || prop === '__proxy_id' || prop === '__source') {
        return true;
      }
      return Reflect.has(obj, prop);
    },
  };

  return new Proxy(target, handler) as Proxified<T>;
}

// ======================== TEST UTILITIES ====================================

/**
 * Reset the internal proxy ID counter. **Only for tests.**
 * @internal
 */
export function __resetProxyId(): void {
  _nextProxyId = 1;
}
