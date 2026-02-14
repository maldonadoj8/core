// =============================================================================
// Tests — Core: subscription.ts
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { proxify } from '../../src/core/proxy';
import { subscribe, unsubscribe, getTrackedProps } from '../../src/core/subscription';
import { setDefaultBatchMode as setBatchMode } from '../../src/core/batch';

beforeEach(() => {
  setBatchMode('sync');
});

describe('subscribe / unsubscribe', () => {
  it('basic subscription receives notifications', () => {
    const obj = proxify({ value: 0 });
    const cb = vi.fn();
    subscribe(obj, cb);
    obj.value = 1;
    expect(cb).toHaveBeenCalledOnce();
  });

  it('multiple subscribers all receive notifications', () => {
    const obj = proxify({ x: 0 });
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    subscribe(obj, cb1);
    subscribe(obj, cb2);
    obj.x = 1;
    expect(cb1).toHaveBeenCalledOnce();
    expect(cb2).toHaveBeenCalledOnce();
  });

  it('unsubscribe stops notifications', () => {
    const obj = proxify({ x: 0 });
    const cb = vi.fn();
    const sub = subscribe(obj, cb);
    obj.x = 1;
    expect(cb).toHaveBeenCalledOnce();

    sub.unsubscribe();
    obj.x = 2;
    expect(cb).toHaveBeenCalledOnce(); // No additional call.
  });

  it('unsubscribe by ticket ID', () => {
    const obj = proxify({ x: 0 });
    const cb = vi.fn();
    const sub = subscribe(obj, cb);
    obj.x = 1;
    expect(cb).toHaveBeenCalledOnce();

    unsubscribe(sub.ticket);
    obj.x = 2;
    expect(cb).toHaveBeenCalledOnce();
  });

  it('once option auto-unsubscribes after first notification', () => {
    const obj = proxify({ x: 0 });
    const cb = vi.fn();
    subscribe(obj, cb, { once: true });
    obj.x = 1;
    expect(cb).toHaveBeenCalledOnce();
    obj.x = 2;
    expect(cb).toHaveBeenCalledOnce(); // Still once.
  });

  it('immediate option calls callback on subscribe', () => {
    const obj = proxify({ x: 42 });
    const cb = vi.fn();
    subscribe(obj, cb, { immediate: true });
    expect(cb).toHaveBeenCalledOnce();
  });

  it('idempotent unsubscribe does not throw', () => {
    const obj = proxify({ x: 0 });
    const sub = subscribe(obj, vi.fn());
    sub.unsubscribe();
    sub.unsubscribe(); // Should not throw.
    sub.unsubscribe();
  });

  it('error in one callback does not break others', () => {
    const obj = proxify({ x: 0 });
    const cb1 = vi.fn(() => { throw new Error('boom'); });
    const cb2 = vi.fn();
    subscribe(obj, cb1);
    subscribe(obj, cb2);
    obj.x = 1;
    expect(cb1).toHaveBeenCalledOnce();
    expect(cb2).toHaveBeenCalledOnce(); // Still called despite cb1 throwing.
  });
});

// =============================================================================
// Property-level tracking (sub.track)
// =============================================================================

