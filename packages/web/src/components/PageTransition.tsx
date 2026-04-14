'use client';

import { ReactNode } from 'react';

/**
 * CSS-only page entrance animation.
 * Uses a key-based approach via the `key` prop on the parent layout
 * to re-trigger the animation on route change.
 * Avoids React re-render loops from useEffect + setState patterns.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <div className="animate-fade-in">
      {children}
    </div>
  );
}
