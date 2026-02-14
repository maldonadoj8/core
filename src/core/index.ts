// =============================================================================
// @silas/core — Core barrel export
// =============================================================================

// Proxy
export { proxify, isProxy, __resetProxyId } from './proxy.js';

// Subscription
export {
  subscribe,
  unsubscribe,
  hasSubscribers,
  subscriberCount,
  recordAccess,
  getTrackedProps,
  __resetSubscriptions,
} from './subscription.js';

// Batch
export {
  batch,
  markDirty,
  flush,
  isBatching,
  setDefaultBatchMode,
  setDefaultBatchMode as setBatchMode,
  getDefaultBatchMode,
  __setFlushHandler,
  __resetBatch,
} from './batch.js';

// Types
export type {
  ProxyId,
  BatchMode,
  ProxifyOptions,
  ProxyMeta,
  Proxified,
  Tracker,
  SubscribeCallback,
  SubscribeOptions,
  Subscription,
  PendingNotification,
} from './types.js';
