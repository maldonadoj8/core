// =============================================================================
// Tests — React: useQuery.ts
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { useState } from 'react';
import { render, act, cleanup, waitFor, screen } from '@testing-library/react';
import { useQuery } from '../../src/react/useQuery';
import { SilasError } from '../../src/core/errors';

afterEach(() => {
  cleanup();
});

function flushPromises() {
  return act(() => new Promise<void>(resolve => setTimeout(resolve, 0)));
}

describe('useQuery', () => {
  it('accepts callbacks that intentionally ignore the signal', () => {
    const query = () => Promise.resolve('data');
    let result: any;

    function Comp() {
      result = useQuery(query);
      return React.createElement('div');
    }

    render(React.createElement(Comp));
    expect(result.isLoading).toBe(true);
  });

  it('starts in loading state', () => {
    let result: any;
    function Comp() {
      result = useQuery(() => new Promise(() => {})); // never resolves
      return React.createElement('div', null, result.isLoading ? 'loading' : 'done');
    }

    render(React.createElement(Comp));
    expect(result.isLoading).toBe(true);
    expect(result.data).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it('resolves data on success', async () => {
    let result: any;
    function Comp() {
      result = useQuery(() => Promise.resolve({ id: 1, name: 'Alice' }));
      return React.createElement('div', null, result.data?.name ?? 'loading');
    }

    render(React.createElement(Comp));
    await flushPromises();

    expect(result.isLoading).toBe(false);
    expect(result.data).toEqual({ id: 1, name: 'Alice' });
    expect(result.error).toBeUndefined();
  });

  it('captures error on failure', async () => {
    let result: any;
    function Comp() {
      result = useQuery(() => Promise.reject(new Error('network error')));
      return React.createElement('div', null, result.error ? 'error' : 'ok');
    }

    render(React.createElement(Comp));
    await flushPromises();

    expect(result.isLoading).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.error).toBeInstanceOf(Error);
    expect((result.error as Error).message).toBe('network error');
  });

  it('re-runs when deps change', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');

    let result: any;
    let setId: any;
    function Comp() {
      const [id, _setId] = useState(1);
      setId = _setId;
      result = useQuery(() => fetchFn(id), [id]);
      return React.createElement('div', null, String(result.data ?? 'loading'));
    }

    render(React.createElement(Comp));
    await flushPromises();
    expect(result.data).toBe('first');
    expect(fetchFn).toHaveBeenCalledTimes(1);

    act(() => setId(2));
    await flushPromises();
    expect(result.data).toBe('second');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('handles race conditions (stale closures)', async () => {
    let resolvers: Array<(value: string) => void> = [];
    const fetchFn = vi.fn().mockImplementation(() => {
      return new Promise<string>(resolve => {
        resolvers.push(resolve);
      });
    });

    let result: any;
    let setId: any;
    function Comp() {
      const [id, _setId] = useState(1);
      setId = _setId;
      result = useQuery(() => fetchFn(id), [id]);
      return React.createElement('div', null, String(result.data ?? 'loading'));
    }

    render(React.createElement(Comp));

    // Trigger a second query before the first resolves.
    act(() => setId(2));

    // Resolve the second (newer) query first.
    await act(async () => resolvers[1]('second'));
    expect(result.data).toBe('second');

    // Resolve the first (stale) query — should be ignored.
    await act(async () => resolvers[0]('first'));
    expect(result.data).toBe('second'); // Still 'second', not 'first'.
  });

  it('passes a signal and aborts the superseded request', async () => {
    const signals: AbortSignal[] = [];
    const resolvers: Array<(value: string) => void> = [];
    const fetchFn = vi.fn((signal?: AbortSignal) => new Promise<string>(resolve => {
      signals.push(signal!);
      resolvers.push(resolve);
    }));
    let result: any;

    function Comp() {
      result = useQuery(fetchFn);
      return React.createElement('div');
    }

    render(React.createElement(Comp));
    act(() => { result.refetch(); });

    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);

    await act(async () => resolvers[1]('latest'));
    expect(result.data).toBe('latest');
  });

  it('ignores a pending result after the query is disabled', async () => {
    let resolveRequest!: (value: string) => void;
    let result: any;
    let setEnabled!: (value: boolean) => void;

    function Comp() {
      const [enabled, updateEnabled] = useState(true);
      setEnabled = updateEnabled;
      result = useQuery(() => new Promise<string>(resolve => { resolveRequest = resolve; }), [], { enabled });
      return React.createElement('div');
    }

    render(React.createElement(Comp));
    act(() => setEnabled(false));
    await act(async () => resolveRequest('stale'));

    expect(result.data).toBeUndefined();
    expect(result.isLoading).toBe(false);
  });

  it('aborts the pending request on unmount', () => {
    let signal!: AbortSignal;

    function Comp() {
      useQuery((currentSignal) => {
        signal = currentSignal!;
        return new Promise<string>(() => {});
      });
      return React.createElement('div');
    }

    const { unmount } = render(React.createElement(Comp));
    unmount();

    expect(signal.aborted).toBe(true);
  });

  it('enabled=false prevents execution', async () => {
    const fetchFn = vi.fn().mockResolvedValue('data');
    let result: any;

    function Comp() {
      result = useQuery(fetchFn, [], { enabled: false });
      return React.createElement('div', null, 'test');
    }

    render(React.createElement(Comp));
    await flushPromises();

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.isLoading).toBe(false);
    expect(result.data).toBeUndefined();
  });

  it('enabled toggling from false to true triggers execution', async () => {
    const fetchFn = vi.fn().mockResolvedValue('data');
    let result: any;
    let setEnabled: any;

    function Comp() {
      const [enabled, _setEnabled] = useState(false);
      setEnabled = _setEnabled;
      result = useQuery(fetchFn, [], { enabled });
      return React.createElement('div', null, 'test');
    }

    render(React.createElement(Comp));
    await flushPromises();
    expect(fetchFn).not.toHaveBeenCalled();

    act(() => setEnabled(true));
    await flushPromises();
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(result.data).toBe('data');
  });

  it('refetch re-executes the query', async () => {
    let callCount = 0;
    const fetchFn = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve(`call-${callCount}`);
    });

    let result: any;
    function Comp() {
      result = useQuery(fetchFn);
      return React.createElement('div', null, String(result.data ?? 'loading'));
    }

    render(React.createElement(Comp));
    await flushPromises();
    expect(result.data).toBe('call-1');

    await act(async () => {
      result.refetch();
    });
    await flushPromises();
    expect(result.data).toBe('call-2');
  });

  it('throws SilasError when fn is not a function', () => {
    function Comp() {
      useQuery(null as any);
      return React.createElement('div');
    }

    expect(() => render(React.createElement(Comp))).toThrow(SilasError);
  });
});
