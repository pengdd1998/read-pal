'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { AnnotationItem } from '@/types/book';
import { useToast } from '@/components/Toast';
import { warn } from '@/lib/logger';

interface QuoteRowProps {
  h: AnnotationItem;
  index: number;
  isSharing: boolean;
  onShare: (text: string, idx: number) => void;
  shareLabel: string;
}

const QuoteRow = React.memo(function QuoteRow({ h, index, isSharing, onShare, shareLabel }: QuoteRowProps) {
  return (
   <div
   key={h.id}
   className="flex items-start gap-3 group p-2.5 rounded-xl hover:bg-amber-100/50 dark:hover:bg-amber-900/20 transition-colors"
   >
   <p className="flex-1 text-sm text-gray-700 dark:text-gray-300 italic line-clamp-2 leading-relaxed">
    &ldquo;{h.content}&rdquo;
   </p>
   <button type="button"
    onClick={() => onShare(h.content, index)}
    disabled={isSharing}
    className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-surface-0 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-amber-400"
   >
    {isSharing ? (
    <svg aria-hidden="true"
     className="w-3.5 h-3.5 animate-spin"
     fill="none"
     viewBox="0 0 24 24"
    >
     <circle
     className="opacity-25"
     cx="12"
     cy="12"
     r="10"
     stroke="currentColor"
     strokeWidth="4"
     />
     <path
     className="opacity-75"
     fill="currentColor"
     d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
     />
    </svg>
    ) : (
    <svg aria-hidden="true"
     className="w-3.5 h-3.5"
     fill="none"
     viewBox="0 0 24 24"
     stroke="currentColor"
     strokeWidth={2}
    >
     <path
     strokeLinecap="round"
     strokeLinejoin="round"
     d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
     />
    </svg>
    )}
    {shareLabel}
   </button>
   </div>
  );
});

interface ShareQuoteSectionProps {
  highlights: AnnotationItem[];
  bookTitle: string;
  bookAuthor: string;
  t: (key: string) => string;
}

export const ShareQuoteSection = React.memo(function ShareQuoteSection({
  highlights,
  bookTitle,
  bookAuthor,
  t,
}: ShareQuoteSectionProps) {
  const [sharingIdx, setSharingIdx] = useState<number | null>(null);
  const { toast } = useToast();
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const handleShareQuote = async (text: string, idx: number) => {
  setSharingIdx(idx);
  try {
   const canvas = document.createElement('canvas');
   const { renderCardToCanvas } = await import(
   '@/components/reading/QuoteCard'
   );
   if (!mountedRef.current) return;
   renderCardToCanvas(canvas, text, bookTitle, bookAuthor, 'warm');
   canvas.toBlob(async (blob) => {
   if (!blob) {
    if (mountedRef.current) setSharingIdx(null);
    return;
   }
   const file = new File([blob], 'read-pal-quote.png', {
    type: 'image/png',
   });
   if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
    await navigator.share({
     files: [file],
     title: `${bookTitle} — read-pal`,
     text: `"${text}" — ${bookAuthor || ''}`,
    });
    } catch (err) {
    if ((err as DOMException).name !== 'AbortError') {
     warn('ShareQuote: share failed', err);
     const url = URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     a.download = 'read-pal-quote.png';
     a.click();
     URL.revokeObjectURL(url);
    }
    }
   } else {
    try {
    await navigator.clipboard.write([
     new ClipboardItem({ 'image/png': blob }),
    ]);
    } catch (err) {
    warn("ShareQuoteSection: clipboard write failed", err);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'read-pal-quote.png';
    a.click();
    URL.revokeObjectURL(url);
    }
   }
   if (mountedRef.current) setSharingIdx(null);
   }, 'image/png');
  } catch (err) {
   warn("ShareQuoteSection: share failed", err);
   toast(t('share_failed'), 'error');
   if (mountedRef.current) setSharingIdx(null);
  }
  };

  return (
  <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/10 dark:to-orange-900/10 rounded-2xl border border-amber-200/50 dark:border-amber-800/30 p-5 mb-6 animate-slide-up stagger-4">
   <div className="flex items-center gap-3 mb-3">
   <span className="text-2xl">{'✨'}</span>
   <div>
    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
    {t('shareAQuote')}
    </h3>
    <p className="text-xs text-gray-500 dark:text-gray-400">
    {t('shareAQuoteDesc')}
    </p>
   </div>
   </div>
   <div className="space-y-2">
   {highlights.map((h, i) => (
    <QuoteRow
    key={h.id}
    h={h}
    index={i}
    isSharing={sharingIdx === i}
    onShare={handleShareQuote}
    shareLabel={t('share')}
    />
   ))}
   </div>
  </div>
  );
});
