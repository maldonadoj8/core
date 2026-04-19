// =============================================================================
// Tests — Store: paginated-collection.ts
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { createStore, defineSchema } from '../../src/store/index';
import { setDefaultBatchMode as setBatchMode } from '../../src/core/batch';
import { subscribe } from '../../src/core/subscription';
import { SilasError } from '../../src/core/errors';

beforeEach(() => {
  setBatchMode('sync');
});

function makeStore() {
  return createStore({
    schema: defineSchema({
      tables: {
        entrega: { key: 'id' },
        user:    { key: 'id' },
      },
    }),
  });
}

/** Store with soft-delete enabled (for specific sync tests). */
function makeStoreWithSoftDelete() {
  return createStore({
    schema: defineSchema({
      tables: {
        entrega: { key: 'id', version: 'version', softDelete: 'activo' },
        user:    { key: 'id' },
      },
    }),
  });
}

// =============================================================================
// PaginatedCollection — Core behaviour
// =============================================================================

describe('PaginatedCollection', () => {
  it('starts with empty state', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');

    expect(pc.proxy.items).toHaveLength(0);
    expect(pc.proxy.count).toBe(0);
    expect(pc.proxy.cursorStart).toBeUndefined();
    expect(pc.proxy.cursorEnd).toBeUndefined();
    expect(pc.proxy.hasMore).toBe(true);
  });

  it('addPage upserts records into the store', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');

    pc.addPage(
      [{ id: 1, nombre: 'A', version: 1, activo: true },
       { id: 2, nombre: 'B', version: 1, activo: true }],
      'descending',
    );

    // Records exist in the store.
    expect(store.get('entrega', 1)).toBeDefined();
    expect(store.get('entrega', 2)).toBeDefined();
    expect(store.count('entrega')).toBe(2);
  });

  it('addPage descending appends records', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');

    pc.addPage([{ id: 1 }, { id: 2 }], 'descending');
    pc.addPage([{ id: 3 }, { id: 4 }], 'descending');

    expect(pc.proxy.count).toBe(4);
    expect(pc.proxy.items.map((r: any) => r.id)).toEqual([1, 2, 3, 4]);
  });

  it('addPage ascending prepends records', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');

    pc.addPage([{ id: 5 }, { id: 6 }], 'descending');
    pc.addPage([{ id: 3 }, { id: 4 }], 'ascending');

    expect(pc.proxy.count).toBe(4);
    expect(pc.proxy.items.map((r: any) => r.id)).toEqual([3, 4, 5, 6]);
  });

  it('addPage deduplicates records', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');

    pc.addPage([{ id: 1 }, { id: 2 }, { id: 3 }], 'descending');
    pc.addPage([{ id: 2 }, { id: 3 }, { id: 4 }], 'descending');

    expect(pc.proxy.count).toBe(4);
    expect(pc.proxy.items.map((r: any) => r.id)).toEqual([1, 2, 3, 4]);
  });

  it('addPage with all duplicates is a no-op', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');

    pc.addPage([{ id: 1 }, { id: 2 }], 'descending');
    const itemsBefore = pc.proxy.items;
    pc.addPage([{ id: 1 }, { id: 2 }], 'descending');

    expect(pc.proxy.count).toBe(2);
  });
});

// =============================================================================
// Cursor tracking
// =============================================================================

describe('PaginatedCollection — cursors', () => {
  it('recalculates cursors after addPage', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');

    pc.addPage([{ id: 10 }, { id: 20 }, { id: 30 }], 'descending');

    expect(pc.proxy.cursorStart).toBe('10');
    expect(pc.proxy.cursorEnd).toBe('30');
  });

  it('cursors update after ascending addPage', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');

    pc.addPage([{ id: 20 }, { id: 30 }], 'descending');
    pc.addPage([{ id: 5 }, { id: 10 }], 'ascending');

    expect(pc.proxy.cursorStart).toBe('5');
    expect(pc.proxy.cursorEnd).toBe('30');
  });

  it('cursors reset to undefined after clear', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');

    pc.addPage([{ id: 1 }, { id: 2 }], 'descending');
    pc.clear();

    expect(pc.proxy.cursorStart).toBeUndefined();
    expect(pc.proxy.cursorEnd).toBeUndefined();
    expect(pc.proxy.count).toBe(0);
  });
});

