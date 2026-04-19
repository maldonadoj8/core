// =============================================================================
// Integration Tests — Paginated Flow
//
// End-to-end: create paginated view → addPage → external store mutation
// → view syncs → removeRecord → clear with callback.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act, cleanup } from '@testing-library/react';
import { createStore, defineSchema } from '../../src/store/index';
import { setDefaultBatchMode as setBatchMode } from '../../src/core/batch';
import { __resetSubscriptions } from '../../src/core/subscription';
import { __resetProxyId } from '../../src/core/proxy';
import { subscribe } from '../../src/core/subscription';
import { usePaginatedCollection } from '../../src/react/usePaginatedCollection';

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
        entrega: { key: 'id', version: 'version', softDelete: 'activo' },
      },
    }),
  });
}

describe('Integration: Paginated Flow', () => {
  it('full lifecycle: create → addPage → sync → removeRecord → clear', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');

    // 1. Add first page.
    pc.addPage(
      [
        { id: 1, version: 1, activo: true, nombre: 'A' },
        { id: 2, version: 1, activo: true, nombre: 'B' },
        { id: 3, version: 1, activo: true, nombre: 'C' },
      ],
      'descending',
    );
    expect(pc.proxy.count).toBe(3);
    expect(pc.proxy.cursorStart).toBe('1');
    expect(pc.proxy.cursorEnd).toBe('3');

    // 2. Add second page (ascending — prepend).
    pc.addPage(
      [
        { id: 4, version: 1, activo: true, nombre: 'D' },
        { id: 5, version: 1, activo: true, nombre: 'E' },
      ],
      'ascending',
    );
    expect(pc.proxy.count).toBe(5);
    expect(pc.proxy.cursorStart).toBe('4');

    // 3. External store mutation: soft-delete id=2 via classify.
    store.classify({
      entrega: [{ id: 2, version: 2, activo: false }],
    });
    expect(pc.proxy.count).toBe(4);
    expect(pc.proxy.items.map((r: any) => r.id)).not.toContain(2);

    // 4. Remove a record.
    pc.removeRecord(3);
    expect(pc.proxy.count).toBe(3);
    expect(store.get('entrega', 3)).toBeUndefined();

    // 5. Clear.
    pc.clear();
    expect(pc.proxy.count).toBe(0);
    expect(pc.proxy.cursorStart).toBeUndefined();
    expect(pc.proxy.cursorEnd).toBeUndefined();
  });

  it('paginated view syncs with external upsert (update)', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');

    pc.addPage(
      [{ id: 1, version: 1, activo: true, nombre: 'Original' }],
      'descending',
    );
    const record = store.get('entrega', 1)!;
    expect(record.nombre).toBe('Original');

    // External update via classify.
    store.classify({
      entrega: [{ id: 1, version: 2, activo: true, nombre: 'Updated' }],
    });

    // The record in the paginated view should reflect the update
    // (since it's the same proxy from the store).
    expect(record.nombre).toBe('Updated');
    expect(pc.proxy.count).toBe(1); // Still there — not soft-deleted.
  });

  it('multiple paginated views sync independently', () => {
    const store = makeStore();
    const pc1 = store.paginated('entrega');
    const pc2 = store.paginated('entrega');

    pc1.addPage([{ id: 1, version: 1, activo: true }], 'descending');
    pc2.addPage([{ id: 1, version: 1, activo: true }, { id: 2, version: 1, activo: true }], 'descending');

    expect(pc1.proxy.count).toBe(1);
    expect(pc2.proxy.count).toBe(2);

    // Soft-delete id=1 → both views should drop it.
    store.classify({
      entrega: [{ id: 1, version: 2, activo: false }],
    });
    expect(pc1.proxy.count).toBe(0);
    expect(pc2.proxy.count).toBe(1);
    expect(pc2.proxy.items.map((r: any) => r.id)).toEqual([2]);
  });

  it('dispose stops syncing with store', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');

    pc.addPage(
      [{ id: 1, version: 1, activo: true }],
      'descending',
    );
    store.disposePaginated(pc);

    // Soft-delete should NOT affect the disposed view.
    store.classify({
      entrega: [{ id: 1, version: 2, activo: false }],
    });
    expect(pc.proxy.count).toBe(1); // Frozen — no longer syncing.
  });

  it('setHasMore updates the flag', () => {
    const store = makeStore();
    const pc = store.paginated('entrega');
    expect(pc.proxy.hasMore).toBe(true);

    pc.addPage([{ id: 1, version: 1, activo: true }], 'descending');
    pc.setHasMore(false);
    expect(pc.proxy.hasMore).toBe(false);
  });
});
