// =============================================================================
// Tests — React: useProxy.ts
//
// Verifies that useProxy provides property-level tracking:
//   - Only re-renders when properties read during render change.
//   - Returns a plain snapshot, not the proxy.
//   - Handles proxy identity changes.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act, cleanup } from '@testing-library/react';
import { proxify } from '../../src/core/proxy';
import { setDefaultBatchMode as setBatchMode, flush } from '../../src/core/batch';
import { __resetSubscriptions } from '../../src/core/subscription';
import { __resetProxyId } from '../../src/core/proxy';
import { useProxy } from '../../src/react/useProxy';

beforeEach(() => {
  // Use sync mode so mutations flush immediately in tests.
  setBatchMode('sync');
  __resetSubscriptions();
  __resetProxyId();
});

afterEach(() => {
  cleanup();
});

// Helper: a component that reads specific props and counts renders.
function createTestComponent(readProps: string[]) {
  const renderCount = { value: 0 };
  const lastSnap = { value: null as any };

  function TestComponent({ proxy }: { proxy: any }) {
    const snap = useProxy(proxy);
    renderCount.value++;
    lastSnap.value = snap;

    // Only read the specified properties.
    const values = readProps.map((p) => (snap as any)[p]);

    return React.createElement('div', { 'data-testid': 'output' }, values.join(', '));
  }

  return { TestComponent, renderCount, lastSnap };
}

describe('useProxy — property-level tracking', () => {
  it('re-renders when a read property changes', () => {
    const proxy = proxify({ name: 'Alice', email: 'alice@test.com' });
    const { TestComponent, renderCount } = createTestComponent(['name']);

    render(React.createElement(TestComponent, { proxy }));
    expect(renderCount.value).toBe(1);

    // Mutate the read property → should re-render.
    act(() => {
      proxy.name = 'Bob';
    });
    expect(renderCount.value).toBe(2);
  });

  it('does NOT re-render when an unread property changes', () => {
    const proxy = proxify({ name: 'Alice', email: 'alice@test.com' });
    const { TestComponent, renderCount } = createTestComponent(['name']);

    render(React.createElement(TestComponent, { proxy }));
    expect(renderCount.value).toBe(1);

    // Mutate email (not read) → should NOT re-render.
    act(() => {
      proxy.email = 'new@test.com';
    });
    expect(renderCount.value).toBe(1);
  });

  it('re-renders only for relevant property among multiple read props', () => {
    const proxy = proxify({ name: 'Alice', age: 30, email: 'a@b.com' });
    const { TestComponent, renderCount } = createTestComponent(['name', 'age']);

    render(React.createElement(TestComponent, { proxy }));
    expect(renderCount.value).toBe(1);

    // Mutate email (unread) → no re-render.
    act(() => {
      proxy.email = 'new@b.com';
    });
    expect(renderCount.value).toBe(1);

    // Mutate age (read) → re-render.
    act(() => {
      proxy.age = 31;
    });
    expect(renderCount.value).toBe(2);

    // Mutate name (read) → re-render.
    act(() => {
      proxy.name = 'Bob';
    });
    expect(renderCount.value).toBe(3);
  });

  it('returns a plain snapshot, not the proxy', () => {
    const proxy = proxify({ x: 1 });
    const { TestComponent, lastSnap } = createTestComponent(['x']);

    render(React.createElement(TestComponent, { proxy }));

    // The snapshot should NOT have proxy virtual properties.
    expect(lastSnap.value).toBeDefined();
    expect((lastSnap.value as any).__is_proxy).toBeUndefined();
    expect((lastSnap.value as any).__proxy_id).toBeUndefined();
  });

  it('snapshot reflects the latest values after mutation', () => {
    const proxy = proxify({ count: 0 });
    const { TestComponent, lastSnap } = createTestComponent(['count']);

    render(React.createElement(TestComponent, { proxy }));
    expect(lastSnap.value.count).toBe(0);

    act(() => {
      proxy.count = 42;
    });
    expect(lastSnap.value.count).toBe(42);
  });

  it('handles proxy identity change (re-subscribes)', () => {
    const proxy1 = proxify({ value: 'A' });
    const proxy2 = proxify({ value: 'B' });
    const renderCount = { value: 0 };

    function Wrapper({ proxy }: { proxy: any }) {
      const snap = useProxy(proxy);
      renderCount.value++;
      return React.createElement('div', null, snap.value);
    }

    const { rerender } = render(React.createElement(Wrapper, { proxy: proxy1 }));
    expect(renderCount.value).toBe(1);

    // Switch to a different proxy.
    rerender(React.createElement(Wrapper, { proxy: proxy2 }));
    expect(renderCount.value).toBe(2);

    // Mutating the old proxy should NOT trigger re-render.
    act(() => {
      proxy1.value = 'C';
    });
    expect(renderCount.value).toBe(2);

    // Mutating the new proxy should trigger re-render.
    act(() => {
      proxy2.value = 'D';
    });
    expect(renderCount.value).toBe(3);
  });

  it('sibling children reading different props re-render independently', () => {
    const proxy = proxify({ name: 'Alice', email: 'alice@test.com' });

    const nameRenders = { value: 0 };
    const emailRenders = { value: 0 };

    function NameChild({ proxy: p }: { proxy: any }) {
      const snap = useProxy(p);
      nameRenders.value++;
      return React.createElement('span', null, snap.name);
    }

    function EmailChild({ proxy: p }: { proxy: any }) {
      const snap = useProxy(p);
      emailRenders.value++;
      return React.createElement('span', null, snap.email);
    }

    function Parent({ proxy: p }: { proxy: any }) {
      return React.createElement(
        'div',
        null,
        React.createElement(NameChild, { proxy: p }),
        React.createElement(EmailChild, { proxy: p }),
      );
    }

    render(React.createElement(Parent, { proxy }));
    expect(nameRenders.value).toBe(1);
    expect(emailRenders.value).toBe(1);

    // Mutate 'name' → only NameChild should re-render.
    act(() => {
      proxy.name = 'Bob';
    });
    expect(nameRenders.value).toBe(2);
    expect(emailRenders.value).toBe(1);

    // Mutate 'email' → only EmailChild should re-render.
    act(() => {
      proxy.email = 'bob@test.com';
    });
    expect(nameRenders.value).toBe(2);
    expect(emailRenders.value).toBe(2);
  });
});
