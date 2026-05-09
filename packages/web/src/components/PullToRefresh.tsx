'use client';

import { useState, useCallback, useRef, type ReactNode } from 'react';
import { isCapacitor } from '@/lib/capacitor';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
}

const PULL_THRESHOLD = 80;
const MAX_PULL = 120;
const RESISTANCE = 0.4;

/**
 * Touch-based pull-to-refresh for Capacitor native apps.
 * Shows an animated pull indicator and triggers the onRefresh callback
 * when the user pulls down past the 80px threshold.
 * Only renders its interactive behavior when running inside Capacitor.
 */
export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartRef = useRef<{ y: number; scrollTop: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isCapacitor() || isRefreshing) return;

    const el = containerRef.current;
    if (!el) return;

    const scrollTop = el.scrollTop ?? 0;
    // Only activate if at the top of scroll
    if (scrollTop > 0) return;

    const touch = e.touches[0];
    touchStartRef.current = { y: touch.clientY, scrollTop };
  }, [isRefreshing]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isCapacitor() || isRefreshing || !touchStartRef.current) return;

    const el = containerRef.current;
    if (!el) return;

    // Only pull if we're still at the top
    if (el.scrollTop > 2) {
      touchStartRef.current = null;
      setPullDistance(0);
      return;
    }

    const touch = e.touches[0];
    const delta = (touch.clientY - touchStartRef.current.y) * RESISTANCE;

    if (delta > 0) {
      // Prevent default scroll during pull
      e.preventDefault();
      setPullDistance(Math.min(delta, MAX_PULL));
    }
  }, [isRefreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!isCapacitor() || !touchStartRef.current) return;
    touchStartRef.current = null;

    if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(PULL_THRESHOLD);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, isRefreshing, onRefresh]);

  // Arrow rotates from 0 to 180 as user pulls past threshold
  const arrowRotation = Math.min(180, (pullDistance / PULL_THRESHOLD) * 180);

  // Transform scale for spring feel
  const indicatorScale = pullDistance > 0
    ? Math.min(1, 0.3 + (pullDistance / PULL_THRESHOLD) * 0.7)
    : 0;

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-y-auto"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      {pullDistance > 0 && (
        <div
          className="absolute top-0 left-0 right-0 flex items-center justify-center z-30 pointer-events-none transition-transform"
          style={{
            height: `${pullDistance}px`,
          }}
        >
          <div
            className="flex items-center justify-center w-8 h-8 rounded-full bg-surface-0 shadow-lg"
            style={{
              transform: `scale(${indicatorScale})`,
              transition: isRefreshing ? 'none' : 'transform 0.15s ease-out',
            }}
          >
            {isRefreshing ? (
              <svg
                className="w-4 h-4 text-amber-500 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12" cy="12" r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            ) : (
              <svg
                className="w-4 h-4 text-amber-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
                style={{
                  transform: `rotate(${arrowRotation}deg)`,
                  transition: 'transform 0.15s ease-out',
                }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* Content with spring-like offset */}
      <div
        style={{
          transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined,
          transition: pullDistance === 0 ? 'transform 0.3s cubic-bezier(0.2, 0.8, 0.3, 1)' : 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}
