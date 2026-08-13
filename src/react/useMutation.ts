// =============================================================================
// @silasdevs/core/react — useMutation
//
// Imperative mutation hook inspired by React Query / TanStack Query.
// Wraps an async function with loading / error / data / callback states.
// =============================================================================

import { useState, useCallback, useRef } from 'react';
import type { UseMutationOptions, UseMutationResult } from './types.js';
import { invariant } from '../core/errors.js';

/**
 * Wrap an async function for imperative execution with state tracking.
 *
 * ```tsx
 * function CreateUser({ api }: Props) {
 *   const { mutate, isLoading } = useMutation(
 *     (input: CreateUserInput) => api.createUser(input),
 *     { onSuccess: () => toast('User created!') },
 *   );
 *   return (
 *     <button disabled={isLoading} onClick={() => mutate({ name: 'Alice' })}>
 *       Create
 *     </button>
 *   );
 * }
 * ```
 */
export function useMutation<TData = unknown, TVariables = void>(
  fn: (variables: TVariables) => Promise<TData>,
  opts: UseMutationOptions<TData, TVariables> = {},
): UseMutationResult<TData, TVariables> {
  invariant(typeof fn === 'function', 'useMutation() expects a function as first argument.');

  const [data, setData]         = useState<TData | undefined>(undefined);
  const [isLoading, setLoading] = useState(false);
  const [error, setError]       = useState<unknown>(undefined);

  // The newest invocation owns visible data, error, and loading state.
  const invocationRef = useRef(0);

  // Keep a stable ref for opts so callbacks don't cause re-renders.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const mutateAsync = useCallback(
    async (variables: TVariables): Promise<TData> => {
      const invocation = ++invocationRef.current;
      setLoading(true);
      setError(undefined);
      try {
        const result = await fn(variables);
        if (invocationRef.current === invocation) {
          setData(result);
          setLoading(false);
        }
        optsRef.current.onSuccess?.(result, variables);
        optsRef.current.onSettled?.(result, undefined, variables);
        return result;
      } catch (err) {
        if (invocationRef.current === invocation) {
          setError(err);
          setLoading(false);
        }
        optsRef.current.onError?.(err, variables);
        optsRef.current.onSettled?.(undefined, err, variables);
        throw err;
      }
    },
    [fn],
  );

  const mutate = useCallback(
    (variables: TVariables) => {
      mutateAsync(variables).catch(() => {
        // Swallow — error is tracked in state.
      });
    },
    [mutateAsync],
  );

  const reset = useCallback(() => {
    invocationRef.current++;
    setData(undefined);
    setError(undefined);
    setLoading(false);
  }, []);

  return { mutate, mutateAsync, data, isLoading, error, reset };
}
