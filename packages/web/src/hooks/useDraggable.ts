'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const DRAG_THRESHOLD = 6; // px movement to distinguish drag from click
const SNAP_TRANSITION = 'left 0.25s cubic-bezier(0.16,1,0.3,1), top 0.25s cubic-bezier(0.16,1,0.3,1)';

export interface DragPosition {
  x: number; // left px
  y: number; // top px
}

export interface UseDraggableOptions {
  storageKey: string;
  btnSize: number;
  edgeMargin: number;
  headerMinY: number;
}

export interface UseDraggableReturn {
  btnPos: DragPosition;
  isDragging: boolean;
  isSnapping: boolean;
  onDragStart: (cx: number, cy: number) => void;
  onDragMove: (cx: number, cy: number) => void;
  onDragEnd: () => boolean;
  wasDragRef: React.MutableRefObject<boolean>;
  btnRef: React.RefObject<HTMLButtonElement>;
  snapTransition: string;
  dragRef: React.MutableRefObject<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>;
}

function loadSavedPosition(storageKey: string): DragPosition | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const pos = JSON.parse(raw) as DragPosition;
    if (typeof pos.x === 'number' && typeof pos.y === 'number') return pos;
  } catch (err) { console.warn('Storage error: failed to load draggable position', err); }
  return null;
}

function defaultPosition(btnSize: number, edgeMargin: number): DragPosition {
  return {
    x: window.innerWidth - btnSize - edgeMargin,
    y: window.innerHeight - btnSize - edgeMargin,
  };
}

/** Snap position to nearest viewport edge with margin, clamped below the header. */
function snapToEdge(
  pos: DragPosition,
  btnSize: number,
  edgeMargin: number,
  headerMinY: number,
): DragPosition {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const minY = headerMinY;
  const cx = pos.x + btnSize / 2;
  const cy = pos.y + btnSize / 2;

  const distLeft = cx;
  const distRight = vw - cx;
  const distTop = cy - minY;
  const distBottom = vh - cy;

  const minDist = Math.min(distLeft, distRight, distTop, distBottom);

  if (minDist === distTop) {
    return {
      x: Math.max(edgeMargin, Math.min(pos.x, vw - btnSize - edgeMargin)),
      y: minY,
    };
  }
  if (minDist === distLeft) {
    return {
      x: edgeMargin,
      y: Math.max(minY, Math.min(pos.y, vh - btnSize - edgeMargin)),
    };
  }
  if (minDist === distRight) {
    return {
      x: vw - btnSize - edgeMargin,
      y: Math.max(minY, Math.min(pos.y, vh - btnSize - edgeMargin)),
    };
  }
  return {
    x: Math.max(edgeMargin, Math.min(pos.x, vw - btnSize - edgeMargin)),
    y: vh - btnSize - edgeMargin,
  };
}

/**
 * Hook for managing a draggable floating button that snaps to viewport edges.
 * Handles pointer/touch events, viewport resize, and position persistence.
 */
export function useDraggable(options: UseDraggableOptions): UseDraggableReturn {
  const { storageKey, btnSize, edgeMargin, headerMinY } = options;

  const [btnPos, setBtnPos] = useState<DragPosition>(() => {
    if (typeof window === 'undefined') return { x: 0, y: 0 };
    const saved = loadSavedPosition(storageKey);
    if (saved) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      return {
        x: Math.max(edgeMargin, Math.min(saved.x, vw - btnSize - edgeMargin)),
        y: Math.max(headerMinY, Math.min(saved.y, vh - btnSize - edgeMargin)),
      };
    }
    return defaultPosition(btnSize, edgeMargin);
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isSnapping, setIsSnapping] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const wasDragRef = useRef(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Persist position on change
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(btnPos)); } catch (err) { console.warn('Storage error: failed to persist draggable position', err); }
  }, [btnPos, storageKey]);

  // Reposition on viewport resize
  useEffect(() => {
    const handleResize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setBtnPos((prev) => ({
        x: Math.max(edgeMargin, Math.min(prev.x, vw - btnSize - edgeMargin)),
        y: Math.max(headerMinY, Math.min(prev.y, vh - btnSize - edgeMargin)),
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [btnSize, edgeMargin, headerMinY]);

  const onDragStart = useCallback((clientX: number, clientY: number) => {
    setIsSnapping(false);
    dragRef.current = {
      startX: clientX,
      startY: clientY,
      originX: btnPos.x,
      originY: btnPos.y,
      moved: false,
    };
  }, [btnPos]);

  const onDragMove = useCallback((clientX: number, clientY: number) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = clientX - d.startX;
    const dy = clientY - d.startY;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    setIsDragging(true);

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setBtnPos({
      x: Math.max(edgeMargin, Math.min(d.originX + dx, vw - btnSize - edgeMargin)),
      y: Math.max(headerMinY, Math.min(d.originY + dy, vh - btnSize - edgeMargin)),
    });
  }, [btnSize, edgeMargin, headerMinY]);

  const onDragEnd = useCallback(() => {
    const d = dragRef.current;
    const wasMoved = d?.moved ?? false;
    dragRef.current = null;
    setIsDragging(false);
    wasDragRef.current = wasMoved;

    if (wasMoved) {
      setIsSnapping(true);
      setBtnPos((prev) => snapToEdge(prev, btnSize, edgeMargin, headerMinY));
      setTimeout(() => setIsSnapping(false), 260);
      return wasMoved;
    }
    return false;
  }, [btnSize, edgeMargin, headerMinY]);

  return {
    btnPos,
    isDragging,
    isSnapping,
    onDragStart,
    onDragMove,
    onDragEnd,
    wasDragRef,
    btnRef,
    snapTransition: SNAP_TRANSITION,
    dragRef,
  };
}
