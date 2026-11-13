'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { purifySync } from '@/lib/render/dompurify';
import { computePopoverPosition } from './popoverPosition';

export interface FootnotePopoverData {
  /** Marker text, e.g. "[3]" */
  marker: string;
  /** Sanitized footnote/note body HTML (already purified upstream) */
  html: string;
  /** Anchor element to position against */
  anchorEl: HTMLElement;
}

/**
 * Read-only footnote popover.
 *
 * - Wide viewports: floating card anchored near the clicked marker,
 *   viewport-clamped, flips above when the bottom is tight.
 * - Narrow viewports (<640px): bottom sheet drawer — no positioning math,
 *   always reachable, respects safe-area insets.
 * Closes on outside click, Escape, or scroll of any ancestor.
 */
export function FootnotePopover({ data, onClose }: {
  data: FootnotePopoverData;
  onClose: () => void;
}) {
  const t = useTranslations('reader');
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [isNarrow, setIsNarrow] = useState(false);

  // Track the breakpoint once per resize; drawer mode replaces positioning.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const apply = () => setIsNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useLayoutEffect(() => {
    if (isNarrow || !ref.current) return;
    const a = data.anchorEl.getBoundingClientRect();
    // The un-positioned frame is visibility:hidden (not display:none) with a
    // real width, so this rect carries the true content height. P8.1: with
    // display:none the rect was 0x0 — the flip and right-edge clamp below
    // silently never fired and bottom/right-edge popovers overflowed the
    // viewport on first open.
    const r = ref.current.getBoundingClientRect();
    setPos(computePopoverPosition(
      { top: a.top, bottom: a.bottom, left: a.left, width: a.width },
      { width: r.width, height: r.height },
      { width: window.innerWidth, height: window.innerHeight },
    ));
  }, [data, isNarrow]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !data.anchorEl.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onScroll = () => onClose();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    // Capture scroll from any scrollable ancestor (reader container).
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose, data.anchorEl]);

  const html = purifySync(data.html);

  const content = (
    <div className="flex items-start gap-2">
      <span className="flex-shrink-0 font-bold text-amber-700 dark:text-amber-300">{data.marker}</span>
      <div
        className="flex-1 prose-sm prose-p:my-1 text-amber-900 dark:text-amber-100"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <button
        type="button"
        onClick={onClose}
        className="flex-shrink-0 p-1 min-w-[32px] min-h-[32px] rounded text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/40"
        aria-label="close"
      >
        ✕
      </button>
    </div>
  );

  if (isNarrow) {
    // Bottom sheet drawer: fixed to the viewport bottom, safe-area aware.
    return createPortal(
      <div
        ref={ref}
        role="dialog"
        aria-label={t('footnote_popover_label', { marker: data.marker })}
        className="footnote-popover fixed inset-x-0 bottom-0 z-[60] rounded-t-2xl border-t border-amber-300/60 dark:border-amber-800/50 bg-amber-50/95 dark:bg-amber-950/85 shadow-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-sm"
      >
        {content}
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={t('footnote_popover_label', { marker: data.marker })}
      style={
        pos
          ? { position: 'fixed', top: pos.top, left: pos.left, width: 'min(420px, 90vw)' }
          // Measurable pre-position frame (P8.1): display:none collapsed the
          // rect to 0x0 so flip/clamp never fired on first open. Fixed at
          // 0,0 keeps it out of flow; useLayoutEffect repositions before
          // paint, so the hidden frame is never shown.
          : { position: 'fixed', top: 0, left: 0, width: 'min(420px, 90vw)', visibility: 'hidden' }
      }
      className="footnote-popover z-[60] rounded-xl border border-amber-300/60 dark:border-amber-800/50 bg-amber-50/95 dark:bg-amber-950/80 shadow-xl p-4 text-sm"
    >
      {content}
    </div>,
    document.body,
  );
}

