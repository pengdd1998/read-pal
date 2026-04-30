import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSwipeGesture } from '../useSwipeGesture';

function createTouchEvent(x: number, y: number): React.TouchEvent {
  return {
    touches: [{ clientX: x, clientY: y } as React.Touch],
    changedTouches: [{ clientX: x, clientY: y } as React.Touch],
  } as React.TouchEvent;
}

describe('useSwipeGesture', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with null swipeDirection', () => {
    const { result } = renderHook(() => useSwipeGesture());
    expect(result.current.swipeDirection).toBeNull();
  });

  it('detects left swipe', () => {
    const onSwipe = vi.fn();
    const { result } = renderHook(() => useSwipeGesture(onSwipe));

    act(() => {
      result.current.onTouchStart(createTouchEvent(200, 100));
    });

    act(() => {
      result.current.onTouchEnd(createTouchEvent(100, 100));
    });

    expect(result.current.swipeDirection).toBe('left');
    expect(onSwipe).toHaveBeenCalledWith('left');
  });

  it('detects right swipe', () => {
    const onSwipe = vi.fn();
    const { result } = renderHook(() => useSwipeGesture(onSwipe));

    act(() => {
      result.current.onTouchStart(createTouchEvent(100, 100));
    });

    act(() => {
      result.current.onTouchEnd(createTouchEvent(200, 100));
    });

    expect(result.current.swipeDirection).toBe('right');
    expect(onSwipe).toHaveBeenCalledWith('right');
  });

  it('ignores swipes below threshold', () => {
    const onSwipe = vi.fn();
    const { result } = renderHook(() => useSwipeGesture(onSwipe));

    act(() => {
      result.current.onTouchStart(createTouchEvent(100, 100));
    });

    act(() => {
      // Only 30px — below default 50px threshold
      result.current.onTouchEnd(createTouchEvent(130, 100));
    });

    expect(result.current.swipeDirection).toBeNull();
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('ignores vertical scrolls', () => {
    const onSwipe = vi.fn();
    const { result } = renderHook(() => useSwipeGesture(onSwipe));

    act(() => {
      result.current.onTouchStart(createTouchEvent(100, 100));
    });

    act(() => {
      // Mostly vertical movement
      result.current.onTouchEnd(createTouchEvent(110, 200));
    });

    expect(result.current.swipeDirection).toBeNull();
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('respects custom threshold', () => {
    const onSwipe = vi.fn();
    const { result } = renderHook(() =>
      useSwipeGesture(onSwipe, { threshold: 100 }),
    );

    act(() => {
      result.current.onTouchStart(createTouchEvent(100, 100));
    });

    act(() => {
      // 80px — below custom 100px threshold
      result.current.onTouchEnd(createTouchEvent(180, 100));
    });

    expect(result.current.swipeDirection).toBeNull();
  });

  it('auto-resets after delay', () => {
    const { result } = renderHook(() => useSwipeGesture(undefined, { resetDelay: 300 }));

    act(() => {
      result.current.onTouchStart(createTouchEvent(200, 100));
    });

    act(() => {
      result.current.onTouchEnd(createTouchEvent(100, 100));
    });

    expect(result.current.swipeDirection).toBe('left');

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.swipeDirection).toBeNull();
  });

  it('does nothing on touchEnd without touchStart', () => {
    const { result } = renderHook(() => useSwipeGesture());

    act(() => {
      result.current.onTouchEnd(createTouchEvent(100, 100));
    });

    expect(result.current.swipeDirection).toBeNull();
  });
});
