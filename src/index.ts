// =============================================================================
// @silas/core — Main entry point
//
// Re-exports only the core reactive primitives.
// For store, react, or compat APIs use the subpath exports:
//   import { createStore } from '@silas/core/store';
//   import { useProxy }    from '@silas/core/react';
//   import Obs             from '@silas/core/compat';
// =============================================================================

export {
  // Proxy
  proxify,
  isProxy,
  // Subscription
  subscribe,
  unsubscribe,
  // Batching
  batch,
  setBatchMode,
  setDefaultBatchMode,
} from './core/index.js';

export type {
  Proxified,
  ProxyMeta,
  ProxifyOptions,
  Tracker,
  Subscription,
  SubscribeCallback,
  SubscribeOptions,
  BatchMode,
  PendingNotification,
} from './core/index.js';
