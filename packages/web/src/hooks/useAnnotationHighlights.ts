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
  contentReady: boolean = true,
): void {
  const marksMapRef = useRef<Map<string, MarkEntry>>(new Map());
  const prevThemeRef = useRef(theme);
  const prevPageRef = useRef(currentPageIndex);

  // Memoized page-filtered annotations
  const pageAnnotations = useMemo(
    () =>
      annotations.filter(
        (a) =>
          a.type !== 'bookmark' &&
          Number(a.location?.pageIndex) === currentPageIndex &&
          a.location?.selection &&
          typeof a.location.selection.start === 'number' &&
          typeof a.location.selection.end === 'number',
      ),
    [annotations, currentPageIndex],
  );

  const pageAnnotationIds = useMemo(
    () => new Set(pageAnnotations.map((a) => a.id)),
    [pageAnnotations],
  );

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

  // Effect 1: Theme-only update (fast path, no DOM rebuild)
  useEffect(() => {
    if (prevThemeRef.current === theme) return;

    const alpha = theme === 'dark' ? 0.35 : 0.45;
    marksMapRef.current.forEach((entry) => {
      const color = entry.annotation.color || '#FFEB3B';
      entry.element.style.backgroundColor = hexToRgba(color, alpha);
    });

    prevThemeRef.current = theme;
  }, [theme]);

  // Effect 2: Page change — full nuke-and-rebuild
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (prevPageRef.current === currentPageIndex) return;

    clearAllMarks(container);
    prevPageRef.current = currentPageIndex;

    if (pageAnnotations.length === 0) return;

    const sorted = [...pageAnnotations].sort(
      (a, b) =>
        (b.location?.selection?.start ?? 0) - (a.location?.selection?.start ?? 0),
    );

    batchCreateMarks(containerRef, sorted, theme, marksMapRef, applyMarkStyle);
  }, [containerRef, currentPageIndex, pageAnnotations, theme, clearAllMarks, applyMarkStyle, contentReady]);

  // Effect 3: Annotation delta — incremental add/remove/style
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (prevPageRef.current !== currentPageIndex) return;

    if (pageAnnotations.length === 0 && marksMapRef.current.size === 0) {
      return;
    }

    // Remove marks for deleted annotations
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

    // Determine which annotations need a fresh mark created
    const toCreate: Annotation[] = [];
    for (const ann of pageAnnotations) {
      if (!marksMapRef.current.has(ann.id)) {
        toCreate.push(ann);
      } else {
        const existing = marksMapRef.current.get(ann.id)!;
        if (!container.contains(existing.element)) {
          // Mark was detached — recreate
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

    const sorted = toCreate.sort(
      (a, b) =>
        (b.location?.selection?.start ?? 0) - (a.location?.selection?.start ?? 0),
    );

    batchCreateMarks(containerRef, sorted, theme, marksMapRef, applyMarkStyle);
  }, [containerRef, pageAnnotations, pageAnnotationIds, currentPageIndex, theme, applyMarkStyle, contentReady]);

  // Effect 4: Content mutation guard — if the container's innerHTML is replaced
  // (e.g., by React reconciliation), rebuild all marks.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || pageAnnotations.length === 0) return;

    const observer = new MutationObserver(() => {
      // Check if any marks were removed from the DOM
      let needsRebuild = false;
      for (const [id, entry] of marksMapRef.current) {
        if (!container.contains(entry.element)) {
          needsRebuild = true;
          break;
        }
      }
      if (!needsRebuild) return;

      // Marks were removed — clear stale map entries and rebuild
      marksMapRef.current.clear();
      if (pageAnnotations.length === 0) return;

      const sorted = [...pageAnnotations].sort(
        (a, b) =>
          (b.location?.selection?.start ?? 0) - (a.location?.selection?.start ?? 0),
      );

      // Use rAF to ensure the DOM has settled after the mutation
      requestAnimationFrame(() => {
        batchCreateMarks(containerRef, sorted, theme, marksMapRef, applyMarkStyle);
      });
    });

    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [containerRef, pageAnnotations, theme, applyMarkStyle]);
}

// ────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ────────────────────────────────────────────────────────────────────────────

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

    try {
      range.surroundContents(mark);
    } catch {
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

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(255, 235, 59, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
