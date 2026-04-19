// =============================================================================
// @silas/core — Batching System
//
// Groups multiple proxy mutations into a single notification round.
// Three modes:
//   - 'microtask' (default): defers flush to the next microtask.
//   - 'sync': flushes immediately after each mutation (legacy behaviour).
//   - 'manual': only flushes inside an explicit batch() call.
// =============================================================================

import type { ProxyId, BatchMode } from './types.js';
import { invariant } from './errors.js';

// ======================== STATE =============================================

/** Current batch nesting depth. 0 = not batching. */
let _depth = 0;

/** Proxy IDs that have been mutated and need notification. */
const _pending = new Set<ProxyId>();

/** Properties that changed per proxy during the current batch. */
const _pendingProps = new Map<ProxyId, Set<string | symbol>>();

/** Whether a microtask flush is already scheduled. */
let _scheduled = false;

/** Global default batch mode. */
let _defaultMode: BatchMode = 'microtask';

/**
 * The flush callback — wired by subscription.ts to avoid circular imports.
 * It receives the set of dirty proxy IDs and, for each, the set of props
 * that changed.
 * @internal
 */
let _flushHandler: (
  dirty: ReadonlySet<ProxyId>,
  props: ReadonlyMap<ProxyId, Set<string | symbol>>,
) => void = () => {};

// ======================== PUBLIC API ========================================

/**
 * Set the global default batch mode.
 *
 * - `'microtask'` — notifications are deferred until the current microtask
 *   boundary. Multiple synchronous mutations produce one notification round.
 * - `'sync'` — every mutation notifies immediately (legacy obs.js behaviour).
 * - `'manual'` — notifications only happen inside explicit `batch()` calls.
 */
export function setDefaultBatchMode(mode: BatchMode): void {
  _defaultMode = mode;
}

/** Returns the current default batch mode. */
export function getDefaultBatchMode(): BatchMode {
  return _defaultMode;
}

/** Returns `true` while inside an explicit `batch()` call. */
export function isBatching(): boolean {
  return _depth > 0;
}

/**
 * Execute `fn` inside a batch. All proxy mutations within `fn` are grouped
 * and subscribers are notified **once** after `fn` completes.
 *
 * Batches can be nested; only the outermost `batch()` triggers the flush.
 *
 * ```ts
 * batch(() => {
 *   proxy.a = 1;
 *   proxy.b = 2;
 * });
 * // Subscribers notified once here, not twice.
 * ```
 */
export function batch(fn: () => void): void {
  invariant(typeof fn === 'function', 'batch() expects a function argument.');

  _depth++;
  try {
    fn();
  } finally {
    _depth--;
    if (_depth === 0) {
      flush();
    }
  }
}

/**
 * Mark a proxy as dirty (needs notification).
 *
 * Called by the proxy `set` / `deleteProperty` traps.
 *
 * - If inside a `batch()`, the notification is deferred until the batch ends.
 * - If `mode === 'sync'`, flushes immediately.
 * - If `mode === 'microtask'`, schedules a microtask flush.
 * - If `mode === 'manual'`, only flushes inside `batch()`.
 *
 * @internal
 */
export function markDirty(
  proxyId: ProxyId,
  prop?: string | symbol,
  mode?: BatchMode,
): void {
  _pending.add(proxyId);

  if (prop !== undefined) {
    let propSet = _pendingProps.get(proxyId);
    if (!propSet) {
      propSet = new Set();
      _pendingProps.set(proxyId, propSet);
    }
    propSet.add(prop);
  }

  // Inside explicit batch — always defer.
  if (_depth > 0) return;

  const effectiveMode = mode ?? _defaultMode;

  switch (effectiveMode) {
    case 'sync':
      flush();
      break;
    case 'microtask':
      if (!_scheduled) {
        _scheduled = true;
        queueMicrotask(flush);
      }
      break;
    case 'manual':
      // Do nothing — wait for explicit batch().
      break;
  }
}

/**
 * Immediately drain all pending notifications.
 *
 * Safe to call multiple times; no-ops if nothing is pending.
 */
export function flush(): void {
  if (_pending.size === 0) {
    _scheduled = false;
    return;
  }

  // Snapshot and clear before notifying (a notification may trigger more
  // mutations that should go into the *next* round).
  const dirty = new Set(_pending);
  const props = new Map(_pendingProps);

  _pending.clear();
  _pendingProps.clear();
  _scheduled = false;

  _flushHandler(dirty, props);
}

/**
 * Register the flush handler. Called once by subscription.ts during init.
 * @internal
 */
export function __setFlushHandler(
  handler: (
    dirty: ReadonlySet<ProxyId>,
    props: ReadonlyMap<ProxyId, Set<string | symbol>>,
  ) => void,
): void {
  _flushHandler = handler;
}

/**
 * Returns the number of proxy IDs currently pending notification.
 */
export function getPendingCount(): number {
  return _pending.size;
}

/**
 * Reset all internal state. **Only for tests.**
 * @internal
 */
export function __resetBatch(): void {
  _depth = 0;
  _pending.clear();
  _pendingProps.clear();
  _scheduled = false;
  _defaultMode = 'microtask';
}
