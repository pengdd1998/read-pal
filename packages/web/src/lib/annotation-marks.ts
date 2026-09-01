'use client';

import type { RefObject } from 'react';
import type { Annotation } from '@read-pal/shared';
import { warn } from './logger';

const MARK_CLASS = 'highlight-mark';
const DATA_ATTR = 'data-annotation-id';

export { MARK_CLASS, DATA_ATTR };

export interface MarkEntry {
  element: HTMLElement;
  annotation: Annotation;
}

export type ApplyStyleFn = (mark: HTMLElement, ann: Annotation, theme: string) => void;

export function batchCreateMarks(
  containerRef: RefObject<HTMLElement | null>,
  sorted: Annotation[],
  theme: string,
  marksMap: React.MutableRefObject<Map<string, MarkEntry>>,
  applyStyle: ApplyStyleFn,
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

export function createMark(
  container: HTMLElement,
  annotation: Annotation,
  currentTheme: string,
  marksMap: Map<string, MarkEntry>,
  applyStyle: ApplyStyleFn,
): HTMLElement | null {
  const selection = annotation.location?.selection;
  if (!selection) return null;
  const start = selection.start;
  const end = selection.end;

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
      // Range crosses inline element boundaries. extractContents() here used
      // to TEAR PARAGRAPHS IN HALF at the highlight edges — the stored
      // document was clean but the DOM rendered "…and giga</p></mark><p>ntic…"
      // (words cut mid-syllable). Wrap text-node-by-text-node instead: the
      // paragraph structure survives, one annotation just gets several
      // adjacent <mark> elements sharing the same data-annotation-id.
      wrapRangeWithMarks(range, mark);
    }

    marksMap.set(annotation.id, { element: mark, annotation });
    return mark;
  } catch (err) {
    warn('createMark: failed for annotation', annotation.id, err);
    return null;
  }
}

/** Unwrap every <mark> carrying the annotation id (one annotation may own
 * several marks when its range crossed inline elements). */
export function unwrapAnnotationMarks(container: HTMLElement, annotationId: string): void {
  const selector = `[${DATA_ATTR}="${annotationId.replace(/"/g, '\\"')}"]`;
  container.querySelectorAll(selector).forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    parent.normalize();
  });
}

function wrapRangeWithMarks(range: Range, template: HTMLElement): void {
  // Split boundary text nodes (end first — splitting start first can detach
  // the end container when both fall in the same node) so the range edges
  // land on node boundaries. Every remaining intersecting text node is then
  // fully inside the range and can be wrapped atomically.
  if (range.endContainer.nodeType === Node.TEXT_NODE) {
    const t = range.endContainer as Text;
    if (range.endOffset > 0 && range.endOffset < t.length) {
      t.splitText(range.endOffset);
      range.setEnd(t, t.length);
    }
  }
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const t = range.startContainer as Text;
    if (range.startOffset > 0 && range.startOffset < t.length) {
      range.setStart(t.splitText(range.startOffset), 0);
    }
  }

  const root = range.commonAncestorContainer;
  const walkRoot =
    root.nodeType === Node.TEXT_NODE ? (root.parentNode as Node) : root;
  const walker = document.createTreeWalker(walkRoot, NodeFilter.SHOW_TEXT);

  const targets: Text[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (node.textContent && range.intersectsNode(node)) targets.push(node);
  }
  for (const t of targets) {
    const m = template.cloneNode(false) as HTMLElement;
    t.replaceWith(m);
    m.appendChild(t);
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

export function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(255, 235, 59, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
