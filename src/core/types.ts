// =============================================================================
// @silasdevs/core — Core Types
// =============================================================================

// ======================== PROXY =============================================

/** Unique identifier for a proxified object. */
export type ProxyId = string;

/** Batch mode for proxy notifications. */
export type BatchMode = 'microtask' | 'sync' | 'manual';

/** Options for creating a reactive proxy. */
export interface ProxifyOptions {
  /** Automatically proxify nested plain objects. Default: false. */
  deep?: boolean;
  /** Notification batching strategy. Default: 'microtask'. */
  batch?: BatchMode;
  /**
   * Current nesting depth for deep proxification (internal).
   * Used to prevent stack overflow on circular structures.
   * @internal
   */
  _depth?: number;
}

/**
 * Marker interface for proxified objects.
 * The actual proxy traps intercept these virtual properties.
 */
export interface ProxyMeta {
  /** Unique identifier of this proxy. */
  readonly __proxy_id: ProxyId;
  /** Direct access to the underlying target object (bypasses proxy). */
  __source: Record<string, unknown>;
  /** Guard to check if an object is a Silas proxy. */
  readonly __is_proxy: true;
}

/**
 * A proxified object: the original type T plus proxy metadata.
 * The metadata properties are virtual (intercepted by the proxy handler)
 * and don't exist on the target.
 */
export type Proxified<T extends object = Record<string, unknown>> = T & ProxyMeta;

// ======================== SUBSCRIPTION ======================================

/** Callback invoked when a subscribed proxy changes. */
export type SubscribeCallback<T extends object = Record<string, unknown>> = (
  value: Proxified<T>,
  subscription: Subscription<T>,
) => boolean | void;

/** Options for subscribing to a proxy. */
export interface SubscribeOptions {
  /** Auto-unsubscribe after the first notification. Default: false. */
  once?: boolean;
  /** Execute the callback immediately upon subscribing. Default: false. */
  immediate?: boolean;
  /** Optional reference to the subscribing object (for debugging). */
  observer?: object | null;
}

/**
 * Scoped property tracker — one per subscription.
 * Records which properties were read during a tracking window,
 * enabling per-property notification granularity.
 */
export interface Tracker {
  /** Record a property read. Called by the proxy `get` trap. */
  record(prop: string | symbol): void;
  /** Return the set of tracked properties (read-only view). */
  props(): ReadonlySet<string | symbol>;
  /** Clear tracked properties (e.g., before a new render pass). */
  reset(): void;
}

/** A live subscription to a proxified object. */
export interface Subscription<T extends object = Record<string, unknown>> {
  /** Unique ticket identifying this subscription. */
  readonly ticket: string;
  /** The proxified object being observed. */
  readonly target: Proxified<T>;
  /** Optional observer reference. */
  readonly observer: object | null;
  /** The callback function. */
  readonly callback: SubscribeCallback<T>;
  /** Whether this subscription auto-removes after one invocation. */
  readonly once: boolean;
  /** Programmatically cancel this subscription. */
  unsubscribe: () => void;
  /**
   * Execute `fn` inside a tracking window. Property reads on the proxy
   * within `fn` are recorded, enabling the subscription to skip
   * notifications for unrelated property changes.
   *
   * Safe for nesting — uses save/restore on the active tracker.
   *
   * ```ts
   * sub.track(() => {
   *   // Reads proxy.name → records 'name'
   *   console.log(proxy.name);
   * });
   * // Subsequent mutations to proxy.email will NOT notify this subscription.
   * ```
   */
  track: <R>(fn: () => R) => R;
  /**
   * Directly set the tracked properties for this subscription.
   *
   * Unlike `track(fn)` which discovers properties via proxy reads,
   * this accepts a pre-built set — useful when the caller already
   * knows which properties were accessed (e.g., from a tracking proxy).
   *
   * ```ts
   * sub.setTrackedProps(new Set(['name', 'age']));
   * // Subsequent mutations to other props will NOT notify this subscription.
   * ```
   */
  setTrackedProps: (props: ReadonlySet<string | symbol>) => void;
}

// ======================== INTERNAL ==========================================

/**
 * Internal record for a notification pending flush.
 * @internal
 */
export interface PendingNotification {
  proxyId: ProxyId;
  prop?: string | symbol;
}
