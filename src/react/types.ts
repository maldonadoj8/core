// =============================================================================
// @silas-core/react — Types
// =============================================================================

export interface UseQueryOptions {
  /**
   * Whether the query is enabled. Defaults to true.
   * Set to false to prevent the query from running.
   */
  enabled?: boolean;
}

export interface UseQueryResult<T> {
  /** The resolved data, or undefined if loading/error. */
  data: T | undefined;
  /** True while the async function is executing. */
  isLoading: boolean;
  /** Error thrown by the async function, if any. */
  error: unknown;
  /** Re-execute the query manually. */
  refetch: () => void;
}

export interface UseMutationOptions<TData, TVariables> {
  /**
   * Called after the mutation function resolves successfully.
   */
  onSuccess?: (data: TData, variables: TVariables) => void;
  /**
   * Called if the mutation function throws.
   */
  onError?: (error: unknown, variables: TVariables) => void;
  /**
   * Called after the mutation completes (success or error).
   */
  onSettled?: (
    data: TData | undefined,
    error: unknown,
    variables: TVariables,
  ) => void;
}

export interface UseMutationResult<TData, TVariables> {
  /** Execute the mutation. */
  mutate: (variables: TVariables) => void;
  /** Execute the mutation and return a promise. */
  mutateAsync: (variables: TVariables) => Promise<TData>;
  /** The result of the last successful mutation. */
  data: TData | undefined;
  /** True while the mutation is executing. */
  isLoading: boolean;
  /** Error from the last mutation attempt. */
  error: unknown;
  /** Reset the mutation state. */
  reset: () => void;
}
