'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

export type SwipeDirection = 'left' | 'right' | null;

interface SwipeGestureOptions {
  /** Minimum horizontal distance in px to count as a swipe. Default: 50 */
  threshold?: number;
  /** Auto-reset delay in ms after a swipe is detected. Default: 300 */
  resetDelay?: number;
}

interface SwipeGestureResult {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  swipeDirection: SwipeDirection;
}

/**
 * Horizontal swipe gesture detector for touch devices.
 * Tracks touch start/end positions and detects left/right swipes
 * that exceed the given threshold. The detected direction auto-resets
 * after a configurable delay.
 */
export function useSwipeGesture(
  onSwipe?: (direction: SwipeDirection) => void,
  options: SwipeGestureOptions = {},
): SwipeGestureResult {
  const { threshold = 50, resetDelay = 300 } = options;
  const [swipeDirection, setSwipeDirection] = useState<SwipeDirection>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    // Only trigger on distinct horizontal swipes (not vertical scrolls)
    if (Math.abs(deltaX) < threshold) return;
    if (Math.abs(deltaY) > Math.abs(deltaX) * 0.7) return;

    const direction: SwipeDirection = deltaX < 0 ? 'left' : 'right';
    setSwipeDirection(direction);
    onSwipe?.(direction);

    // Auto-reset after delay
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      setSwipeDirection(null);
      resetTimerRef.current = null;
    }, resetDelay);
  }, [threshold, resetDelay, onSwipe]);

  return { onTouchStart, onTouchEnd, swipeDirection };
}
