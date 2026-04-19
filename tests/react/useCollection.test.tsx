// =============================================================================
// Tests — React: useCollection.ts
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act, cleanup } from '@testing-library/react';
import { createStore, defineSchema } from '../../src/store/index';
import { setDefaultBatchMode as setBatchMode } from '../../src/core/batch';
import { __resetSubscriptions } from '../../src/core/subscription';
import { __resetProxyId } from '../../src/core/proxy';
import { useCollection } from '../../src/react/useCollection';

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
        user: { key: 'id' },
      },
    }),
  });
}

describe('useCollection', () => {
  it('returns items and count for a table', () => {
    const store = makeStore();
    store.upsert('user', { id: 1, name: 'Alice' });
    store.upsert('user', { id: 2, name: 'Bob' });

    let result: any;
    function Comp() {
      result = useCollection(store, 'user');
      return React.createElement('div', null, String(result.count));
    }

    render(React.createElement(Comp));
    expect(result.count).toBe(2);
    expect(result.items).toHaveLength(2);
  });

  it('starts empty for an empty table', () => {
    const store = makeStore();
    let result: any;

    function Comp() {
      result = useCollection(store, 'user');
      return React.createElement('div', null, String(result.count));
    }

    render(React.createElement(Comp));
    expect(result.count).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it('re-renders when a record is inserted', () => {
    const store = makeStore();
    const renders = { value: 0 };
    let result: any;

    function Comp() {
      result = useCollection(store, 'user');
      renders.value++;
      return React.createElement('div', null, String(result.count));
    }

    render(React.createElement(Comp));
    expect(result.count).toBe(0);
    const initialRenders = renders.value;

    act(() => {
      store.upsert('user', { id: 1, name: 'Alice' });
    });
    expect(result.count).toBe(1);
    expect(renders.value).toBeGreaterThan(initialRenders);
  });

  it('re-renders when a record is deleted', () => {
    const store = makeStore();
    store.upsert('user', { id: 1, name: 'Alice' });
    store.upsert('user', { id: 2, name: 'Bob' });

    let result: any;
    function Comp() {
      result = useCollection(store, 'user');
      return React.createElement('div', null, String(result.count));
    }

    render(React.createElement(Comp));
    expect(result.count).toBe(2);

    act(() => {
      store.remove('user', 1);
    });
    expect(result.count).toBe(1);
  });

  it('re-renders on structural changes from classify', () => {
    const store = makeStore();
    let result: any;

    function Comp() {
      result = useCollection(store, 'user');
      return React.createElement('div', null, String(result.count));
    }

    render(React.createElement(Comp));
    expect(result.count).toBe(0);

    act(() => {
      store.classify({
        user: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      });
    });
    expect(result.count).toBe(2);
  });

  it('cleans up on unmount without errors', () => {
    const store = makeStore();
    store.upsert('user', { id: 1, name: 'Alice' });

    function Comp() {
      useCollection(store, 'user');
      return React.createElement('div', null, 'test');
    }

    const { unmount } = render(React.createElement(Comp));
    expect(() => unmount()).not.toThrow();

    // Further mutations should not cause errors.
    expect(() => {
      store.upsert('user', { id: 2, name: 'Bob' });
    }).not.toThrow();
  });
});
