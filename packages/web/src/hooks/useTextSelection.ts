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
 */
export function useTextSelection(containerRef: RefObject<HTMLElement | null>): TextSelection {
  const [selection, setSelection] = useState<TextSelection>(EMPTY_SELECTION);
  const rafRef = useRef<number | null>(null);

  const updateSelection = useCallback(() => {
    // Cancel any pending update
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setSelection(EMPTY_SELECTION);
        return;
      }

      // Read containerRef.current at invocation time (not capture time)
      const container = containerRef.current;
      if (!container) return;

      const anchorNode = sel.anchorNode;
      if (!anchorNode || !container.contains(anchorNode)) {
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
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setSelection(EMPTY_SELECTION);
  }, []);

  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setSelection(EMPTY_SELECTION);
        return;
      }
      // Read containerRef.current at invocation time to handle remounts
      const container = containerRef.current;
      if (container && sel.anchorNode && !container.contains(sel.anchorNode)) {
        return;
      }
      updateSelection();
    };

    // Also listen for mouseup/touchend as fallback
    document.addEventListener('mouseup', updateSelection);
    document.addEventListener('touchend', updateSelection);
    document.addEventListener('selectionchange', handleSelectionChange);

    // Clear selection when clicking outside the container AND not on the toolbar.
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't clear if clicking on the selection toolbar itself
      if (target.closest('[data-selection-toolbar]')) return;
      // Read containerRef.current at invocation time to handle remounts
      const container = containerRef.current;
      if (container && container.contains(target)) return;
      // Don't clear if there's an active selection (user might be interacting with toolbar)
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) return;
      clearSelection();
    };

    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('mouseup', updateSelection);
      document.removeEventListener('touchend', updateSelection);
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('mousedown', handleMouseDown);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [containerRef, updateSelection, clearSelection]);

  return selection;
}
