// =============================================================================
// @silas/core — Subscription Manager
//
// Manages subscriptions between consumers and proxified objects.
// Wires into the batch system to receive flush notifications.
//
// TRACKING SYSTEM
// ---------------
// Each subscription owns a scoped Tracker. When the consumer calls
// `sub.track(fn)`, property reads inside `fn` are recorded in *that*
// subscription's tracker — not in a global variable. This is safe for:
//   - Concurrent / interleaved renders (React 18 concurrent mode).
//   - Nested tracking windows (one useProxy inside another).
//   - Aborted renders (no orphan state left behind).
//
// The module-level `_activeTracker` is only set during the synchronous
// execution of `fn` and is restored to its previous value via save/restore,
// so nesting is always balanced.
// =============================================================================

import type {
  ProxyId,
  Proxified,
  Tracker,
  SubscribeCallback,
  SubscribeOptions,
  Subscription,
} from './types.js';
import { __setFlushHandler } from './batch.js';
import { invariant } from './errors.js';

// ======================== STATE =============================================

/** Monotonic counter for unique subscription tickets. */
let _nextTicket = 1;

/** All active subscriptions, keyed by ticket. */
const _subscriptions = new Map<string, Subscription<any>>();

/** Tickets grouped by proxy ID, for fast lookup on notification. */
const _proxyTickets = new Map<ProxyId, Set<string>>();

/**
 * Per-subscription tracked properties. Populated when `sub.track(fn)` is
 * called — records which properties the consumer read, so `handleFlush`
 * can skip irrelevant notifications.
 *
 * Keyed by ticket for O(1) lookup in the hot notification path.
 */
const _trackedProps = new Map<string, Set<string | symbol>>();

/**
 * The tracker that is currently active (set during `sub.track(fn)`).
 * `null` outside any tracking window. Uses save/restore for safe nesting.
 * @internal — visible to `recordAccess` only.
 */
let _activeTracker: Tracker | null = null;

// ======================== TRACKER FACTORY ====================================

/**
 * Create a scoped property tracker owned by a single subscription.
 *
 * The tracker is a lightweight object with its own `Set` of recorded props.
 * It is activated/deactivated via `runWithTracker` — never exposed globally.
 * @internal
 */
function createTracker(): Tracker {
  const _props = new Set<string | symbol>();

  return {
    record(prop: string | symbol): void {
      _props.add(prop);
    },
    props(): ReadonlySet<string | symbol> {
      return _props;
    },
    reset(): void {
      _props.clear();
    },
  };
}

/**
 * Execute `fn` with `tracker` as the active tracker.
 *
 * Uses save/restore so nested calls (e.g., a `useProxy` inside another
 * `useProxy`) each record into their own tracker without interference.
 * @internal
 */
function runWithTracker<R>(tracker: Tracker, fn: () => R): R {
  const prev = _activeTracker;
  _activeTracker = tracker;
  try {
    return fn();
  } finally {
    _activeTracker = prev;
  }
}

// ======================== PUBLIC API ========================================

/**
 * Subscribe to changes on a proxified object.
 *
 * Returns a `Subscription` object with `unsubscribe()` and `track(fn)`.
 *
 * ```ts
 * const sub = subscribe(proxy, (value) => {
 *   console.log('Changed:', value);
 *   return false; // keep subscription alive
 * });
 *
 * // Enable property-level granularity:
 * sub.track(() => {
 *   console.log(proxy.name); // records 'name'
 * });
 * // Now only mutations to `name` will fire the callback.
 *
 * // Later:
 * sub.unsubscribe();
 * ```
 */
export function subscribe<T extends object>(
  proxy: Proxified<T>,
  callback: SubscribeCallback<T>,
  options: SubscribeOptions = {},
): Subscription<T> {
  invariant(
    proxy !== null && proxy !== undefined && typeof proxy === 'object' && '__proxy_id' in proxy,
    'subscribe() expects a proxified object as first argument. Use proxify() first.',
  );
  invariant(
    typeof callback === 'function',
    'subscribe() expects a function as second argument.',
  );

  const {
    once = false,
    immediate = false,
    observer = null,
  } = options;

  const ticket  = String(_nextTicket++);
  const proxyId = proxy.__proxy_id;

  // Register ticket under this proxy.
  let tickets = _proxyTickets.get(proxyId);
  if (!tickets) {
    tickets = new Set();
    _proxyTickets.set(proxyId, tickets);
  }
  tickets.add(ticket);

  // Per-subscription tracker.
  const tracker = createTracker();

  // Build subscription object.
  const sub: Subscription<T> = {
    ticket,
    target:   proxy,
    observer,
    callback,
    once,
    unsubscribe: () => unsubscribe(ticket),
    track: <R>(fn: () => R): R => {
      // Reset tracked props before each tracking window so we capture a
      // fresh set that reflects the current render's property reads.
      tracker.reset();
      const result = runWithTracker(tracker, fn);
      // Persist the tracked set so handleFlush can read it.
      _trackedProps.set(ticket, new Set(tracker.props()));
      return result;
    },
    setTrackedProps: (props: ReadonlySet<string | symbol>): void => {
      _trackedProps.set(ticket, new Set(props));
    },
  };

  _subscriptions.set(ticket, sub);

  // Pre-execute if requested.
  if (immediate) {
    try {
      const result = callback(proxy, sub);
      if (result === true || once) {
        unsubscribe(ticket);
        return sub;
      }
    } catch (err) {
      console.error('[silas/core] Error in immediate subscription callback:', err);
    }
  }

  return sub;
}

