'use client';

import { useState, useEffect, useCallback, type RefObject } from 'react';

export interface TextSelection {
  text: string;
  rect: DOMRect | null;
  range: Range | null;
  isCollapsed: boolean;
}

const EMPTY_SELECTION: TextSelection = {
  text: '',
  rect: null,
  range: null,
  isCollapsed: true,
};

/**
 * Tracks the user's text selection within a container element.
 * Returns the selected text, bounding rect, and Range object.
 * Automatically clears when the selection collapses.
 */
export function useTextSelection(containerRef: RefObject<HTMLElement | null>): TextSelection {
  const [selection, setSelection] = useState<TextSelection>(EMPTY_SELECTION);

  const updateSelection = useCallback(() => {
    // Use rAF to let the browser finalize selection
    requestAnimationFrame(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setSelection(EMPTY_SELECTION);
        return;
      }

      // Only track selections within our container
      if (containerRef.current && sel.anchorNode && !containerRef.current.contains(sel.anchorNode)) {
        return;
      }

      const text = sel.toString().trim();
      if (!text) {
        setSelection(EMPTY_SELECTION);
        return;
      }

      let rect: DOMRect | null = null;
      let range: Range | null = null;

      try {
        range = sel.getRangeAt(0);
        rect = range.getBoundingClientRect();
      } catch {
        // getRangeAt can fail in some edge cases
      }

      setSelection({
        text,
        rect: rect && rect.width > 0 ? rect : null,
        range,
        isCollapsed: false,
      });
    });
  }, [containerRef]);

  const clearSelection = useCallback(() => {
    setSelection(EMPTY_SELECTION);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Listen for mouse and touch selection events
    document.addEventListener('mouseup', updateSelection);
    document.addEventListener('touchend', updateSelection);

    // Clear selection only when clicking outside the container AND not on the toolbar.
    // We use a named handler so it can be properly removed on cleanup.
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't clear if clicking on the selection toolbar itself
      if (target.closest('[data-selection-toolbar]')) return;
      // Don't clear if the click is inside our content container (user might be selecting text)
      if (container.contains(target)) return;
      clearSelection();
    };

    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('mouseup', updateSelection);
      document.removeEventListener('touchend', updateSelection);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [containerRef, updateSelection, clearSelection]);

  return selection;
}
