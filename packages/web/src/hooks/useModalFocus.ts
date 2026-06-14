'use client';

import { useEffect } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Trap keyboard focus inside a modal dialog and restore focus to the
 * previously-active element when the dialog unmounts or is hidden.
 *
 * - On enable: stash document.activeElement, focus the dialog (or first
 *   focusable descendant), install Tab key listener.
 * - On Tab / Shift+Tab: cycle focus between the first and last focusable
 *   descendants so the user cannot Tab out to background UI.
 * - On disable/unmount: remove listener, restore focus to the stashed element.
 *
 * Pass the same ref you use for `role="dialog"` / `tabIndex={-1}`.
 *
 * `enabled` defaults to `true`. Set it to `false` for components that stay
 * mounted but are visually hidden (e.g. always-rendered sidebars that
 * translate off-screen), so the trap only activates when actually open.
 */
export function useModalFocus<T extends HTMLElement>(
  containerRef: RefObject<T>,
  enabled: boolean = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move focus into the dialog. Prefer the container itself so screen
    // readers announce the dialog label; if it's not focusable, fall back
    // to the first focusable descendant.
    if (previouslyFocused !== container) {
      container.focus();
    }
    if (document.activeElement !== container) {
      const first = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      first?.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusable.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || active === container || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || active === container || !container.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus to the element that had focus before the modal opened.
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [containerRef, enabled]);
}
