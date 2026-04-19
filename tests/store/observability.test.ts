// =============================================================================
// Tests — Store Observability: tables(), inspect(), onMutation, getPendingCount
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStore, defineSchema, ChangeType, type MutationEvent } from '../../src/store/index';
import { setDefaultBatchMode as setBatchMode, getPendingCount, flush, __resetBatch } from '../../src/core/batch';
import { __resetSubscriptions } from '../../src/core/subscription';
import { __resetProxyId } from '../../src/core/proxy';
import { proxify } from '../../src/core/proxy';

beforeEach(() => {
  setBatchMode('sync');
  __resetBatch();
  __resetSubscriptions();
  __resetProxyId();
});

function makeStore(onMutation?: (event: MutationEvent) => void) {
  return createStore({
    schema: defineSchema({
      tables: {
        user: { key: 'id', version: 'version' },
        post: { key: 'id', softDelete: 'activo' },
      },
    }),
    onMutation,
  });
}

// =============================================================================
// store.tables()
// =============================================================================

describe('store.tables()', () => {
  it('returns empty array when no data has been inserted', () => {
    const store = makeStore();
    expect(store.tables()).toEqual([]);
  });

  it('returns table keys after upsert', () => {
    const store = makeStore();
    store.upsert('user', { id: 1, name: 'Alice', version: 1 });
    expect(store.tables()).toContain('user');
  });

  it('returns all tables with data', () => {
    const store = makeStore();
    store.upsert('user', { id: 1, name: 'Alice', version: 1 });
    store.upsert('post', { id: 1, title: 'Hello', activo: true });
    const tables = store.tables();
    expect(tables).toContain('user');
    expect(tables).toContain('post');
  });
});

// =============================================================================
// store.inspect()
// =============================================================================

describe('store.inspect()', () => {
  it('inspects a single table', () => {
    const store = makeStore();
    store.upsert('user', { id: 1, name: 'Alice', version: 1 });
    store.upsert('user', { id: 2, name: 'Bob', version: 1 });

    const info = store.inspect('user');
    expect(info.table).toBe('user');
    expect(info.recordCount).toBe(2);
    expect(info.recordIds).toContain('1');
    expect(info.recordIds).toContain('2');
    expect(info.hasCollection).toBe(false);
  });

  it('reports hasCollection after collection() is called', () => {
    const store = makeStore();
    store.upsert('user', { id: 1, name: 'Alice', version: 1 });
    store.collection('user');

    const info = store.inspect('user');
    expect(info.hasCollection).toBe(true);
  });

  it('reports paginatedViewCount', () => {
    const store = makeStore();
    store.upsert('user', { id: 1, name: 'Alice', version: 1 });
    const pc = store.paginated('user');

    const info = store.inspect('user');
    expect(info.paginatedViewCount).toBe(1);

    store.disposePaginated(pc);
    const info2 = store.inspect('user');
    expect(info2.paginatedViewCount).toBe(0);
  });

  it('inspects a table with no data', () => {
    const store = makeStore();
    const info = store.inspect('user');
    expect(info.recordCount).toBe(0);
    expect(info.recordIds).toEqual([]);
  });

  it('inspects all tables when no argument given', () => {
    const store = makeStore();
    store.upsert('user', { id: 1, name: 'Alice', version: 1 });
    store.upsert('post', { id: 1, title: 'Hello', activo: true });

    const all = store.inspect();
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBe(2);
    expect(all.map(i => i.table)).toContain('user');
    expect(all.map(i => i.table)).toContain('post');
  });
});

// =============================================================================
// onMutation callback
// =============================================================================

describe('onMutation', () => {
  it('fires on INSERT', () => {
    const spy = vi.fn();
    const store = makeStore(spy);
    store.upsert('user', { id: 1, name: 'Alice', version: 1 });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'upsert',
      table: 'user',
      change: ChangeType.INSERT,
    }));
  });

  it('fires on UPDATE', () => {
    const spy = vi.fn();
    const store = makeStore(spy);
    store.upsert('user', { id: 1, name: 'Alice', version: 1 });
    spy.mockClear();

    store.upsert('user', { id: 1, name: 'Alice V2', version: 2 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'upsert',
      change: ChangeType.UPDATE,
      previous: expect.objectContaining({ name: 'Alice' }),
    }));
  });

  it('fires on DELETE via soft-delete', () => {
    const spy = vi.fn();
    const store = makeStore(spy);
    store.upsert('post', { id: 1, title: 'Hello', activo: true });
    spy.mockClear();

    store.upsert('post', { id: 1, title: 'Hello', activo: false });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'upsert',
      change: ChangeType.DELETE,
    }));
  });

  it('fires on explicit remove()', () => {
    const spy = vi.fn();
    const store = makeStore(spy);
    store.upsert('user', { id: 1, name: 'Alice', version: 1 });
    spy.mockClear();

    store.remove('user', 1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'remove',
      table: 'user',
      change: ChangeType.DELETE,
    }));
  });

  it('fires on clear()', () => {
    const spy = vi.fn();
    const store = makeStore(spy);
    store.upsert('user', { id: 1, name: 'Alice', version: 1 });
    spy.mockClear();

    store.clear('user');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'clear',
      table: 'user',
    }));
  });

  it('does not break store operations if callback throws', () => {
    const store = makeStore(() => { throw new Error('boom'); });
    expect(() => {
      store.upsert('user', { id: 1, name: 'Alice', version: 1 });
    }).not.toThrow();
    expect(store.get('user', 1)).toBeDefined();
  });

  it('works without onMutation (no errors)', () => {
    const store = makeStore();
    expect(() => {
      store.upsert('user', { id: 1, name: 'Alice', version: 1 });
      store.remove('user', 1);
      store.clear();
    }).not.toThrow();
  });
});

// =============================================================================
// getPendingCount
// =============================================================================

describe('getPendingCount', () => {
  it('returns 0 when nothing is pending', () => {
    expect(getPendingCount()).toBe(0);
  });

  it('returns 0 after sync flush', () => {
    const store = makeStore();
    store.upsert('user', { id: 1, name: 'Alice', version: 1 });
    // In sync mode, flush happens immediately.
    expect(getPendingCount()).toBe(0);
  });

  it('returns >0 in manual mode before flush, 0 after', () => {
    setBatchMode('manual');
    const p = proxify({ x: 1 });
    p.x = 2;
    expect(getPendingCount()).toBeGreaterThan(0);

    flush();
    expect(getPendingCount()).toBe(0);
  });
});