// =============================================================================
// Single record operations
// =============================================================================

describe('PaginatedCollection — addRecord / removeRecord', () => {
  it('addRecord prepends by default', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');

    pc.addPage([{ id: 2 }, { id: 3 }], 'descending');
    pc.addRecord({ id: 1 });

    expect(pc.proxy.items.map((r: any) => r.id)).toEqual([1, 2, 3]);
    expect(pc.proxy.cursorStart).toBe('1');
  });

  it('addRecord appends when prepend is false', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');

    pc.addPage([{ id: 1 }, { id: 2 }], 'descending');
    pc.addRecord({ id: 3 }, false);

    expect(pc.proxy.items.map((r: any) => r.id)).toEqual([1, 2, 3]);
    expect(pc.proxy.cursorEnd).toBe('3');
  });

  it('addRecord skips duplicates', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');

    pc.addPage([{ id: 1 }], 'descending');
    pc.addRecord({ id: 1 });

    expect(pc.proxy.count).toBe(1);
  });

  it('removeRecord removes from view and store', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');

    pc.addPage([{ id: 1 }, { id: 2 }, { id: 3 }], 'descending');
    pc.removeRecord(2);

    expect(pc.proxy.count).toBe(2);
    expect(pc.proxy.items.map((r: any) => r.id)).toEqual([1, 3]);
    expect(store.get('entrega', 2)).toBeUndefined();
  });

  it('removeRecord is a no-op for unknown ID', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');

    pc.addPage([{ id: 1 }], 'descending');
    pc.removeRecord(999);

    expect(pc.proxy.count).toBe(1);
  });
});

// =============================================================================
// hasMore
// =============================================================================

describe('PaginatedCollection — hasMore', () => {
  it('starts as true', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');
    expect(pc.proxy.hasMore).toBe(true);
  });

  it('can be set to false', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');

    pc.setHasMore(false);
    expect(pc.proxy.hasMore).toBe(false);
  });
});

// =============================================================================
// Store integration
// =============================================================================

describe('PaginatedCollection — store sync', () => {
  it('reflects external soft-delete from classify', () => {
    const store = makeStoreWithSoftDelete();
    const pc = store.paginated('entrega');

    pc.addPage(
      [{ id: 1, version: 1, activo: true },
       { id: 2, version: 1, activo: true }],
      'descending',
    );
    expect(pc.proxy.count).toBe(2);

    // Simulate a classify that soft-deletes id=1.
    store.classify({
      entrega: [{ id: 1, version: 2, activo: false }],
    });

    // The paginated view should have dropped id=1.
    expect(pc.proxy.count).toBe(1);
    expect(pc.proxy.items.map((r: any) => r.id)).toEqual([2]);
  });

  it('clear from store.clear() resets paginated views', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');

    pc.addPage([{ id: 1 }, { id: 2 }], 'descending');
    store.clear('entrega');

    expect(pc.proxy.count).toBe(0);
    expect(pc.proxy.cursorStart).toBeUndefined();
  });
});

// =============================================================================
// Reactivity
// =============================================================================

