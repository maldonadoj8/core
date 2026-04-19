// =============================================================================
// Tests — Schema resolver: prop-based, name-based, mixed, and validation
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { createStore, defineSchema, ChangeType } from '../../src/store/index';
import { setDefaultBatchMode as setBatchMode } from '../../src/core/batch';

beforeEach(() => {
  setBatchMode('sync');
});

// =============================================================================
// Schema — prop-based resolution
// =============================================================================

describe('Schema — prop-based resolution', () => {
  it('resolves tables by record property (numeric value)', () => {
    const schema = defineSchema({
      tables: {
        usuario: { key: 'id', resolverProp: 'id_entidad', resolverValue: 42 },
        adjunto: { key: 'id', resolverProp: 'id_entidad', resolverValue: 78 },
      },
    });

    expect(schema.resolveByProp({ id: 1, id_entidad: 42 })?.name).toBe('usuario');
    expect(schema.resolveByProp({ id: 2, id_entidad: 78 })?.name).toBe('adjunto');
    expect(schema.resolveByProp({ id: 3, id_entidad: 999 })).toBeUndefined();
  });

  it('resolves tables by record property (string value)', () => {
    const schema = defineSchema({
      tables: {
        notifEmail: { key: 'id', resolverProp: 'type', resolverValue: 'email' },
        notifSms:   { key: 'id', resolverProp: 'type', resolverValue: 'sms' },
      },
    });

    expect(schema.resolveByProp({ id: 1, type: 'email' })?.name).toBe('notifEmail');
    expect(schema.resolveByProp({ id: 2, type: 'sms' })?.name).toBe('notifSms');
    expect(schema.resolveByProp({ id: 3, type: 'push' })).toBeUndefined();
  });

  it('resolves tables by record property (boolean value)', () => {
    const schema = defineSchema({
      tables: {
        activo:   { key: 'id', resolverProp: 'active', resolverValue: true },
        inactivo: { key: 'id', resolverProp: 'active', resolverValue: false },
      },
    });

    expect(schema.resolveByProp({ id: 1, active: true })?.name).toBe('activo');
    expect(schema.resolveByProp({ id: 2, active: false })?.name).toBe('inactivo');
  });

  it('returns undefined when record lacks the resolver property', () => {
    const schema = defineSchema({
      tables: {
        usuario: { key: 'id', resolverProp: 'id_entidad', resolverValue: 42 },
      },
    });

    expect(schema.resolveByProp({ id: 1 })).toBeUndefined();
    expect(schema.resolveByProp({ id: 2, other_prop: 42 })).toBeUndefined();
  });

  it('tables with resolverProp are NOT in name-based resolution', () => {
    const schema = defineSchema({
      tables: {
        usuario: { key: 'id', resolverProp: 'id_entidad', resolverValue: 42 },
      },
    });

    // "usuario" as a response key should NOT resolve by name.
    expect(schema.resolveByName('usuario')).toBeUndefined();
  });

  it('hasPropResolvers() returns true when tables use resolverProp', () => {
    const schema = defineSchema({
      tables: {
        usuario: { key: 'id', resolverProp: 'id_entidad', resolverValue: 42 },
      },
    });
    expect(schema.hasPropResolvers()).toBe(true);
  });

  it('hasPropResolvers() returns false when no tables use resolverProp', () => {
    const schema = defineSchema({
      tables: {
        user: { key: 'id' },
      },
    });
    expect(schema.hasPropResolvers()).toBe(false);
  });
});

// =============================================================================
// Schema — mixed resolution
// =============================================================================

describe('Schema — mixed resolution (name + prop)', () => {
  it('handles both modes in the same schema', () => {
    const schema = defineSchema({
      tables: {
        deposito: { key: 'id' },
        usuario:  { key: 'id', resolverProp: 'id_entidad', resolverValue: 42 },
        adjunto:  { key: 'id', resolverProp: 'id_entidad', resolverValue: 78 },
      },
    });

    // Name-based.
    expect(schema.resolveByName('deposito')).toBeDefined();
    expect(schema.resolveByName('deposito')!.key).toBe('deposito');

    // Prop-based tables excluded from name resolution.
    expect(schema.resolveByName('usuario')).toBeUndefined();
    expect(schema.resolveByName('adjunto')).toBeUndefined();

    // Prop-based.
    expect(schema.resolveByProp({ id: 1, id_entidad: 42 })?.name).toBe('usuario');
    expect(schema.resolveByProp({ id: 2, id_entidad: 78 })?.name).toBe('adjunto');
  });
});

