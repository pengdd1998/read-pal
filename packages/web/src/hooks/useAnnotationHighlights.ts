'use client';

import { useEffect, useRef, useCallback, useMemo, type RefObject } from 'react';
import type { Annotation } from '@read-pal/shared';
import {
  MARK_CLASS,
  batchCreateMarks,
  hexToRgba,
  unwrapAnnotationMarks,
} from '@/lib/annotation-marks';
import type { MarkEntry, ApplyStyleFn } from '@/lib/annotation-marks';

export type { MarkEntry } from '@/lib/annotation-marks';

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

  const applyMarkStyle = useCallback<ApplyStyleFn>(
    (mark, annotation, currentTheme) => {
      const color = annotation.color || '#fde68a';
      mark.style.backgroundColor = hexToRgba(
        color,
        currentTheme === 'dark' ? 0.35 : 0.45,
      );
      // Non-color semantics (UI-R-10): highlights must stay perceivable
      // without relying on hue — notes get a colored underline, and
      // prefers-contrast: more adds an underline to every highlight.
      mark.style.borderBottom = annotation.note
        ? `2px solid ${color}`
        : 'none';
      if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-contrast: more)').matches) {
        mark.style.textDecoration = 'underline';
        mark.style.textDecorationThickness = '2px';
        mark.style.textUnderlineOffset = '3px';
        mark.style.textDecorationColor = color;
      }
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
      const color = entry.annotation.color || '#fde68a';
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

    // Remove marks for deleted annotations (one annotation may own several
    // <mark> elements when its range crossed inline elements).
    for (const [id, entry] of marksMapRef.current) {
      if (!pageAnnotationIds.has(id)) {
        unwrapAnnotationMarks(container, id);
        void entry;
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
      let needsRebuild = false;
      for (const [, entry] of marksMapRef.current) {
        if (!container.contains(entry.element)) {
          needsRebuild = true;
          break;
        }
      }
      if (!needsRebuild) return;

      marksMapRef.current.clear();
      if (pageAnnotations.length === 0) return;

      const sorted = [...pageAnnotations].sort(
        (a, b) =>
          (b.location?.selection?.start ?? 0) - (a.location?.selection?.start ?? 0),
      );

      requestAnimationFrame(() => {
        batchCreateMarks(containerRef, sorted, theme, marksMapRef, applyMarkStyle);
      });
    });

    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [containerRef, pageAnnotations, theme, applyMarkStyle]);
}
