// =============================================================================
// @silas-core/react — useQuery
//
// Async data fetching hook inspired by React Query / TanStack Query.
// Calls an async function and tracks loading / error / data states.
// Not coupled to any transport — consumer provides their own async fn.
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import type { UseQueryOptions, UseQueryResult } from './types.js';
import { invariant } from '../core/errors.js';

/**
 * Execute an async function and track its status.
 *
 * ```tsx
 * function UserProfile({ api, userId }: Props) {
 *   const { data, isLoading, error, refetch } = useQuery(
 *     () => api.getUser(userId),
 *     [userId],
 *   );
 *   if (isLoading) return <Spinner />;
 *   if (error) return <Error error={error} />;
 *   return <UserCard user={data!} />;
 * }
 * ```
 *
 * The query re-runs when `deps` change (like `useEffect` dependencies).
 *
 * @param fn   The async function to execute. Should return data of type T.
 * @param deps Dependency array. Query re-runs when deps change.
 * @param opts Optional configuration.
 */
export function useQuery<T>(
  fn: () => Promise<T>,
  deps: readonly unknown[] = [],
  opts: UseQueryOptions = {},
): UseQueryResult<T> {
  invariant(typeof fn === 'function', 'useQuery() expects a function as first argument.');

  const { enabled = true } = opts;

  const [data, setData]         = useState<T | undefined>(undefined);
  const [isLoading, setLoading] = useState(enabled);
  const [error, setError]       = useState<unknown>(undefined);

  // Track the latest call to handle race conditions (stale closures).
  const callIdRef = useRef(0);

  const execute = useCallback(async () => {
    const id = ++callIdRef.current;
    setLoading(true);
    setError(undefined);
    try {
      const result = await fn();
      if (callIdRef.current === id) {
        setData(result);
        setLoading(false);
      }
    } catch (err) {
      if (callIdRef.current === id) {
        setError(err);
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    execute();
  }, [execute, enabled]);

  return { data, isLoading, error, refetch: execute };
}