// =============================================================================
// Schema — validation
// =============================================================================

describe('Schema — validation', () => {
  it('throws when resolverProp is set without resolverValue', () => {
    expect(() => defineSchema({
      tables: { bad: { resolverProp: 'type' } },
    })).toThrow('resolverProp "type" requires resolverValue');
  });

  it('throws when resolverValue is set without resolverProp', () => {
    expect(() => defineSchema({
      tables: { bad: { resolverValue: 42 } as any },
    })).toThrow('resolverValue requires resolverProp');
  });

  it('throws on duplicate resolverProp + resolverValue pair', () => {
    expect(() => defineSchema({
      tables: {
        tableA: { key: 'id', resolverProp: 'type', resolverValue: 'foo' },
        tableB: { key: 'id', resolverProp: 'type', resolverValue: 'foo' },
      },
    })).toThrow('duplicate resolverProp "type" + resolverValue "foo"');
  });

  it('throws on duplicate external name across tables', () => {
    expect(() => defineSchema({
      tables: {
        tableA: { key: 'id', name: 'shared' },
        tableB: { key: 'id', name: 'shared' },
      },
    })).toThrow('external name "shared" is already registered by table "tableA"');
  });

  it('throws when a table name aliases another table internal key', () => {
    expect(() => defineSchema({
      tables: {
        users: { key: 'id' },
        people: { key: 'id', name: 'users' },
      },
    })).toThrow('external name "users" is already registered by table "users"');
  });
});

// =============================================================================
// Classify — prop-based
// =============================================================================

describe('Store.classify — prop-based resolution', () => {
  it('routes records by resolverProp + resolverValue', () => {
    const store = createStore({
      schema: defineSchema({
        tables: {
          usuario: { key: 'id', resolverProp: 'id_entidad', resolverValue: 42 },
          adjunto: { key: 'id', resolverProp: 'id_entidad', resolverValue: 78 },
        },
      }),
    });

    const result = store.classify({
      registro: [
        { id: 1, id_entidad: 42, nombre: 'Ana' },
        { id: 2, id_entidad: 78, url: 'foto.jpg' },
        { id: 3, id_entidad: 42, nombre: 'Luis' },
      ],
    });

    expect(result.summary.inserts).toBe(3);
    expect(result.tables).toContain('usuario');
    expect(result.tables).toContain('adjunto');

    expect(store.get('usuario', 1)!.nombre).toBe('Ana');
    expect(store.get('usuario', 3)!.nombre).toBe('Luis');
    expect(store.get('adjunto', 2)!.url).toBe('foto.jpg');
  });

  it('skips records that match no table when key is non-alphanumeric', () => {
    const store = createStore({
      schema: defineSchema({
        tables: {
          usuario: { key: 'id', resolverProp: 'id_entidad', resolverValue: 42 },
        },
      }),
    });

    // Use a non-alphanumeric key so the fallback doesn't kick in.
    const result = store.classify({
      'some-key!': [
        { id: 1, id_entidad: 42, nombre: 'Ana' },
        { id: 2, id_entidad: 999, nombre: 'Unknown' },
      ],
    });

    // Only the prop-matched record is classified.
    expect(result.summary.inserts).toBe(1);
    expect(store.get('usuario', 1)!.nombre).toBe('Ana');
  });

  it('unmatched records fall to alphanumeric key fallback', () => {
    const store = createStore({
      schema: defineSchema({
        tables: {
          usuario: { key: 'id', resolverProp: 'id_entidad', resolverValue: 42 },
        },
      }),
    });

    const result = store.classify({
      registro: [
        { id: 1, id_entidad: 42, nombre: 'Ana' },
        { id: 2, id_entidad: 999, nombre: 'Unknown' },
      ],
    });

    // Both get inserted: one to 'usuario' (prop), one to ad-hoc 'registro'.
    expect(result.summary.inserts).toBe(2);
    expect(store.get('usuario', 1)!.nombre).toBe('Ana');
    // id_entidad=999 doesn't match → falls to key fallback "registro".
    expect(store.get('registro', 2)!.nombre).toBe('Unknown');
  });

  it('handles string-based resolverProp', () => {
    const store = createStore({
      schema: defineSchema({
        tables: {
          notifEmail: { key: 'id', resolverProp: 'type', resolverValue: 'email' },
          notifSms:   { key: 'id', resolverProp: 'type', resolverValue: 'sms' },
        },
      }),
    });

    // Use non-alphanumeric key to avoid fallback for unmatched record.
    const result = store.classify({
      'data-source!': [
        { id: 1, type: 'email', subject: 'Hello' },
        { id: 2, type: 'sms', body: 'Hi' },
        { id: 3, type: 'push', body: 'Hey' },
      ],
    });

    // Only 2 matched; 'push' is skipped (key is non-alphanumeric).
    expect(result.summary.inserts).toBe(2);
    expect(store.get('notifEmail', 1)!.subject).toBe('Hello');
    expect(store.get('notifSms', 2)!.body).toBe('Hi');
  });
});