describe('sub.track — property-level granularity', () => {
  it('track(fn) records properties read inside fn', () => {
    const obj = proxify({ name: 'Alice', email: 'a@b.com', age: 30 });
    const sub = subscribe(obj, vi.fn());

    sub.track(() => {
      // Read name and age — but not email.
      void obj.name;
      void obj.age;
    });

    const tracked = getTrackedProps(sub.ticket);
    expect(tracked).toBeDefined();
    expect(tracked!.has('name')).toBe(true);
    expect(tracked!.has('age')).toBe(true);
    expect(tracked!.has('email')).toBe(false);
  });

  it('only notifies when a tracked property changes', () => {
    const obj = proxify({ name: 'Alice', email: 'a@b.com' });
    const cb = vi.fn();
    const sub = subscribe(obj, cb);

    // Track only 'name'.
    sub.track(() => { void obj.name; });

    // Mutate 'email' — should NOT notify.
    obj.email = 'new@b.com';
    expect(cb).not.toHaveBeenCalled();

    // Mutate 'name' — should notify.
    obj.name = 'Bob';
    expect(cb).toHaveBeenCalledOnce();
  });

  it('without tracking, subscription is notified on any change', () => {
    const obj = proxify({ a: 1, b: 2 });
    const cb = vi.fn();
    subscribe(obj, cb);

    obj.a = 10;
    expect(cb).toHaveBeenCalledOnce();

    obj.b = 20;
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('track() resets tracked props on each call', () => {
    const obj = proxify({ name: 'Alice', email: 'a@b.com', age: 30 });
    const cb = vi.fn();
    const sub = subscribe(obj, cb);

    // First tracking window: read name and email.
    sub.track(() => {
      void obj.name;
      void obj.email;
    });

    // Second tracking window: only read age.
    sub.track(() => {
      void obj.age;
    });

    const tracked = getTrackedProps(sub.ticket);
    expect(tracked!.has('age')).toBe(true);
    expect(tracked!.has('name')).toBe(false);
    expect(tracked!.has('email')).toBe(false);

    // Verify: mutating name should NOT notify (no longer tracked).
    obj.name = 'Bob';
    expect(cb).not.toHaveBeenCalled();

    // Mutating age should notify.
    obj.age = 31;
    expect(cb).toHaveBeenCalledOnce();
  });

  it('track() returns the value from fn', () => {
    const obj = proxify({ x: 42 });
    const sub = subscribe(obj, vi.fn());

    const result = sub.track(() => obj.x + 1);
    expect(result).toBe(43);
  });

  it('nested track() calls do not contaminate each other', () => {
    const obj = proxify({ a: 1, b: 2, c: 3 });
    const cbOuter = vi.fn();
    const cbInner = vi.fn();
    const subOuter = subscribe(obj, cbOuter);
    const subInner = subscribe(obj, cbInner);

    subOuter.track(() => {
      void obj.a; // outer reads 'a'

      // Nested: inner reads 'b' only.
      subInner.track(() => {
        void obj.b;
      });

      void obj.c; // outer also reads 'c'
    });

    // Outer should track 'a' and 'c' (not 'b').
    const outerProps = getTrackedProps(subOuter.ticket);
    expect(outerProps!.has('a')).toBe(true);
    expect(outerProps!.has('c')).toBe(true);
    expect(outerProps!.has('b')).toBe(false);

    // Inner should track 'b' only.
    const innerProps = getTrackedProps(subInner.ticket);
    expect(innerProps!.has('b')).toBe(true);
    expect(innerProps!.has('a')).toBe(false);
    expect(innerProps!.has('c')).toBe(false);

    // Verify notification: mutate 'b' → only inner notified.
    obj.b = 20;
    expect(cbOuter).not.toHaveBeenCalled();
    expect(cbInner).toHaveBeenCalledOnce();

    // Mutate 'a' → only outer notified.
    obj.a = 10;
    expect(cbOuter).toHaveBeenCalledOnce();
    expect(cbInner).toHaveBeenCalledOnce(); // still 1, not 2
  });

  it('tracked props are cleaned up on unsubscribe', () => {
    const obj = proxify({ x: 1 });
    const sub = subscribe(obj, vi.fn());
    sub.track(() => { void obj.x; });

    expect(getTrackedProps(sub.ticket)).toBeDefined();

    sub.unsubscribe();

    expect(getTrackedProps(sub.ticket)).toBeUndefined();
  });

  it('subscription with empty tracking window is notified on all changes', () => {
    const obj = proxify({ a: 1, b: 2 });
    const cb = vi.fn();
    const sub = subscribe(obj, cb);

    // Track window that reads nothing (e.g., early return).
    sub.track(() => { /* nothing */ });

    // Empty tracked set → the flush logic does NOT filter → notify on all.
    // (tracked.size === 0 means "not filtering", same as no tracking)
    obj.a = 10;
    expect(cb).toHaveBeenCalledOnce();
  });
});
