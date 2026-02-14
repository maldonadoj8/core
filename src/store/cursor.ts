// =============================================================================
// @silas/core — Cursor Utilities
//
// Pure functions for calculating pagination cursor boundaries.
// A cursor tracks the start/end primary-key values of the current window
// of records, enabling bidirectional fetching (ascending / descending).
// =============================================================================

import type { CursorDirection } from './types.js';

// =============================================================================
// TYPES
// =============================================================================

/** A pair of boundary values extracted from an ordered list of records. */
export interface CursorBoundaries {
  /** Primary key of the first record. */
  start: string | undefined;
  /** Primary key of the last record. */
  end: string | undefined;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Recalculate cursor boundaries from an ordered list of records.
 *
 * Reads the primary key from the first and last record in the array.
 * Returns `{ start: undefined, end: undefined }` when the array is empty.
 *
 * @param records The ordered array of records.
 * @param keyField The field name that holds the primary key (e.g. `'id'`).
 * @returns The recalculated cursor boundaries.
 */
export function recalculateCursors(
  records: Record<string, unknown>[],
  keyField: string = 'id',
): CursorBoundaries {
  if (!records.length) {
    return { start: undefined, end: undefined };
  }
  return {
    start: String(records[0][keyField]),
    end:   String(records[records.length - 1][keyField]),
  };
}

/**
 * Get the appropriate cursor value for a given fetch direction.
 *
 * - `'ascending'`  → returns `start` (fetch older / earlier records).
 * - `'descending'` → returns `end`   (fetch newer / later records).
 *
 * @param boundaries The current cursor boundaries.
 * @param direction  The direction of the next fetch.
 * @returns The cursor value to send to the server, or `undefined` if unknown.
 */
export function cursorFor(
  boundaries: CursorBoundaries,
  direction: CursorDirection,
): string | undefined {
  return direction === 'ascending' ? boundaries.start : boundaries.end;
}
