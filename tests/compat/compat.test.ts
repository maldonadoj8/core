// =============================================================================
// Tests — Compat: obs.js compatibility layer
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Obs, {
  proxify,
  sub,
  desub,
  al_editar,
  SUBS,
  OBJ_TICKETS,
} from '../../src/compat/index';

describe('compat layer', () => {
  it('proxify creates a reactive proxy', () => {
    const obj = proxify({ name: 'Alice' });
    expect((obj as any).__is_proxy).toBe(true);
    expect(obj.name).toBe('Alice');
  });

  it('proxify allows mutations', () => {
    const obj = proxify({ count: 0 });
    obj.count = 5;
    expect(obj.count).toBe(5);
  });

  it('sub() returns a numeric ticket', () => {
    const obj = proxify({ x: 1 });
    const ticket = sub(obj, vi.fn());
    expect(typeof ticket).toBe('number');
  });

  it('sub() stores entry in SUBS', () => {
    const obj = proxify({ x: 1 });
    const cb = vi.fn();
    const ticket = sub(obj, cb, 'test-task');

    expect(SUBS[ticket]).toBeDefined();
    expect(SUBS[ticket].tarea).toBe('test-task');
    expect(SUBS[ticket].obj).toBe(obj);
  });

  it('sub() stores ticket in OBJ_TICKETS', () => {
    const obj = proxify({ x: 1 });
    const proxyId = (obj as any).__proxy_id;
    const ticket = sub(obj, vi.fn());

    expect(OBJ_TICKETS[proxyId]).toBeDefined();
    expect(OBJ_TICKETS[proxyId].has(ticket)).toBe(true);
  });

  it('sub() callback is invoked on mutation', () => {
    const obj = proxify({ value: 0 });
    const cb = vi.fn();
    sub(obj, cb);

    obj.value = 1;
    expect(cb).toHaveBeenCalledOnce();
  });

  it('desub() removes the subscription', () => {
    const obj = proxify({ value: 0 });
    const cb = vi.fn();
    const ticket = sub(obj, cb);

    desub(ticket);

    obj.value = 1;
    expect(cb).not.toHaveBeenCalled();
  });

  it('desub() cleans up SUBS', () => {
    const obj = proxify({ x: 1 });
    const ticket = sub(obj, vi.fn());
    expect(SUBS[ticket]).toBeDefined();

    desub(ticket);
    expect(SUBS[ticket]).toBeUndefined();
  });

  it('desub() cleans up OBJ_TICKETS', () => {
    const obj = proxify({ x: 1 });
    const proxyId = (obj as any).__proxy_id;
    const ticket = sub(obj, vi.fn());

    desub(ticket);
    // Either the set is gone or empty.
    expect(OBJ_TICKETS[proxyId]).toBeUndefined();
  });

  it('desub() is a no-op for unknown ticket', () => {
    expect(() => desub(99999)).not.toThrow();
  });

  it('autoeliminar (once) auto-unsubscribes after first notification', () => {
    const obj = proxify({ x: 0 });
    const cb = vi.fn();
    sub(obj, cb, '', true);

    obj.x = 1;
    expect(cb).toHaveBeenCalledOnce();

    obj.x = 2;
    expect(cb).toHaveBeenCalledOnce(); // Still once.
  });

  it('pre_ejecutar (immediate) invokes callback on subscribe', () => {
    const obj = proxify({ x: 42 });
    const cb = vi.fn();
    sub(obj, cb, '', false, true);

    expect(cb).toHaveBeenCalledOnce();
  });

  it('al_editar() does not throw', () => {
    const obj = proxify({ x: 1 });
    expect(() => al_editar(obj)).not.toThrow();
  });

  it('multiple subscriptions on the same object', () => {
    const obj = proxify({ x: 0 });
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const t1 = sub(obj, cb1);
    const t2 = sub(obj, cb2);

    obj.x = 1;
    expect(cb1).toHaveBeenCalledOnce();
    expect(cb2).toHaveBeenCalledOnce();

    desub(t1);
    obj.x = 2;
    expect(cb1).toHaveBeenCalledOnce();
    expect(cb2).toHaveBeenCalledTimes(2);
  });

  it('default export has the expected shape', () => {
    expect(Obs.proxify).toBe(proxify);
    expect(Obs.sub).toBe(sub);
    expect(Obs.desub).toBe(desub);
    expect(Obs.al_editar).toBe(al_editar);
    expect(Obs.SUBS).toBe(SUBS);
    expect(Obs.OBJ_TICKETS).toBe(OBJ_TICKETS);
  });
});
