'use client';

import type { RefObject } from 'react';
import type { Annotation } from '@read-pal/shared';

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
      const fragment = range.extractContents();
      mark.appendChild(fragment);
      range.insertNode(mark);
    }

    marksMap.set(annotation.id, { element: mark, annotation });
    return mark;
  } catch (err) {
    console.warn('createMark: failed for annotation', annotation.id, err);
    return null;
  }
}

export function findTextOffset(
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
