// =============================================================================
// Integration Tests — Store + React hooks
//
// End-to-end: classify payload → store inserts → useCollection re-renders
// → useRecord tracks specific record → mutation triggers re-render.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act, cleanup } from '@testing-library/react';
import { createStore, defineSchema } from '../../src/store/index';
import { setDefaultBatchMode as setBatchMode } from '../../src/core/batch';
import { __resetSubscriptions } from '../../src/core/subscription';
import { __resetProxyId } from '../../src/core/proxy';
import { useCollection } from '../../src/react/useCollection';
import { useRecord } from '../../src/react/useRecord';

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
        user: { key: 'id', version: 'version' },
        post: { key: 'id', softDelete: 'activo' },
      },
    }),
  });
}

describe('Integration: Store → React', () => {
  it('classify inserts records and useCollection re-renders', () => {
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
          { id: 1, name: 'Alice', version: 1 },
          { id: 2, name: 'Bob', version: 1 },
        ],
      });
    });
    expect(result.count).toBe(2);
  });

  it('useRecord tracks a specific record from classify', () => {
    const store = makeStore();
    store.classify({ user: [{ id: 1, name: 'Alice', version: 1 }] });

    let result: any;
    function Comp() {
      result = useRecord(store, 'user', 1);
      return React.createElement('div', null, result?.name ?? 'none');
    }

    render(React.createElement(Comp));
    expect(result).toBeDefined();
    expect(result.name).toBe('Alice');
  });

  it('upsert update is reflected via proxy in useRecord', () => {
    const store = makeStore();
    store.classify({ user: [{ id: 1, name: 'Alice', version: 1 }] });

    let result: any;
    function Comp() {
      result = useRecord(store, 'user', 1);
      return React.createElement('div', null, result?.name ?? 'none');
    }

    render(React.createElement(Comp));

    act(() => {
      store.upsert('user', { id: 1, name: 'Alice V2', version: 2 });
    });

    // The proxy transparently forwards to the updated target.
    expect(result.name).toBe('Alice V2');
  });

  it('soft-delete removes record from useCollection and useRecord', () => {
    const store = makeStore();
    store.classify({ post: [{ id: 1, title: 'Hello', activo: true }] });

    let collectionResult: any;
    let recordResult: any;
    function Comp() {
      collectionResult = useCollection(store, 'post');
      recordResult = useRecord(store, 'post', 1);
      return React.createElement('div');
    }

    render(React.createElement(Comp));
    expect(collectionResult.count).toBe(1);
    expect(recordResult).toBeDefined();

    act(() => {
      store.classify({ post: [{ id: 1, title: 'Hello', activo: false }] });
    });
    expect(collectionResult.count).toBe(0);
    expect(recordResult).toBeUndefined();
  });

  it('multiple classify calls accumulate correctly', () => {
    const store = makeStore();
    let result: any;

    function Comp() {
      result = useCollection(store, 'user');
      return React.createElement('div', null, String(result.count));
    }

    render(React.createElement(Comp));

    act(() => {
      store.classify({ user: [{ id: 1, name: 'Alice', version: 1 }] });
    });
    expect(result.count).toBe(1);

    act(() => {
      store.classify({ user: [{ id: 2, name: 'Bob', version: 1 }] });
    });
    expect(result.count).toBe(2);
  });

  it('clear resets useCollection', () => {
    const store = makeStore();
    store.classify({
      user: [
        { id: 1, name: 'Alice', version: 1 },
        { id: 2, name: 'Bob', version: 1 },
      ],
    });

    let result: any;
    function Comp() {
      result = useCollection(store, 'user');
      return React.createElement('div', null, String(result.count));
    }

    render(React.createElement(Comp));
    expect(result.count).toBe(2);

    act(() => {
      store.clear('user');
    });
    expect(result.count).toBe(0);
  });
});
