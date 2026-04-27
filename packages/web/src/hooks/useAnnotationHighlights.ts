'use client';

import { useEffect, useRef, useCallback, useMemo, type RefObject } from 'react';
import type { Annotation } from '@read-pal/shared';

const MARK_CLASS = 'highlight-mark';
const DATA_ATTR = 'data-annotation-id';

/** Stored entry tracking a DOM mark element tied to an annotation. */
interface MarkEntry {
  element: HTMLElement;
  annotation: Annotation;
}

/**
 * Renders annotation highlights as <mark> elements in the DOM.
 *
 * Performance strategy:
 * - Separate effects for page change (full rebuild) vs annotation delta (incremental).
 * - Theme-only changes simply update CSS on existing marks (no DOM rebuild).
 * - Annotation additions/removals only touch their specific marks.
 * - Heavy DOM work is spread across requestAnimationFrame batches.
 */
export function useAnnotationHighlights(
  containerRef: RefObject<HTMLElement | null>,
  annotations: Annotation[],
  currentPageIndex: number,
  theme: 'light' | 'dark' | 'sepia' = 'light',
): void {
  // ── Stable refs that survive across renders ──────────────────────────
  const marksMapRef = useRef<Map<string, MarkEntry>>(new Map());
  const prevThemeRef = useRef(theme);
  const prevPageRef = useRef(currentPageIndex);

  // ── Memoized page-filtered annotations (stable reference via useMemo) ──
  const pageAnnotations = useMemo(
    () =>
      annotations.filter(
        (a) =>
          a.type !== 'bookmark' &&
          a.location?.pageIndex === currentPageIndex &&
          a.location?.selection &&
          typeof a.location.selection.start === 'number' &&
          typeof a.location.selection.end === 'number',
      ),
    [annotations, currentPageIndex],
  );

  // Stable ID set for quick membership checks
  const pageAnnotationIds = useMemo(
    () => new Set(pageAnnotations.map((a) => a.id)),
    [pageAnnotations],
  );

  // ── Helper: compute style for a mark based on annotation + theme ─────
  const applyMarkStyle = useCallback(
    (mark: HTMLElement, annotation: Annotation, currentTheme: string) => {
      const color = annotation.color || '#FFEB3B';
      mark.style.backgroundColor = hexToRgba(
        color,
        currentTheme === 'dark' ? 0.35 : 0.45,
      );
      mark.style.borderBottom = annotation.note
        ? `2px solid ${color}`
        : 'none';
    },
    [],
  );

  // ── Helper: completely remove all marks from the DOM and clear the map ──
  const clearAllMarks = useCallback((container: HTMLElement) => {
    container.querySelectorAll(`.${MARK_CLASS}`).forEach((el) => {
      const parent = el.parentNode;
      if (parent) {
        while (el.firstChild) {
          parent.insertBefore(el.firstChild, el);
        }
        parent.removeChild(el);
        parent.normalize();
      }
    });
    marksMapRef.current.clear();
  }, []);

  // ── Effect 1: Theme-only update (fast path, no DOM rebuild) ──────────
  useEffect(() => {
    if (prevThemeRef.current === theme) return;

    const alpha = theme === 'dark' ? 0.35 : 0.45;
    marksMapRef.current.forEach((entry) => {
      const color = entry.annotation.color || '#FFEB3B';
      entry.element.style.backgroundColor = hexToRgba(color, alpha);
    });

    prevThemeRef.current = theme;
  }, [theme]);

  // ── Effect 2: Page change — full nuke-and-rebuild ────────────────────
  // Separated from annotation delta so page flips don't re-run diff logic.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (prevPageRef.current === currentPageIndex) return;

    // Page changed — offsets are page-relative so all marks are invalid
    clearAllMarks(container);
    prevPageRef.current = currentPageIndex;

    // Rebuild marks for the new page (pageAnnotations already filtered by memo)
    if (pageAnnotations.length === 0) return;

    const sorted = [...pageAnnotations].sort(
      (a, b) =>
        (b.location?.selection?.start ?? 0) - (a.location?.selection?.start ?? 0),
    );

    batchCreateMarks(containerRef, sorted, theme, marksMapRef, applyMarkStyle);
  }, [containerRef, currentPageIndex, pageAnnotations, theme, clearAllMarks, applyMarkStyle]);

  // ── Effect 3: Annotation delta — incremental add/remove/style ────────
  // Only runs when pageAnnotations identity changes (new/removed/updated).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Skip on page change — handled by Effect 2
    if (prevPageRef.current !== currentPageIndex) return;

    // ── Fast path: nothing to render, just clear stale marks ──────────
    if (pageAnnotations.length === 0 && marksMapRef.current.size === 0) {
      return;
    }

    // ── Remove marks for deleted annotations ──────────────────────────
    for (const [id, entry] of marksMapRef.current) {
      if (!pageAnnotationIds.has(id)) {
        const parent = entry.element.parentNode;
        if (parent) {
          while (entry.element.firstChild) {
            parent.insertBefore(entry.element.firstChild, parent);
          }
          parent.removeChild(entry.element);
          parent.normalize();
        }
        marksMapRef.current.delete(id);
      }
    }

    // ── Determine which annotations need a fresh mark created ─────────
    const toCreate: Annotation[] = [];
    for (const ann of pageAnnotations) {
      if (!marksMapRef.current.has(ann.id)) {
        toCreate.push(ann);
      } else {
        // Check if the existing mark element is still in the DOM (not detached)
        const existing = marksMapRef.current.get(ann.id)!;
        if (!container.contains(existing.element)) {
          // Mark was detached (e.g., by React re-render) — recreate it
          marksMapRef.current.delete(ann.id);
          toCreate.push(ann);
        } else if (
          existing.annotation.color !== ann.color ||
          existing.annotation.note !== ann.note
        ) {
          applyMarkStyle(existing.element, ann, theme);
          existing.annotation = ann;
        }
      }
    }

    if (toCreate.length === 0) return;

    // ── Sort descending by start offset so we insert end-to-start ──────
    const sorted = toCreate.sort(
      (a, b) =>
        (b.location?.selection?.start ?? 0) - (a.location?.selection?.start ?? 0),
    );

    batchCreateMarks(containerRef, sorted, theme, marksMapRef, applyMarkStyle);
  }, [containerRef, pageAnnotations, pageAnnotationIds, currentPageIndex, theme, applyMarkStyle]);
}

