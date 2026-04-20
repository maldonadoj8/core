// =============================================================================
// @silasdevs/core — Error utilities
//
// Provides a base error class and an invariant assertion for fail-fast
// input validation at public API boundaries.
// =============================================================================

/**
 * Base error class for all @silasdevs/core errors.
 *
 * Consumers can catch `SilasError` to distinguish library errors from
 * other runtime exceptions.
 */
export class SilasError extends Error {
  override readonly name = 'SilasError';

  constructor(message: string) {
    super(message);
    // Restore correct prototype chain (required for `instanceof` in TS targets < ES2022).
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Assert that a condition is truthy. Throws a `SilasError` if not.
 *
 * Use at public API boundaries to validate caller-supplied arguments.
 * Internal code paths should NOT use invariant — only system boundaries.
 *
 * ```ts
 * invariant(typeof fn === 'function', 'batch() expects a function argument.');
 * ```
 */
export function invariant(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new SilasError(message);
  }
}