describe('PaginatedCollection — reactivity', () => {
  it('proxy notifies subscribers on addPage', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');

    let notified = false;
    subscribe(pc.proxy, () => {
      notified = true;
      return false;
    });

    pc.addPage([{ id: 1 }], 'descending');
    expect(notified).toBe(true);
  });

  it('proxy notifies subscribers on removeRecord', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');

    pc.addPage([{ id: 1 }, { id: 2 }], 'descending');

    let notified = false;
    subscribe(pc.proxy, () => {
      notified = true;
      return false;
    });

    pc.removeRecord(1);
    expect(notified).toBe(true);
  });

  it('proxy notifies subscribers on clear', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');

    pc.addPage([{ id: 1 }], 'descending');

    let notified = false;
    subscribe(pc.proxy, () => {
      notified = true;
      return false;
    });

    pc.clear();
    expect(notified).toBe(true);
  });
});

// =============================================================================
// Dispose
// =============================================================================

describe('PaginatedCollection — dispose', () => {
  it('dispose cleans up the store subscription', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');

    pc.addPage([{ id: 1, version: 1, activo: true }], 'descending');
    pc.dispose();

    // After dispose, external removals should NOT refresh the view.
    // (We can't easily test "doesn't crash", but we can verify the view
    // is frozen — the count stays at 1 even though the store removed it.)
    store.classify({
      entrega: [{ id: 1, version: 2, activo: false }],
    });
    // The paginated view is no longer syncing.
    expect(pc.proxy.count).toBe(1);
  });

  it('store.disposePaginated unregisters the collection', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');

    store.disposePaginated(pc);

    // Create a new one — should not interfere.
    const pc2 = store.paginated('entrega');
    pc2.addPage([{ id: 1 }], 'descending');
    expect(pc2.proxy.count).toBe(1);
  });
});

// =============================================================================
// Multiple views per table
// =============================================================================

describe('PaginatedCollection — multiple views', () => {
  it('two paginated views on the same table are independent', () => {
    const store = makeStore();
    const pc1 = store.paginated('entrega');
    const pc2 = store.paginated('entrega');

    pc1.addPage([{ id: 1 }, { id: 2 }], 'descending');
    pc2.addPage([{ id: 3 }, { id: 4 }], 'descending');

    expect(pc1.proxy.count).toBe(2);
    expect(pc2.proxy.count).toBe(2);
    expect(pc1.proxy.items.map((r: any) => r.id)).toEqual([1, 2]);
    expect(pc2.proxy.items.map((r: any) => r.id)).toEqual([3, 4]);

    // But records all live in the same store table.
    expect(store.count('entrega')).toBe(4);
  });
});

// =============================================================================
// Validation
// =============================================================================

describe('PaginatedCollection — validation', () => {
  it('addPage throws when records is not an array', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');
    expect(() => pc.addPage({} as any, 'descending')).toThrow(SilasError);
    expect(() => pc.addPage('string' as any, 'descending')).toThrow(SilasError);
  });

  it('addPage throws on invalid direction', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');
    expect(() => pc.addPage([], 'invalid' as any)).toThrow(SilasError);
  });
});

// =============================================================================
// Edge cases
// =============================================================================

describe('PaginatedCollection — edge cases', () => {
  it('addPage with empty array is a no-op', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');
    pc.addPage([], 'descending');
    expect(pc.proxy.count).toBe(0);
    expect(pc.proxy.items).toHaveLength(0);
  });

  it('multiple dispose calls do not throw', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');
    pc.dispose();
    expect(() => pc.dispose()).not.toThrow();
  });

  it('addRecord after addPage with duplicate ID across both', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');
    pc.addPage([{ id: 1 }, { id: 2 }], 'descending');
    pc.addRecord({ id: 2 }); // Duplicate — should be ignored.
    expect(pc.proxy.count).toBe(2);
  });

  it('clear followed by addPage works correctly', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');
    pc.addPage([{ id: 1 }, { id: 2 }], 'descending');
    pc.clear();
    expect(pc.proxy.count).toBe(0);

    pc.addPage([{ id: 3 }], 'descending');
    expect(pc.proxy.count).toBe(1);
    expect(pc.proxy.items.map((r: any) => r.id)).toEqual([3]);
  });
});
