// =============================================================================
// Tests — Store: classify.ts
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { createStore, defineSchema, ChangeType } from '../../src/store/index';
import { setDefaultBatchMode as setBatchMode } from '../../src/core/batch';
import { SilasError } from '../../src/core/errors';

beforeEach(() => {
  setBatchMode('sync');
});

function makeStore() {
  return createStore({
    schema: defineSchema({
      tables: {
        user: { key: 'id' },
        post: { key: 'id', softDelete: 'activo' },
      },
    }),
  });
}

describe('classifyData', () => {
  it('classifies records from a flat payload', () => {
    const store = makeStore();
    const result = store.classify({
      user: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
    });
    expect(store.count('user')).toBe(2);
    expect(result.summary.inserts).toBe(2);
    expect(result.tables).toContain('user');
  });

  it('handles single object (not array)', () => {
    const store = makeStore();
    store.classify({ user: { id: 1, name: 'Solo' } });
    expect(store.count('user')).toBe(1);
  });

  it('skips null records in array', () => {
    const store = makeStore();
    const result = store.classify({
      user: [null, { id: 1, name: 'Alice' }, null, undefined],
    });
    expect(store.count('user')).toBe(1);
    expect(result.summary.inserts).toBe(1);
  });

  it('skips non-object records', () => {
    const store = makeStore();
    const result = store.classify({
      user: [42, 'string', true, { id: 1, name: 'Valid' }],
    });
    expect(store.count('user')).toBe(1);
  });

  it('handles empty payload', () => {
    const store = makeStore();
    const result = store.classify({});
    expect(result.changes).toHaveLength(0);
    expect(result.summary.inserts).toBe(0);
    expect(result.tables).toHaveLength(0);
  });

  it('handles empty arrays', () => {
    const store = makeStore();
    const result = store.classify({ user: [] });
    expect(result.changes).toHaveLength(0);
  });

  it('handles mixed valid and invalid records', () => {
    const store = makeStore();
    const result = store.classify({
      user: [
        null,
        { id: 1, name: 'Alice' },
        undefined,
        { id: 2, name: 'Bob' },
        42,
      ],
    });
    expect(store.count('user')).toBe(2);
    expect(result.summary.inserts).toBe(2);
  });

  it('throws SilasError when data is not an object', () => {
    const store = makeStore();
    expect(() => store.classify(null as any)).toThrow(SilasError);
    expect(() => store.classify(undefined as any)).toThrow(SilasError);
    expect(() => store.classify([] as any)).toThrow(SilasError);
    expect(() => store.classify('string' as any)).toThrow(SilasError);
  });

  it('tracks updates correctly', () => {
    const store = makeStore();
    store.classify({ user: [{ id: 1, name: 'Alice' }] });

    const result = store.classify({ user: [{ id: 1, name: 'Alice V2' }] });
    expect(result.summary.updates).toBe(1);
    expect(store.get('user', 1)!.name).toBe('Alice V2');
  });

  it('tracks soft-deletes correctly', () => {
    const store = makeStore();
    store.classify({ post: [{ id: 1, title: 'Hello', activo: true }] });
    expect(store.count('post')).toBe(1);

    const result = store.classify({ post: [{ id: 1, title: 'Hello', activo: false }] });
    expect(result.summary.deletes).toBe(1);
    expect(store.count('post')).toBe(0);
  });

  it('classifies across multiple tables', () => {
    const store = makeStore();
    const result = store.classify({
      user: [{ id: 1, name: 'Alice' }],
      post: [{ id: 10, title: 'Hello', activo: true }],
    });
    expect(store.count('user')).toBe(1);
    expect(store.count('post')).toBe(1);
    expect(result.tables).toContain('user');
    expect(result.tables).toContain('post');
  });

  it('prop-based resolution routes records to correct tables', () => {
    const store = createStore({
      schema: defineSchema({
        tables: {
          entrega: { key: 'id', resolverProp: 'id_entidad', resolverValue: 31 },
          paquete: { key: 'id', resolverProp: 'id_entidad', resolverValue: 50 },
        },
      }),
    });

    store.classify({
      registro: [
        { id: 1, id_entidad: 31, titulo: 'Entrega A' },
        { id: 2, id_entidad: 50, peso: 1.2 },
        { id: 3, id_entidad: 31, titulo: 'Entrega B' },
      ],
    });

    expect(store.count('entrega')).toBe(2);
    expect(store.count('paquete')).toBe(1);
  });

  it('uses fallback key name for unregistered tables', () => {
    const store = makeStore();
    store.classify({
      unknown_table: [{ id: 1, data: 'test' }],
    });
    // Should have been inserted under the fallback key.
    expect(store.count('unknown_table')).toBe(1);
  });
});