/**
 * Cancel a subscription by ticket. Idempotent.
 */
export function unsubscribe(ticket: string): void {
  const sub = _subscriptions.get(ticket);
  if (!sub) return;

  const proxyId = sub.target.__proxy_id;
  const tickets = _proxyTickets.get(proxyId);
  if (tickets) {
    tickets.delete(ticket);
    if (tickets.size === 0) {
      _proxyTickets.delete(proxyId);
    }
  }

  _subscriptions.delete(ticket);
  _trackedProps.delete(ticket);
}

/**
 * Check if a proxy has any active subscriptions.
 */
export function hasSubscribers(proxyId: ProxyId): boolean {
  const tickets = _proxyTickets.get(proxyId);
  return tickets !== undefined && tickets.size > 0;
}

/**
 * Get the number of active subscriptions for a proxy.
 */
export function subscriberCount(proxyId: ProxyId): number {
  return _proxyTickets.get(proxyId)?.size ?? 0;
}

// ======================== ACCESS TRACKING ===================================

/**
 * Record a property access. Called by the proxy `get` trap.
 *
 * If a tracker is active (inside a `sub.track(fn)` call), the property is
 * recorded. Otherwise this is a no-op — no global state is mutated.
 * @internal
 */
export function recordAccess(prop: string | symbol): void {
  if (_activeTracker === null) return;
  _activeTracker.record(prop);
}

/**
 * Get the set of properties a subscriber has tracked (if any).
 * @internal
 */
export function getTrackedProps(ticket: string): ReadonlySet<string | symbol> | undefined {
  return _trackedProps.get(ticket);
}

// ======================== NOTIFICATION (flush handler) =======================

/**
 * Notify subscribers of dirty proxies. Called by the batch system on flush.
 *
 * For each dirty proxy:
 *   1. Iterate its tickets.
 *   2. If the subscriber has tracked props, skip notification if none of the
 *      changed props are in the tracked set.
 *   3. Execute callback inside try/catch (one error doesn't block others).
 *   4. If callback returns `true` or subscription is `once`, auto-unsubscribe.
 */
function handleFlush(
  dirty: ReadonlySet<ProxyId>,
  props: ReadonlyMap<ProxyId, Set<string | symbol>>,
): void {
  for (const proxyId of dirty) {
    const tickets = _proxyTickets.get(proxyId);
    if (!tickets || tickets.size === 0) continue;

    const changedProps = props.get(proxyId);

    // Snapshot tickets to avoid mutation during iteration.
    const ticketArray = [...tickets];

    for (const ticket of ticketArray) {
      const sub = _subscriptions.get(ticket);
      if (!sub) continue;

      // Granular check: if this subscriber tracks props, only notify if
      // at least one changed prop is in the tracked set.
      if (changedProps && changedProps.size > 0) {
        const tracked = _trackedProps.get(ticket);
        if (tracked && tracked.size > 0) {
          let relevant = false;
          for (const cp of changedProps) {
            if (tracked.has(cp)) {
              relevant = true;
              break;
            }
          }
          if (!relevant) continue;
        }
      }

      try {
        const result = sub.callback(sub.target, sub);
        if (result === true || sub.once) {
          unsubscribe(ticket);
        }
      } catch (err) {
        console.error('[silas/core] Error in subscription callback:', err);
      }
    }
  }
}

// ======================== INIT ==============================================

// Wire flush handler into the batch system.
__setFlushHandler(handleFlush);

// ======================== TEST UTILITIES ====================================

/**
 * Reset all subscriptions. **Only for tests.**
 * @internal
 */
export function __resetSubscriptions(): void {
  _subscriptions.clear();
  _proxyTickets.clear();
  _trackedProps.clear();
  _activeTracker = null;
  _nextTicket = 1;
}
