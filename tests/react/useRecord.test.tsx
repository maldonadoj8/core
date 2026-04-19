// =============================================================================
// Tests — React: useRecord.ts
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act, cleanup } from '@testing-library/react';
import { createStore, defineSchema } from '../../src/store/index';
import { setDefaultBatchMode as setBatchMode } from '../../src/core/batch';
import { __resetSubscriptions } from '../../src/core/subscription';
import { __resetProxyId } from '../../src/core/proxy';
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
      },
    }),
  });
}

describe('useRecord', () => {
  it('returns the record when it exists', () => {
    const store = makeStore();
    store.upsert('user', { id: 1, name: 'Alice', version: 1 });

    let result: any;
    function Comp() {
      result = useRecord(store, 'user', 1);
      return React.createElement('div', null, result?.name ?? 'none');
    }

    render(React.createElement(Comp));
    expect(result).toBeDefined();
    expect(result.name).toBe('Alice');
  });

  it('returns undefined when record does not exist', () => {
    const store = makeStore();

    let result: any;
    function Comp() {
      result = useRecord(store, 'user', 999);
      return React.createElement('div', null, result?.name ?? 'none');
    }

    render(React.createElement(Comp));
    expect(result).toBeUndefined();
  });

  it('re-renders when the record is inserted after mount', () => {
    const store = makeStore();
    const renders = { value: 0 };
    let result: any;

    function Comp() {
      result = useRecord(store, 'user', 1);
      renders.value++;
      return React.createElement('div', null, result?.name ?? 'none');
    }

    render(React.createElement(Comp));
    expect(result).toBeUndefined();
    expect(renders.value).toBe(1);

    // Insert the record after mount.
    act(() => {
      store.upsert('user', { id: 1, name: 'Alice', version: 1 });
    });
    expect(result).toBeDefined();
    expect(result.name).toBe('Alice');
    expect(renders.value).toBeGreaterThan(1);
  });

  it('reflects updates via proxy when the record is updated', () => {
    const store = makeStore();
    store.upsert('user', { id: 1, name: 'Alice', version: 1 });
    let result: any;

    function Comp() {
      result = useRecord(store, 'user', 1);
      return React.createElement('div', null, result?.name ?? 'none');
    }

    render(React.createElement(Comp));
    expect(result.name).toBe('Alice');

    act(() => {
      store.upsert('user', { id: 1, name: 'Bob', version: 2 });
    });
    // The proxy transparently forwards to the updated target data.
    expect(result.name).toBe('Bob');
  });

  it('re-renders when the record is deleted externally', () => {
    const store = makeStore();
    store.upsert('user', { id: 1, name: 'Alice', version: 1 });
    let result: any;

    function Comp() {
      result = useRecord(store, 'user', 1);
      return React.createElement('div', null, result?.name ?? 'none');
    }

    render(React.createElement(Comp));
    expect(result).toBeDefined();

    act(() => {
      store.remove('user', 1);
    });
    expect(result).toBeUndefined();
  });

  it('cleans up subscriptions on unmount', () => {
    const store = makeStore();
    store.upsert('user', { id: 1, name: 'Alice', version: 1 });

    function Comp() {
      useRecord(store, 'user', 1);
      return React.createElement('div', null, 'test');
    }

    const { unmount } = render(React.createElement(Comp));

    // Should not throw on unmount.
    expect(() => unmount()).not.toThrow();

    // Further mutations should not cause errors.
    expect(() => {
      store.upsert('user', { id: 1, name: 'Bob', version: 2 });
    }).not.toThrow();
  });
});
