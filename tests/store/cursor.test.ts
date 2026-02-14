// =============================================================================
// Tests — Store: cursor.ts
// =============================================================================

import { describe, it, expect } from 'vitest';
import { recalculateCursors, cursorFor } from '../../src/store/cursor';

// =============================================================================
// recalculateCursors
// =============================================================================

describe('recalculateCursors', () => {
  it('returns undefined boundaries for an empty array', () => {
    const result = recalculateCursors([]);
    expect(result.start).toBeUndefined();
    expect(result.end).toBeUndefined();
  });

  it('returns same start and end for a single record', () => {
    const result = recalculateCursors([{ id: 42, name: 'Alice' }]);
    expect(result.start).toBe('42');
    expect(result.end).toBe('42');
  });

  it('returns first and last keys for multiple records', () => {
    const records = [
      { id: 10, name: 'A' },
      { id: 20, name: 'B' },
      { id: 30, name: 'C' },
    ];
    const result = recalculateCursors(records);
    expect(result.start).toBe('10');
    expect(result.end).toBe('30');
  });

  it('respects a custom key field', () => {
    const records = [
      { post_id: 'abc', title: 'first' },
      { post_id: 'xyz', title: 'last' },
    ];
    const result = recalculateCursors(records, 'post_id');
    expect(result.start).toBe('abc');
    expect(result.end).toBe('xyz');
  });

  it('coerces numeric keys to strings', () => {
    const records = [{ id: 1 }, { id: 999 }];
    const result = recalculateCursors(records);
    expect(result.start).toBe('1');
    expect(result.end).toBe('999');
  });

  it('defaults to "id" when no keyField given', () => {
    const records = [{ id: 7 }, { id: 8 }];
    const result = recalculateCursors(records);
    expect(result.start).toBe('7');
    expect(result.end).toBe('8');
  });
});

// =============================================================================
// cursorFor
// =============================================================================

describe('cursorFor', () => {
  const boundaries = { start: '10', end: '50' };

  it('returns start for ascending direction', () => {
    expect(cursorFor(boundaries, 'ascending')).toBe('10');
  });

  it('returns end for descending direction', () => {
    expect(cursorFor(boundaries, 'descending')).toBe('50');
  });

  it('returns undefined when boundaries are empty', () => {
    const empty = { start: undefined, end: undefined };
    expect(cursorFor(empty, 'ascending')).toBeUndefined();
    expect(cursorFor(empty, 'descending')).toBeUndefined();
  });
});
