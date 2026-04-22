'use client';

import { useState, useEffect, useCallback, useRef, type RefObject } from 'react';

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
 * Automatically clears when the selection collapses or user clicks outside.
 *
 * Key design: only triggers React state updates on mouseup/touchend,
 * NOT during active text selection. This prevents re-renders that would
 * disrupt the browser's native selection mechanism.
 */
export function useTextSelection(containerRef: RefObject<HTMLElement | null>): TextSelection {
  const [selection, setSelection] = useState<TextSelection>(EMPTY_SELECTION);
  const rafRef = useRef<number | null>(null);

  // Read current selection from browser and update React state.
  // Only called on pointer-up to avoid re-renders during drag-to-select.
  const captureSelection = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setSelection(EMPTY_SELECTION);
        return;
      }

      const container = containerRef.current;
      if (!container) return;

      const anchorNode = sel.anchorNode;
      if (!anchorNode || !container.contains(anchorNode)) return;

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
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setSelection(EMPTY_SELECTION);
  }, []);

  useEffect(() => {
    // Capture selection ONLY on pointer-up — this is when the user
    // finishes their selection. We do NOT update during selectionchange
    // to avoid React re-renders that would break the browser's selection.
    document.addEventListener('mouseup', captureSelection);
    document.addEventListener('touchend', captureSelection);

    // selectionchange is used ONLY to detect when selection collapses
    // (user clicks to deselect, or selection is programmatically cleared).
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        clearSelection();
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);

    // Clear selection when clicking outside the container AND not on the toolbar.
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-selection-toolbar]')) return;
      const container = containerRef.current;
      if (container && container.contains(target)) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) return;
      clearSelection();
    };

    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('mouseup', captureSelection);
      document.removeEventListener('touchend', captureSelection);
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('mousedown', handleMouseDown);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [containerRef, captureSelection, clearSelection]);

  return selection;
}
