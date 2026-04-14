'use client';

import { useEffect, useRef, useCallback, type RefObject } from 'react';
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
 * - Keeps a Map of annotation-id -> mark element so we can diff changes.
 * - Theme-only changes simply update CSS on existing marks (no DOM rebuild).
 * - Added/removed annotations only touch their specific marks.
 * - Heavy DOM work (page change, full annotation set change) is spread across
 *   requestAnimationFrame batches to avoid blocking the main thread.
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
  const prevAnnotationsRef = useRef<Annotation[]>([]);

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

  // ── Effect 2: Annotation / page changes (diff + batched rebuild) ─────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const pageChanged = prevPageRef.current !== currentPageIndex;
    const prevAnnotations = prevAnnotationsRef.current;

    // Build a lookup of annotations relevant to this page
    const pageAnnotations = annotations.filter(
      (a) =>
        a.type !== 'bookmark' &&
        a.location?.pageIndex === currentPageIndex &&
        a.location?.selection &&
        typeof a.location.selection.start === 'number' &&
        typeof a.location.selection.end === 'number',
    );

    const currentPageIds = new Set(pageAnnotations.map((a) => a.id));

    // ── Fast path: nothing to render, just clear stale marks ──────────
    if (pageAnnotations.length === 0 && marksMapRef.current.size === 0) {
      prevPageRef.current = currentPageIndex;
      prevAnnotationsRef.current = annotations;
      return;
    }

    // ── If the page changed, nuke everything and rebuild from scratch ──
    // (offsets are page-relative so all marks are invalid after page flip)
    if (pageChanged) {
      clearAllMarks(container);
      marksMapRef.current = new Map();
    } else {
      // ── Diff: remove marks for deleted annotations ──────────────────
      for (const [id, entry] of marksMapRef.current) {
        if (!currentPageIds.has(id)) {
          const parent = entry.element.parentNode;
          if (parent) {
            while (entry.element.firstChild) {
              parent.insertBefore(entry.element.firstChild, entry.element);
            }
            parent.removeChild(entry.element);
            parent.normalize();
          }
          marksMapRef.current.delete(id);
        }
      }
    }

    // ── Determine which annotations need a fresh mark created ──────────
    const toCreate: Annotation[] = [];
    for (const ann of pageAnnotations) {
      if (!marksMapRef.current.has(ann.id)) {
        toCreate.push(ann);
      } else {
        // Annotation still exists — check if style-affecting fields changed
        const existing = marksMapRef.current.get(ann.id)!;
        if (
          existing.annotation.color !== ann.color ||
          existing.annotation.note !== ann.note
        ) {
          applyMarkStyle(existing.element, ann, theme);
          existing.annotation = ann;
        }
      }
    }

    prevPageRef.current = currentPageIndex;
    prevAnnotationsRef.current = annotations;

    if (toCreate.length === 0) return;

    // ── Sort descending by start offset so we insert end-to-start ──────
    const sorted = toCreate.sort(
      (a, b) =>
        (b.location?.selection?.start ?? 0) - (a.location?.selection?.start ?? 0),
    );

    // ── Batch DOM insertions via rAF to keep the main thread responsive ──
    const BATCH_SIZE = 10;
    let index = 0;

    function processBatch() {
      // Guard: container may have been unmounted between rAF frames
      const currentContainer = containerRef.current;
      if (!currentContainer) return;

      const end = Math.min(index + BATCH_SIZE, sorted.length);
      for (; index < end; index++) {
        const annotation = sorted[index];
        createMark(currentContainer, annotation, theme, marksMapRef.current, applyMarkStyle);
      }
      if (index < sorted.length) {
        requestAnimationFrame(processBatch);
      }
    }

    // For small counts, do them synchronously to avoid visual flicker.
    // The rAF batching only matters for large annotation sets (50+).
    if (sorted.length <= BATCH_SIZE) {
      for (const annotation of sorted) {
        createMark(container, annotation, theme, marksMapRef.current, applyMarkStyle);
      }
    } else {
      requestAnimationFrame(processBatch);
    }
  }, [containerRef, annotations, currentPageIndex, theme, clearAllMarks, applyMarkStyle]);
}

// ────────────────────────────────────────────────────────────────────────────
// Pure helpers (not hooks, safe to extract)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Create a single <mark> element for an annotation and insert it into the
 * container DOM. Returns the mark element or null if it could not be placed.
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

    const mark = document.createElement('mark');
    mark.className = MARK_CLASS;
    mark.setAttribute(DATA_ATTR, annotation.id);
    mark.style.cursor = 'pointer';
    mark.style.borderRadius = '2px';
    mark.style.padding = '1px 0';
    mark.style.transition = 'background-color 0.2s ease';

    applyStyle(mark, annotation, currentTheme);

    range.surroundContents(mark);

    marksMap.set(annotation.id, { element: mark, annotation });
    return mark;
  } catch {
    // surroundContents fails when range crosses element boundaries — skip.
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
