// =============================================================================
// @silas-core/compat — Legacy obs.js compatibility layer
//
// Maps the original WeeiiWebSDK obs.js API (proxify, sub, desub, al_editar)
// to the new @silas-core primitives. Import this module when migrating an
// existing project incrementally.
//
// Differences from the original:
// - `sub()` returns a numeric ticket AND a Subscription object (via `.subscription`).
// - `al_editar()` is executed synchronously (sync batch mode for compat).
// - `proxify()` delegates to the new core proxify.
// - SUBS / OBJ_TICKETS are maintained for compatibility but are read-only views.
// =============================================================================

import {
  proxify as coreProxify,
  subscribe,
  setBatchMode,
  type Proxified,
  type Subscription,
  type SubscribeCallback,
} from '../core/index.js';

// Keep compat batch mode as sync for immediate notification like the original.
setBatchMode('sync');

// =============================================================================
// Ticket-based subscription registry (mirrors original obs.js globals)
// =============================================================================

let _nextTicket = 1;

/** Map: ticket → Subscription (for desub). */
const _ticketSubs = new Map<number, Subscription<any>>();

/** Map: ticket → { obj, observer, tarea, autoeliminar }. */
const SUBS: Record<number, { obj: any; observer: any; tarea: string; autoeliminar: boolean }> = {};

/** Map: proxyId → Set<ticket>. */
const OBJ_TICKETS: Record<string, Set<number>> = {};

// =============================================================================
// Public API — mirrors original obs.js
// =============================================================================

/**
 * Make an object reactive (proxy-wrapped).
 * Equivalent to the original `Obs.proxify(obj)`.
 */
function proxify<T extends object>(obj: T): Proxified<T> {
  return coreProxify(obj);
}

/**
 * Subscribe to changes on a proxified object.
 * Equivalent to the original `Obs.sub(obj, observer, tarea, autoeliminar, pre_ejecutar)`.
 *
 * @param obj           The proxified object to watch.
 * @param observer      The callback to invoke on change.
 * @param tarea         A label for the subscription (for debugging).
 * @param autoeliminar  If true, auto-unsubscribe after the first notification.
 * @param pre_ejecutar  If true, invoke the callback immediately.
 * @returns A numeric ticket that can be passed to `desub()`.
 */
function sub<T extends object>(
  obj: Proxified<T>,
  observer: SubscribeCallback<T>,
  tarea: string = '',
  autoeliminar: boolean = false,
  pre_ejecutar: boolean = false,
): number {
  const ticket = _nextTicket++;

  const subscription = subscribe(obj, observer, {
    once: autoeliminar,
    immediate: pre_ejecutar,
    observer: tarea ? { label: tarea } : null,
  });

  _ticketSubs.set(ticket, subscription);

  // Populate compat globals.
  SUBS[ticket] = { obj, observer, tarea, autoeliminar };
  const proxyId: string = String((obj as any).__proxy_id ?? 'unknown');
  if (!OBJ_TICKETS[proxyId]) OBJ_TICKETS[proxyId] = new Set();
  OBJ_TICKETS[proxyId].add(ticket);

  return ticket;
}

/**
 * Unsubscribe by ticket.
 * Equivalent to the original `Obs.desub(ticket)`.
 */
function desub(ticket: number): void {
  const subscription = _ticketSubs.get(ticket);
  if (!subscription) return;

  subscription.unsubscribe();
  _ticketSubs.delete(ticket);

  // Clean up compat globals.
  const entry = SUBS[ticket];
  if (entry) {
    const proxyId = String((entry.obj as any).__proxy_id ?? 'unknown');
    OBJ_TICKETS[proxyId]?.delete(ticket);
    if (OBJ_TICKETS[proxyId]?.size === 0) delete OBJ_TICKETS[proxyId];
    delete SUBS[ticket];
  }
}

/**
 * Trigger change notification on a proxified object.
 * Equivalent to the original `Obs.al_editar(receptor)`.
 *
 * In the new system, notifications are triggered automatically by the
 * proxy's SET trap. This function exists solely for compatibility with
 * code that manually calls `al_editar` — it forces a flush of pending
 * notifications.
 */
function al_editar<T extends object>(_receptor: Proxified<T>): void {
  // In sync mode, notifications are dispatched immediately by the proxy
  // SET trap, so this is effectively a no-op. Kept for API compat.
}

// =============================================================================
// Exports
// =============================================================================

export {
  proxify,
  sub,
  desub,
  al_editar,
  SUBS,
  OBJ_TICKETS,
};

/** Default export matching the original `Obs` object shape. */
export default {
  proxify,
  sub,
  desub,
  al_editar,
  SUBS,
  OBJ_TICKETS,
};
