// =============================================================================
// Tests — React: useMutation.ts
// =============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, act, cleanup } from '@testing-library/react';
import { useMutation } from '../../src/react/useMutation';
import { SilasError } from '../../src/core/errors';

afterEach(() => {
  cleanup();
});

function flushPromises() {
  return act(() => new Promise<void>(resolve => setTimeout(resolve, 0)));
}

describe('useMutation', () => {
  it('starts in idle state', () => {
    let result: any;
    function Comp() {
      result = useMutation(() => Promise.resolve('ok'));
      return React.createElement('div');
    }

    render(React.createElement(Comp));
    expect(result.isLoading).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it('mutate() triggers the mutation and tracks state', async () => {
    let result: any;
    function Comp() {
      result = useMutation((name: string) => Promise.resolve({ name }));
      return React.createElement('div');
    }

    render(React.createElement(Comp));

    await act(async () => {
      result.mutate('Alice');
    });
    await flushPromises();

    expect(result.data).toEqual({ name: 'Alice' });
    expect(result.isLoading).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it('mutateAsync() returns a promise with the result', async () => {
    let result: any;
    let asyncResult: any;
    function Comp() {
      result = useMutation((x: number) => Promise.resolve(x * 2));
      return React.createElement('div');
    }

    render(React.createElement(Comp));

    await act(async () => {
      asyncResult = await result.mutateAsync(5);
    });

    expect(asyncResult).toBe(10);
    expect(result.data).toBe(10);
  });

  it('captures error state on failure', async () => {
    let result: any;
    function Comp() {
      result = useMutation(() => Promise.reject(new Error('fail')));
      return React.createElement('div');
    }

    render(React.createElement(Comp));

    await act(async () => {
      result.mutate('anything');
    });
    await flushPromises();

    expect(result.isLoading).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    expect((result.error as Error).message).toBe('fail');
  });

  it('mutateAsync() rejects on failure', async () => {
    let result: any;
    function Comp() {
      result = useMutation(() => Promise.reject(new Error('boom')));
      return React.createElement('div');
    }

    render(React.createElement(Comp));

    await expect(
      act(() => result.mutateAsync('anything')),
    ).rejects.toThrow('boom');
  });

  it('calls onSuccess callback', async () => {
    const onSuccess = vi.fn();
    let result: any;
    function Comp() {
      result = useMutation(
        (name: string) => Promise.resolve({ name }),
        { onSuccess },
      );
      return React.createElement('div');
    }

    render(React.createElement(Comp));

    await act(async () => {
      result.mutate('Alice');
    });
    await flushPromises();

    expect(onSuccess).toHaveBeenCalledWith({ name: 'Alice' }, 'Alice');
  });

  it('calls onError callback', async () => {
    const onError = vi.fn();
    let result: any;
    function Comp() {
      result = useMutation(
        () => Promise.reject(new Error('oops')),
        { onError },
      );
      return React.createElement('div');
    }

    render(React.createElement(Comp));

    await act(async () => {
      result.mutate('input');
    });
    await flushPromises();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][1]).toBe('input');
  });

  it('calls onSettled on success', async () => {
    const onSettled = vi.fn();
    let result: any;
    function Comp() {
      result = useMutation(
        (x: number) => Promise.resolve(x),
        { onSettled },
      );
      return React.createElement('div');
    }

    render(React.createElement(Comp));

    await act(async () => {
      result.mutate(42);
    });
    await flushPromises();

    expect(onSettled).toHaveBeenCalledWith(42, undefined, 42);
  });

  it('calls onSettled on error', async () => {
    const onSettled = vi.fn();
    let result: any;
    function Comp() {
      result = useMutation(
        () => Promise.reject(new Error('err')),
        { onSettled },
      );
      return React.createElement('div');
    }

    render(React.createElement(Comp));

    await act(async () => {
      result.mutate('input');
    });
    await flushPromises();

    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled.mock.calls[0][0]).toBeUndefined();
    expect(onSettled.mock.calls[0][1]).toBeInstanceOf(Error);
    expect(onSettled.mock.calls[0][2]).toBe('input');
  });

  it('reset() clears state', async () => {
    let result: any;
    function Comp() {
      result = useMutation((x: string) => Promise.resolve(x));
      return React.createElement('div');
    }

    render(React.createElement(Comp));

    await act(async () => {
      result.mutate('data');
    });
    await flushPromises();
    expect(result.data).toBe('data');

    act(() => {
      result.reset();
    });

    expect(result.data).toBeUndefined();
    expect(result.error).toBeUndefined();
    expect(result.isLoading).toBe(false);
  });

  it('throws SilasError when fn is not a function', () => {
    function Comp() {
      useMutation(null as any);
      return React.createElement('div');
    }

    expect(() => render(React.createElement(Comp))).toThrow(SilasError);
  });
});
