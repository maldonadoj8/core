// =============================================================================
// Tests — Core: proxy.ts
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { proxify, isProxy } from '../../src/core/proxy';
import { subscribe } from '../../src/core/subscription';
import { batch, setDefaultBatchMode as setBatchMode } from '../../src/core/batch';
import { SilasError } from '../../src/core/errors';

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

  it('throws SilasError when target is null', () => {
    expect(() => proxify(null as any)).toThrow(SilasError);
  });

  it('throws SilasError when target is undefined', () => {
    expect(() => proxify(undefined as any)).toThrow(SilasError);
  });

  it('throws SilasError when target is a primitive', () => {
    expect(() => proxify(42 as any)).toThrow(SilasError);
    expect(() => proxify('string' as any)).toThrow(SilasError);
  });

  it('does not double-proxify', () => {
    const obj = proxify({ x: 1 });
    const double = proxify(obj);
    expect((obj as any).__proxy_id).toBe((double as any).__proxy_id);
  });

  it('blocks __proto__ set (prototype pollution)', () => {
    const obj = proxify<Record<string, unknown>>({ x: 1 });
    expect(() => { (obj as any)['__proto__'] = {}; }).toThrow(SilasError);
  });

  it('blocks constructor set (prototype pollution)', () => {
    const obj = proxify<Record<string, unknown>>({ x: 1 });
    expect(() => { (obj as any).constructor = {}; }).toThrow(SilasError);
  });

  it('blocks prototype set (prototype pollution)', () => {
    const obj = proxify<Record<string, unknown>>({ x: 1 });
    expect(() => { (obj as any).prototype = {}; }).toThrow(SilasError);
  });

  it('blocks delete of reserved properties', () => {
    const obj = proxify<Record<string, unknown>>({ x: 1 });
    expect(() => { delete (obj as any).constructor; }).toThrow(SilasError);
    expect(() => { delete (obj as any).prototype; }).toThrow(SilasError);
  });

  it('deep mode throws on excessive nesting depth', () => {
    // Build a deeply nested object that exceeds MAX_DEEP_DEPTH (50).
    let nested: any = { value: 'leaf' };
    for (let i = 0; i < 55; i++) {
      nested = { child: nested };
    }
    const obj = proxify(nested, { deep: true });
    // Traversing deep enough should throw.
    expect(() => {
      let cursor: any = obj;
      for (let i = 0; i < 55; i++) {
        cursor = cursor.child;
      }
    }).toThrow(SilasError);
  });

  it('supports Symbol property keys', () => {
    const sym = Symbol('test');
    const obj = proxify<Record<string | symbol, unknown>>({ [sym]: 'value' });
    expect(obj[sym]).toBe('value');
  });

  it('notifies on Symbol key mutation', () => {
    const sym = Symbol('key');
    const obj = proxify<Record<string | symbol, unknown>>({ [sym]: 0 });
    const cb = vi.fn();
    subscribe(obj, cb);
    obj[sym] = 1;
    expect(cb).toHaveBeenCalledOnce();
  });

  it('__source replacement notifies only once', () => {
    const obj = proxify({ a: 1, b: 2 });
    const cb = vi.fn();
    subscribe(obj, cb);
    (obj as any).__source = { a: 10, b: 20, c: 30 };
    expect(cb).toHaveBeenCalledOnce();
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
