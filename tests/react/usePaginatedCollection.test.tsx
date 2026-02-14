// =============================================================================
// Tests — React: usePaginatedCollection.tsx
//
// Verifies:
//   - Initial empty state.
//   - addPage updates items/count/cursors.
//   - Property-level tracking (reading only count → no re-render on item change).
//   - cursorFor returns correct value per direction.
//   - clear resets all state.
// =============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act, cleanup } from '@testing-library/react';
import { createStore, defineSchema } from '../../src/store/index';
import { setDefaultBatchMode as setBatchMode } from '../../src/core/batch';
import { __resetSubscriptions } from '../../src/core/subscription';
import { __resetProxyId } from '../../src/core/proxy';
import { usePaginatedCollection } from '../../src/react/usePaginatedCollection';
import type { Store } from '../../src/store/store';

beforeEach(() => {
  setBatchMode('sync');
  __resetSubscriptions();
  __resetProxyId();
});

afterEach(() => {
  cleanup();
});

function makeStore() {
  return createStore({
    schema: defineSchema({
      tables: {
        entrega: { key: 'id' },
      },
    }),
  });
}

// =============================================================================
// Basic rendering
// =============================================================================

describe('usePaginatedCollection', () => {
  it('returns empty state on initial render', () => {
    const store = makeStore();
    const snapshot = { value: null as any };

    function TestComponent({ store: s }: { store: Store }) {
      const result = usePaginatedCollection(s, 'entrega');
      snapshot.value = result;
      return React.createElement('div', null, `count:${result.count}`);
    }

    render(React.createElement(TestComponent, { store }));

    expect(snapshot.value.items).toHaveLength(0);
    expect(snapshot.value.count).toBe(0);
    expect(snapshot.value.cursorStart).toBeUndefined();
    expect(snapshot.value.cursorEnd).toBeUndefined();
    expect(snapshot.value.hasMore).toBe(true);
  });

  it('addPage updates items, count, and cursors', () => {
    const store = makeStore();
    const snapshot = { value: null as any };

    function TestComponent({ store: s }: { store: Store }) {
      const result = usePaginatedCollection(s, 'entrega');
      snapshot.value = result;
      return React.createElement('div', null, `count:${result.count}`);
    }

    render(React.createElement(TestComponent, { store }));

    act(() => {
      snapshot.value.addPage(
        [{ id: 10 }, { id: 20 }, { id: 30 }],
        'descending',
      );
    });

    expect(snapshot.value.count).toBe(3);
    expect(snapshot.value.cursorStart).toBe('10');
    expect(snapshot.value.cursorEnd).toBe('30');
    expect(snapshot.value.items).toHaveLength(3);
  });

  it('cursorFor returns correct value per direction', () => {
    const store = makeStore();
    const snapshot = { value: null as any };

    function TestComponent({ store: s }: { store: Store }) {
      const result = usePaginatedCollection(s, 'entrega');
      snapshot.value = result;
      return React.createElement('div', null, `count:${result.count}`);
    }

    render(React.createElement(TestComponent, { store }));

    act(() => {
      snapshot.value.addPage(
        [{ id: 5 }, { id: 15 }],
        'descending',
      );
    });

    expect(snapshot.value.cursorFor('ascending')).toBe('5');
    expect(snapshot.value.cursorFor('descending')).toBe('15');
  });

  it('clear resets all state', () => {
    const store = makeStore();
    const snapshot = { value: null as any };

    function TestComponent({ store: s }: { store: Store }) {
      const result = usePaginatedCollection(s, 'entrega');
      snapshot.value = result;
      return React.createElement('div', null, `count:${result.count}`);
    }

    render(React.createElement(TestComponent, { store }));

    act(() => {
      snapshot.value.addPage([{ id: 1 }, { id: 2 }], 'descending');
    });
    expect(snapshot.value.count).toBe(2);

    act(() => {
      snapshot.value.clear();
    });

    expect(snapshot.value.count).toBe(0);
    expect(snapshot.value.items).toHaveLength(0);
    expect(snapshot.value.cursorStart).toBeUndefined();
    expect(snapshot.value.cursorEnd).toBeUndefined();
  });

  it('clear with callback executes callback after clearing', () => {
    const store = makeStore();
    const snapshot = { value: null as any };
    let callbackCalled = false;

    function TestComponent({ store: s }: { store: Store }) {
      const result = usePaginatedCollection(s, 'entrega');
      snapshot.value = result;
      return React.createElement('div', null, `count:${result.count}`);
    }

    render(React.createElement(TestComponent, { store }));

    act(() => {
      snapshot.value.addPage([{ id: 1 }], 'descending');
    });

    act(() => {
      snapshot.value.clear(() => {
        callbackCalled = true;
      });
    });

    expect(callbackCalled).toBe(true);
    expect(snapshot.value.count).toBe(0);
  });

  it('removeRecord removes from view and re-renders', () => {
    const store = makeStore();
    const snapshot = { value: null as any };

    function TestComponent({ store: s }: { store: Store }) {
      const result = usePaginatedCollection(s, 'entrega');
      snapshot.value = result;
      return React.createElement('div', null, `count:${result.count}`);
    }

    render(React.createElement(TestComponent, { store }));

    act(() => {
      snapshot.value.addPage([{ id: 1 }, { id: 2 }, { id: 3 }], 'descending');
    });
    expect(snapshot.value.count).toBe(3);

    act(() => {
      snapshot.value.removeRecord(2);
    });

    expect(snapshot.value.count).toBe(2);
  });

  it('setHasMore updates the hasMore flag', () => {
    const store = makeStore();
    const snapshot = { value: null as any };

    function TestComponent({ store: s }: { store: Store }) {
      const result = usePaginatedCollection(s, 'entrega');
      snapshot.value = result;
      return React.createElement('div', null, `hasMore:${result.hasMore}`);
    }

    render(React.createElement(TestComponent, { store }));
    expect(snapshot.value.hasMore).toBe(true);

    act(() => {
      snapshot.value.setHasMore(false);
    });

    expect(snapshot.value.hasMore).toBe(false);
  });

  it('addRecord prepends and updates state', () => {
    const store = makeStore();
    const snapshot = { value: null as any };

    function TestComponent({ store: s }: { store: Store }) {
      const result = usePaginatedCollection(s, 'entrega');
      snapshot.value = result;
      return React.createElement('div', null, `count:${result.count}`);
    }

    render(React.createElement(TestComponent, { store }));

    act(() => {
      snapshot.value.addPage([{ id: 2 }, { id: 3 }], 'descending');
    });

    act(() => {
      snapshot.value.addRecord({ id: 1 });
    });

    expect(snapshot.value.count).toBe(3);
    expect(snapshot.value.cursorStart).toBe('1');
  });
});

// =============================================================================
// Re-render tracking
// =============================================================================

describe('usePaginatedCollection — render efficiency', () => {
  it('re-renders on count change', () => {
    const store = makeStore();
    const renderCount = { value: 0 };
    const snapshot = { value: null as any };

    function TestComponent({ store: s }: { store: Store }) {
      const result = usePaginatedCollection(s, 'entrega');
      renderCount.value++;
      snapshot.value = result;
      // Read count to track it.
      void result.count;
      return React.createElement('div', null, `count:${result.count}`);
    }

    render(React.createElement(TestComponent, { store }));
    expect(renderCount.value).toBe(1);

    act(() => {
      snapshot.value.addPage([{ id: 1 }], 'descending');
    });

    // Should have re-rendered because count changed.
    expect(renderCount.value).toBeGreaterThan(1);
  });
});
