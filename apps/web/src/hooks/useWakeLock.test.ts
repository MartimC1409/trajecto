import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWakeLock } from './useWakeLock';

function stubWakeLock(request: () => Promise<WakeLockSentinel>) {
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request: vi.fn(request) },
  });
  return (navigator as Navigator & { wakeLock: { request: ReturnType<typeof vi.fn> } }).wakeLock;
}

function sentinel() {
  return {
    released: false,
    release: vi.fn(async () => undefined),
  } as unknown as WakeLockSentinel & {
    release: ReturnType<typeof vi.fn>;
  };
}

describe('useWakeLock', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'wakeLock');
  });

  it('não faz nada sem suporte', () => {
    const { result } = renderHook(() => useWakeLock(true));
    expect(result.current).toBe(false);
  });

  it('pede o bloqueio quando ativo, volta a pedir ao regressar à página e liberta no fim', async () => {
    const lock = sentinel();
    const wakeLock = stubWakeLock(async () => lock);
    const { result, rerender } = renderHook(({ active }) => useWakeLock(active), {
      initialProps: { active: false },
    });
    expect(result.current).toBe(true);
    expect(wakeLock.request).not.toHaveBeenCalled();
    rerender({ active: true });
    await act(async () => undefined);
    expect(wakeLock.request).toHaveBeenCalledWith('screen');
    Object.assign(lock, { released: true });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(wakeLock.request).toHaveBeenCalledTimes(2);
    rerender({ active: false });
    expect(lock.release).toHaveBeenCalled();
  });

  it('ignora recusas e liberta um bloqueio que chega depois de desativar', async () => {
    const late = sentinel();
    let resolve: (value: WakeLockSentinel) => void = () => undefined;
    stubWakeLock(() => new Promise((r) => (resolve = r)));
    const { rerender } = renderHook(({ active }) => useWakeLock(active), {
      initialProps: { active: true },
    });
    rerender({ active: false });
    await act(async () => resolve(late));
    expect(late.release).toHaveBeenCalled();

    stubWakeLock(() => Promise.reject(new Error('NotAllowedError')));
    const { result } = renderHook(() => useWakeLock(true));
    await act(async () => undefined);
    expect(result.current).toBe(true);
  });
});
