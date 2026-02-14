// =============================================================================
// Tests — Store: store.ts + schema + classify
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStore, defineSchema, ChangeType } from '../../src/store/index';
import { subscribe } from '../../src/core/subscription';
import { setDefaultBatchMode as setBatchMode } from '../../src/core/batch';

beforeEach(() => {
  setBatchMode('sync');
});

// =============================================================================
// Schema
// =============================================================================

describe('defineSchema', () => {
  it('creates a Schema with table configs', () => {
    const schema = defineSchema({
      tables: {
        user: { key: 'id' },
        post: { key: 'post_id', version: 'version' },
      },
    });
    expect(schema.hasTable('user')).toBe(true);
    expect(schema.hasTable('post')).toBe(true);
    expect(schema.hasTable('nope')).toBe(false);
    expect(schema.getKeyField('user')).toBe('id');
    expect(schema.getKeyField('post')).toBe('post_id');
  });

  it('resolves by resolverProp / resolverValue', () => {
    const schema = defineSchema({
      tables: {
        entrega: { key: 'id', resolverProp: 'id_entidad', resolverValue: 31 },
      },
    });
    const resolved = schema.resolveByProp({ id: 1, id_entidad: 31 });
    expect(resolved).toBeDefined();
    expect(resolved!.name).toBe('entrega');
  });

  it('resolves by name (alias)', () => {
    const schema = defineSchema({
      tables: {
        user: { key: 'id', name: 'usuario' },
      },
    });
    const resolved = schema.resolveByName('usuario');
    expect(resolved).toBeDefined();
    expect(resolved!.key).toBe('user');
  });
});

// =============================================================================
// Store CRUD
// =============================================================================

describe('Store', () => {
  function makeStore() {
    return createStore({
      schema: defineSchema({
        tables: {
          user:  { key: 'id', version: 'version' },
          post:  { key: 'id', softDelete: 'activo' },
          item:  { key: 'id' },
        },
      }),
    });
  }

  it('upsert inserts a new record and returns INSERT', () => {
    const store = makeStore();
    const result = store.upsert('user', { id: 1, name: 'Alice', version: 1 });
    expect(result.type).toBe(ChangeType.INSERT);
    expect(result.record).toBeDefined();
    expect(store.get('user', 1)!.name).toBe('Alice');
  });

  it('upsert updates an existing record with newer version', () => {
    const store = makeStore();
    store.upsert('user', { id: 1, name: 'Alice', version: 1 });
    const result = store.upsert('user', { id: 1, name: 'Alice V2', version: 2 });
    expect(result.type).toBe(ChangeType.UPDATE);
    expect(store.get('user', 1)!.name).toBe('Alice V2');
    expect(result.previous).toBeDefined();
    expect((result.previous as any).name).toBe('Alice');
  });

  it('upsert skips older version', () => {
    const store = makeStore();
    store.upsert('user', { id: 1, name: 'Alice', version: 5 });
    const result = store.upsert('user', { id: 1, name: 'Old Alice', version: 3 });
    expect(result.type).toBe(ChangeType.NONE);
    expect(store.get('user', 1)!.name).toBe('Alice'); // Unchanged.
  });

  it('upsert soft-deletes when record is inactive', () => {
    const store = makeStore();
    store.upsert('post', { id: 10, title: 'Hello', activo: true });
    expect(store.count('post')).toBe(1);

    const result = store.upsert('post', { id: 10, title: 'Hello', activo: false });
    expect(result.type).toBe(ChangeType.DELETE);
    expect(store.count('post')).toBe(0);
    expect(store.get('post', 10)).toBeUndefined();
  });

  it('remove deletes a record', () => {
    const store = makeStore();
    store.upsert('item', { id: 1, x: 1 });
    expect(store.count('item')).toBe(1);

    const result = store.remove('item', 1);
    expect(result).not.toBeNull();
    expect(result!.type).toBe(ChangeType.DELETE);
    expect(store.count('item')).toBe(0);
  });

  it('all() returns all records', () => {
    const store = makeStore();
    store.upsert('user', { id: 1, name: 'A', version: 1 });
    store.upsert('user', { id: 2, name: 'B', version: 1 });
    store.upsert('user', { id: 3, name: 'C', version: 1 });
    expect(store.all('user')).toHaveLength(3);
  });

  it('filter() filters records by predicate', () => {
    const store = makeStore();
    store.upsert('user', { id: 1, name: 'Alice', version: 1 });
    store.upsert('user', { id: 2, name: 'Bob', version: 1 });
    store.upsert('user', { id: 3, name: 'Alice Jr', version: 1 });

    const alices = store.filter('user', (u: any) => u.name.startsWith('Alice'));
    expect(alices).toHaveLength(2);
  });

  it('find() finds the first matching record', () => {
    const store = makeStore();
    store.upsert('user', { id: 1, name: 'Alice', version: 1 });
    store.upsert('user', { id: 2, name: 'Bob', version: 1 });

    const bob = store.find('user', (u: any) => u.name === 'Bob');
    expect(bob).toBeDefined();
    expect(bob!.name).toBe('Bob');
  });

  it('clear() removes all records from a table', () => {
    const store = makeStore();
    store.upsert('user', { id: 1, name: 'A', version: 1 });
    store.upsert('user', { id: 2, name: 'B', version: 1 });
    store.clear('user');
    expect(store.count('user')).toBe(0);
  });

  it('clear() with no args removes all tables', () => {
    const store = makeStore();
    store.upsert('user', { id: 1, name: 'A', version: 1 });
    store.upsert('item', { id: 1, x: 1 });
    store.clear();
    expect(store.count('user')).toBe(0);
    expect(store.count('item')).toBe(0);
  });
});

