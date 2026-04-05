'use client';

import { useEffect, type RefObject } from 'react';
import type { Annotation } from '@read-pal/shared';

const MARK_CLASS = 'highlight-mark';
const DATA_ATTR = 'data-annotation-id';

/**
 * Renders annotation highlights as <mark> elements in the DOM.
 * Walks text nodes and wraps character ranges matching annotation locations.
 * Cleans up previous marks on each re-run.
 */
export function useAnnotationHighlights(
  containerRef: RefObject<HTMLElement | null>,
  annotations: Annotation[],
  currentPageIndex: number,
  theme: 'light' | 'dark' | 'sepia' = 'light',
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Remove previous highlight marks
    container.querySelectorAll(`.${MARK_CLASS}`).forEach((el) => {
      const parent = el.parentNode;
      if (parent) {
        // Replace <mark> with its text content
        while (el.firstChild) {
          parent.insertBefore(el.firstChild, el);
        }
        parent.removeChild(el);
        // Normalize merges adjacent text nodes
        parent.normalize();
      }
    });

    // Filter annotations for current page that have selection offsets
    const pageAnnotations = annotations.filter(
      (a) =>
        a.type !== 'bookmark' &&
        a.location?.pageIndex === currentPageIndex &&
        a.location?.selection &&
        typeof a.location.selection.start === 'number' &&
        typeof a.location.selection.end === 'number',
    );

    if (pageAnnotations.length === 0) return;

    // Sort by start offset descending so we apply from end to start
    // (this prevents offsets from shifting as we insert marks)
    const sorted = [...pageAnnotations].sort(
      (a, b) => (b.location?.selection?.start ?? 0) - (a.location?.selection?.start ?? 0),
    );

    for (const annotation of sorted) {
      const start = annotation.location!.selection!.start;
      const end = annotation.location!.selection!.end;

      // Walk text nodes to find the character range
      const result = findTextOffset(container, start, end - start);
      if (!result) continue;

      const { startNode, startOffset, endNode, endOffset } = result;

      try {
        const range = document.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);

        const mark = document.createElement('mark');
        mark.className = MARK_CLASS;
        mark.setAttribute(DATA_ATTR, annotation.id);
        mark.style.cursor = 'pointer';

        // Compute background color with transparency for readability
        const color = annotation.color || '#FFEB3B';
        mark.style.backgroundColor = hexToRgba(color, theme === 'dark' ? 0.35 : 0.45);
        mark.style.borderRadius = '2px';
        mark.style.padding = '1px 0';
        mark.style.transition = 'background-color 0.2s ease';

        // Add note indicator if annotation has a note
        if (annotation.note) {
          mark.style.borderBottom = `2px solid ${color}`;
        }

        range.surroundContents(mark);
      } catch {
        // surroundContents can fail if range crosses element boundaries
        // Fallback: skip this annotation
      }
    }
  }, [containerRef, annotations, currentPageIndex, theme]);
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
