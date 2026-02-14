// =============================================================================
// Tests — Core: proxy.ts
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { proxify, isProxy } from '../../src/core/proxy';
import { subscribe } from '../../src/core/subscription';
import { batch, setDefaultBatchMode as setBatchMode } from '../../src/core/batch';

// Use sync mode so notifications are immediate (easier to test).
beforeEach(() => {
  setBatchMode('sync');
});

describe('proxify', () => {
  it('creates a reactive proxy from a plain object', () => {
    const obj = proxify({ name: 'Alice', age: 30 });
    expect(obj.name).toBe('Alice');
    expect(obj.age).toBe(30);
  });

  it('supports setting properties', () => {
    const obj = proxify({ count: 0 });
    obj.count = 5;
    expect(obj.count).toBe(5);
  });

  it('supports deleting properties', () => {
    const obj = proxify<Record<string, unknown>>({ a: 1, b: 2 });
    delete obj.b;
    expect(obj.b).toBeUndefined();
    expect('b' in obj).toBe(false);
  });

  it('exposes __proxy_id as a unique number', () => {
    const a = proxify({ x: 1 });
    const b = proxify({ x: 1 });
    expect(typeof (a as any).__proxy_id).toBe('string');
    expect((a as any).__proxy_id).not.toBe((b as any).__proxy_id);
  });

  it('exposes __is_proxy as true', () => {
    const obj = proxify({ x: 1 });
    expect((obj as any).__is_proxy).toBe(true);
  });

  it('exposes __source returning the raw target data', () => {
    const raw = { x: 1, y: 2 };
    const obj = proxify(raw);
    const src = (obj as any).__source;
    expect(src).toBeDefined();
    expect(src.x).toBe(1);
  });

  it('atomic __source replacement updates all properties', () => {
    const obj = proxify<Record<string, unknown>>({ a: 1, b: 2, c: 3 });
    (obj as any).__source = { a: 10, d: 4 };
    expect(obj.a).toBe(10);
    expect(obj.b).toBeUndefined();
    expect(obj.c).toBeUndefined();
    expect((obj as any).d).toBe(4);
  });

  it('equality guard: same value does not trigger notification', () => {
    const obj = proxify({ count: 5 });
    const cb = vi.fn();
    subscribe(obj, cb);
    obj.count = 5; // Same value.
    expect(cb).not.toHaveBeenCalled();
  });

  it('notifies subscribers on property change', () => {
    const obj = proxify({ name: 'A' });
    const cb = vi.fn();
    subscribe(obj, cb);
    obj.name = 'B';
    expect(cb).toHaveBeenCalledOnce();
  });

  it('deep mode proxifies nested objects lazily', () => {
    const obj = proxify({ nested: { value: 1 } }, { deep: true });
    const nested = obj.nested;
    expect(isProxy(nested)).toBe(true);
    expect(nested.value).toBe(1);
  });
});

describe('isProxy', () => {
  it('returns true for proxified objects', () => {
    expect(isProxy(proxify({}))).toBe(true);
  });

  it('returns false for plain objects', () => {
    expect(isProxy({})).toBe(false);
    expect(isProxy(null as any)).toBe(false);
    expect(isProxy(42 as any)).toBe(false);
  });
});