// =============================================================================
// Collection observability
// =============================================================================

describe('Store collection', () => {
  it('collection reflects current records', () => {
    setBatchMode('sync');
    const store = createStore({
      schema: defineSchema({ tables: { user: { key: 'id' } } }),
    });

    store.upsert('user', { id: 1, name: 'Alice' });
    store.upsert('user', { id: 2, name: 'Bob' });

    const col = store.collection('user');
    expect(col.proxy.count).toBe(2);
    expect(col.proxy.items).toHaveLength(2);
  });

  it('collection updates on insert', () => {
    const store = createStore({
      schema: defineSchema({ tables: { user: { key: 'id' } } }),
    });
    const col = store.collection('user');
    expect(col.proxy.count).toBe(0);

    store.upsert('user', { id: 1, name: 'Alice' });
    expect(col.proxy.count).toBe(1);
  });
});

// =============================================================================
// Classify
// =============================================================================

describe('Store.classify', () => {
  it('classifies a payload into multiple tables', () => {
    const store = createStore({
      schema: defineSchema({
        tables: {
          user: { key: 'id' },
          post: { key: 'id' },
        },
      }),
    });

    const result = store.classify({
      user: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ],
      post: [
        { id: 10, title: 'Hello' },
      ],
    });

    expect(store.count('user')).toBe(2);
    expect(store.count('post')).toBe(1);
    expect(result.summary.inserts).toBe(3);
    expect(result.tables).toContain('user');
    expect(result.tables).toContain('post');
  });

  it('classifies by resolverProp', () => {
    const store = createStore({
      schema: defineSchema({
        tables: {
          entrega: { key: 'id', resolverProp: 'id_entidad', resolverValue: 31 },
        },
      }),
    });

    store.classify({
      registro: [{ id: 1, id_entidad: 31, estado: 'pendiente' }],
    });

    expect(store.count('entrega')).toBe(1);
    expect(store.get('entrega', 1)!.estado).toBe('pendiente');
  });

  it('classify handles single object (not array)', () => {
    const store = createStore({
      schema: defineSchema({ tables: { user: { key: 'id' } } }),
    });

    store.classify({
      user: { id: 1, name: 'Solo' },
    });

    expect(store.count('user')).toBe(1);
  });
});

// =============================================================================
// Reactivity integration
// =============================================================================

describe('Store reactivity', () => {
  it('subscribing to a store record reflects updates', () => {
    const store = createStore({
      schema: defineSchema({ tables: { user: { key: 'id', version: 'v' } } }),
    });

    store.upsert('user', { id: 1, name: 'A', v: 1 });
    const record = store.get('user', 1)!;

    const cb = vi.fn();
    subscribe(record, cb);

    store.upsert('user', { id: 1, name: 'B', v: 2 });
    expect(cb).toHaveBeenCalled();
    expect(record.name).toBe('B');
  });
});
