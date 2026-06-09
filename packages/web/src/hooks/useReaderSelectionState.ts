'use client';

import { useState, useEffect } from 'react';

interface SelectionLike {
  isCollapsed: boolean;
  text: string;
}

interface AnnotationActionsLike {
  handleAddHighlight: (text: string, color: string) => void;
}

interface UseReaderSelectionStateOptions {
  selection: SelectionLike;
  annotationActions: AnnotationActionsLike;
}

/**
 * Manages selection tracking state: whether the user has made their first
 * selection, highlight mode auto-highlighting, and background enabled toggle.
 */
export function useReaderSelectionState({
  selection,
  annotationActions,
}: UseReaderSelectionStateOptions) {
  const [hasMadeSelection, setHasMadeSelection] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('read-pal-selection-used') === 'true';
  });
  const [highlightMode, setHighlightMode] = useState(false);
  const [bgEnabled, setBgEnabled] = useState(true);

  useEffect(() => {
    if (!selection.isCollapsed && !hasMadeSelection) {
      setHasMadeSelection(true);
      try { localStorage.setItem('read-pal-selection-used', 'true'); } catch (err) { console.warn('useReaderSelectionState: localStorage write failed', err); }
    }
  }, [selection.isCollapsed, hasMadeSelection]);

  useEffect(() => {
    if (highlightMode && !selection.isCollapsed && selection.text) {
      annotationActions.handleAddHighlight(selection.text, 'amber');
    }
  }, [highlightMode, selection.isCollapsed, selection.text, annotationActions.handleAddHighlight]);

  return { hasMadeSelection, setHasMadeSelection, highlightMode, setHighlightMode, bgEnabled, setBgEnabled };
}
