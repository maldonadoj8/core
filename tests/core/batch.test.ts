// =============================================================================
// Tests — Core: batch.ts
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { proxify } from '../../src/core/proxy';
import { subscribe } from '../../src/core/subscription';
import { batch, setDefaultBatchMode as setBatchMode } from '../../src/core/batch';
import { SilasError } from '../../src/core/errors';

describe('batch', () => {
  beforeEach(() => {
    setBatchMode('sync');
  });

  it('sync mode: each set triggers a notification immediately', () => {
    const obj = proxify({ a: 0, b: 0 });
    const cb = vi.fn();
    subscribe(obj, cb);

    obj.a = 1;
    obj.b = 2;
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('batch() groups multiple mutations into one notification', () => {
    const obj = proxify({ a: 0, b: 0 });
    const cb = vi.fn();
    subscribe(obj, cb);

    batch(() => {
      obj.a = 1;
      obj.b = 2;
    });
    expect(cb).toHaveBeenCalledOnce();
  });

  it('nested batch() calls only flush at the outermost level', () => {
    const obj = proxify({ x: 0 });
    const cb = vi.fn();
    subscribe(obj, cb);

    batch(() => {
      obj.x = 1;
      batch(() => {
        obj.x = 2;
      });
      // Inner batch should not have flushed yet.
      expect(cb).not.toHaveBeenCalled();
      obj.x = 3;
    });
    // Outer batch flush.
    expect(cb).toHaveBeenCalledOnce();
  });

  it('manual mode: changes only notify inside batch()', () => {
    setBatchMode('manual');
    const obj = proxify({ v: 0 });
    const cb = vi.fn();
    subscribe(obj, cb);

    obj.v = 1;
    obj.v = 2;
    obj.v = 3;
    expect(cb).not.toHaveBeenCalled();

    batch(() => {
      obj.v = 4;
    });
    expect(cb).toHaveBeenCalledOnce();
  });

  it('microtask mode: notifications arrive after microtask', async () => {
    setBatchMode('microtask');
    const obj = proxify({ v: 0 });
    const cb = vi.fn();
    subscribe(obj, cb);

    obj.v = 1;
    obj.v = 2;
    // Not yet notified.
    expect(cb).not.toHaveBeenCalled();

    // Wait for microtask.
    await Promise.resolve();
    expect(cb).toHaveBeenCalledOnce();
  });

  it('throws SilasError when called with a non-function argument', () => {
    expect(() => batch(null as any)).toThrow(SilasError);
    expect(() => batch(undefined as any)).toThrow(SilasError);
    expect(() => batch(42 as any)).toThrow(SilasError);
    expect(() => batch('string' as any)).toThrow(SilasError);
  });
});