// ────────────────────────────────────────────────────────────────────────────
// Pure helpers (not hooks, safe to extract)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Create marks in batches via rAF for large sets, synchronously for small.
 */
function batchCreateMarks(
  containerRef: RefObject<HTMLElement | null>,
  sorted: Annotation[],
  theme: string,
  marksMap: React.MutableRefObject<Map<string, MarkEntry>>,
  applyStyle: (mark: HTMLElement, ann: Annotation, theme: string) => void,
): void {
  const BATCH_SIZE = 8;

  if (sorted.length <= BATCH_SIZE) {
    const container = containerRef.current;
    if (!container) return;
    for (const annotation of sorted) {
      createMark(container, annotation, theme, marksMap.current, applyStyle);
    }
    return;
  }

  let index = 0;
  function processBatch() {
    const container = containerRef.current;
    if (!container) return;
    const end = Math.min(index + BATCH_SIZE, sorted.length);
    for (; index < end; index++) {
      createMark(container, sorted[index], theme, marksMap.current, applyStyle);
    }
    if (index < sorted.length) {
      requestAnimationFrame(processBatch);
    }
  }
  requestAnimationFrame(processBatch);
}

/**
 * Create a single <mark> element for an annotation and insert it into the
 * container DOM. Returns the mark element or null if it could not be placed.
 *
 * Handles cross-element boundaries by splitting the range into multiple
 * <mark> elements that share a common annotation ID.
 */
function createMark(
  container: HTMLElement,
  annotation: Annotation,
  currentTheme: string,
  marksMap: Map<string, MarkEntry>,
  applyStyle: (mark: HTMLElement, ann: Annotation, theme: string) => void,
): HTMLElement | null {
  const start = annotation.location!.selection!.start;
  const end = annotation.location!.selection!.end;

  const result = findTextOffset(container, start, end - start);
  if (!result) return null;

  const { startNode, startOffset, endNode, endOffset } = result;

  try {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);

    // Try surroundContents first (works when range is within a single element)
    const mark = document.createElement('mark');
    mark.className = MARK_CLASS;
    mark.setAttribute(DATA_ATTR, annotation.id);
    mark.style.cursor = 'pointer';
    mark.style.borderRadius = '2px';
    mark.style.padding = '1px 0';
    mark.style.transition = 'background-color 0.2s ease';
    applyStyle(mark, annotation, currentTheme);

    try {
      range.surroundContents(mark);
    } catch {
      // surroundContents fails when range crosses element boundaries.
      // Fall back to extractContents + wrap approach.
      const fragment = range.extractContents();
      mark.appendChild(fragment);
      range.insertNode(mark);
    }

    marksMap.set(annotation.id, { element: mark, annotation });
    return mark;
  } catch {
    return null;
  }
}

/**
 * Walk text nodes in the container and find the DOM position
 * corresponding to the given character offset and length.
 */
function findTextOffset(
  container: HTMLElement,
  offset: number,
  length: number,
): { startNode: Text; startOffset: number; endNode: Text; endOffset: number } | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  let charsSeen = 0;
  let startResult: { node: Text; offset: number } | null = null;
  let endResult: { node: Text; offset: number } | null = null;

  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const nodeLen = node.textContent?.length ?? 0;

    if (!startResult && charsSeen + nodeLen > offset) {
      startResult = { node, offset: offset - charsSeen };
    }

    if (!endResult && charsSeen + nodeLen >= offset + length) {
      endResult = { node, offset: offset + length - charsSeen };
      break;
    }

    charsSeen += nodeLen;
  }

  if (!startResult || !endResult) return null;
  return {
    startNode: startResult.node,
    startOffset: startResult.offset,
    endNode: endResult.node,
    endOffset: endResult.offset,
  };
}

/**
 * Convert a hex color to rgba string with given alpha.
 */
function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(255, 235, 59, ${alpha})`; // fallback yellow
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
