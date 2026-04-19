import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOnlineStatus } from '../useOnlineStatus';

describe('useOnlineStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns isOnline=true by default', () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(true);
    expect(result.current.justCameBackOnline).toBe(false);
  });

  it('tracks offline state', () => {
    const { result } = renderHook(() => useOnlineStatus());

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current.isOnline).toBe(false);
    expect(result.current.justCameBackOnline).toBe(false);
  });

  it('sets justCameBackOnline when coming back online', () => {
    const { result } = renderHook(() => useOnlineStatus());

    // Go offline first
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.isOnline).toBe(false);

    // Come back online
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current.isOnline).toBe(true);
    expect(result.current.justCameBackOnline).toBe(true);

    // After 3 seconds, justCameBackOnline resets
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.justCameBackOnline).toBe(false);
  });

  it('cleans up event listeners on unmount', () => {
    const { unmount } = renderHook(() => useOnlineStatus());
    const spy = vi.spyOn(window, 'removeEventListener');
    unmount();
    expect(spy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(spy).toHaveBeenCalledWith('offline', expect.any(Function));
  });
});
