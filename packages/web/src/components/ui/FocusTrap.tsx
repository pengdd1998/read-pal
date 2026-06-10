'use client';

import { useEffect, useRef, ReactNode } from 'react';

/**
 * FocusTrap — keeps keyboard focus within a container (modal, dialog, drawer).
 *
 * Usage:
 *   <FocusTrap active={isOpen}>
 *     <div role="dialog" aria-modal="true">
 *       <button>First</button>
 *       <button>Second</button>
 *     </div>
 *   </FocusTrap>
 */

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

interface FocusTrapProps {
  children: ReactNode;
  /** Whether the trap is active. When false, does nothing. */
  active: boolean;
  /** Whether to restore focus to the previously focused element on unmount. Default: true */
  restoreFocus?: boolean;
}

export function FocusTrap({ children, active, restoreFocus = true }: FocusTrapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Capture and restore focus
  useEffect(() => {
    if (!active) return;

    previousFocusRef.current = document.activeElement as HTMLElement;

    // Focus the first focusable element after a tick (to allow rendering)
    const timer = setTimeout(() => {
      if (!containerRef.current) return;
      const focusable = containerRef.current.querySelectorAll(FOCUSABLE_SELECTORS);
      if (focusable.length > 0) {
        (focusable[0] as HTMLElement).focus();
      }
    }, 0);

    return () => {
      clearTimeout(timer);
      if (restoreFocus && previousFocusRef.current?.focus) {
        previousFocusRef.current.focus();
      }
    };
  }, [active, restoreFocus]);

  // Handle Tab / Shift+Tab cycling
  useEffect(() => {
    if (!active) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !containerRef.current) return;

      const focusable = containerRef.current.querySelectorAll(FOCUSABLE_SELECTORS);
      if (focusable.length === 0) return;

      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;

      if (e.shiftKey) {
        // Shift+Tab: if at first element, wrap to last
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: if at last element, wrap to first
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [active]);

  if (!active) return <>{children}</>;

  return <div ref={containerRef}>{children}</div>;
}