// =============================================================================
// Classify — mixed resolution
// =============================================================================

describe('Store.classify — mixed resolution', () => {
  it('handles name-based and prop-based tables in the same response', () => {
    const store = createStore({
      schema: defineSchema({
        tables: {
          deposito: { key: 'id' },
          usuario:  { key: 'id', resolverProp: 'id_entidad', resolverValue: 42 },
          adjunto:  { key: 'id', resolverProp: 'id_entidad', resolverValue: 78 },
        },
      }),
    });

    const result = store.classify({
      deposito: [
        { id: 100, monto: 500 },
      ],
      registro: [
        { id: 1, id_entidad: 42, nombre: 'Ana' },
        { id: 2, id_entidad: 78, url: 'doc.pdf' },
      ],
    });

    expect(result.summary.inserts).toBe(3);
    expect(store.get('deposito', 100)!.monto).toBe(500);
    expect(store.get('usuario', 1)!.nombre).toBe('Ana');
    expect(store.get('adjunto', 2)!.url).toBe('doc.pdf');
  });

  it('prop-based takes priority over name fallback for matching records', () => {
    const store = createStore({
      schema: defineSchema({
        tables: {
          usuario: { key: 'id', resolverProp: 'id_entidad', resolverValue: 42 },
          adjunto: { key: 'id', resolverProp: 'id_entidad', resolverValue: 78 },
        },
      }),
    });

    // Response key "random_key" doesn't match any table by name,
    // but records have id_entidad fields.
    const result = store.classify({
      random_key: [
        { id: 1, id_entidad: 42, nombre: 'Ana' },
        { id: 2, id_entidad: 78, url: 'foto.jpg' },
      ],
    });

    expect(result.summary.inserts).toBe(2);
    expect(store.get('usuario', 1)!.nombre).toBe('Ana');
    expect(store.get('adjunto', 2)!.url).toBe('foto.jpg');
  });

  it('records with matching resolverProp go to correct table even when key matches a different one', () => {
    // Edge: response key "deposito" exists as a name-based table,
    // but records have id_entidad → prop-based wins.
    const store = createStore({
      schema: defineSchema({
        tables: {
          deposito: { key: 'id' },
          usuario:  { key: 'id', resolverProp: 'id_entidad', resolverValue: 42 },
        },
      }),
    });

    store.classify({
      deposito: [
        { id: 1, id_entidad: 42, nombre: 'Ana' },
        { id: 2, monto: 100 },
      ],
    });

    // Record 1 has id_entidad=42 → goes to usuario (prop-based wins).
    expect(store.get('usuario', 1)!.nombre).toBe('Ana');
    // Record 2 has no id_entidad → falls back to name-based → deposito.
    expect(store.get('deposito', 2)!.monto).toBe(100);
  });

  it('soft-delete works with prop-based resolution', () => {
    const store = createStore({
      schema: defineSchema({
        tables: {
          entrega: {
            key: 'id',
            resolverProp: 'id_entidad',
            resolverValue: 31,
            softDelete: 'activo',
          },
        },
      }),
    });

    // Insert an active record.
    store.classify({
      registro: [{ id: 1, id_entidad: 31, titulo: 'Test', activo: true }],
    });
    expect(store.count('entrega')).toBe(1);

    // Soft-delete it.
    store.classify({
      registro: [{ id: 1, id_entidad: 31, titulo: 'Test', activo: false }],
    });
    expect(store.count('entrega')).toBe(0);
  });
});
