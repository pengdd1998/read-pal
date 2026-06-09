'use client';

import { useCallback } from 'react';
import { renderCardToCanvas } from '@/components/reading/QuoteCard';

export function useShareAsImage(
  quoteText: string,
  bookTitle: string,
  author: string,
  fallbackBookTitle: string,
  fallbackAuthor: string,
) {
  return useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!quoteText) return;

    try {
      const canvas = document.createElement('canvas');
      renderCardToCanvas(
        canvas,
        quoteText,
        bookTitle || fallbackBookTitle,
        author || fallbackAuthor,
        'warm',
      );

      await new Promise<void>((resolve, reject) => {
        canvas.toBlob(async (blob) => {
          if (!blob) { resolve(); return; }

          const file = new File([blob], 'read-pal-quote.png', { type: 'image/png' });

          // Try Web Share API with file (mobile)
          if (navigator.share && navigator.canShare?.({ files: [file] })) {
            try {
              await navigator.share({
                files: [file],
                title: `${bookTitle || 'Book'} — read-pal`,
                text: `"${quoteText}" — ${author || ''}`,
              });
            } catch (err) {
              if ((err as DOMException).name !== 'AbortError') {
                console.warn('ShareAsImage: share failed', err);
                downloadBlob(blob);
              }
            }
          } else {
            // Desktop: try clipboard, then download
            try {
              await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob }),
              ]);
            } catch (err) {
              console.warn("useShareAsImage: clipboard write failed, falling back to download", err);
              downloadBlob(blob);
            }
          }
          resolve();
        }, 'image/png');
      });
    } catch (err) {
      console.warn('useShareAsImage: share failed', err);
    }
  }, [quoteText, bookTitle, author, fallbackBookTitle, fallbackAuthor]);
}

function downloadBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'read-pal-quote.png';
  a.click();
  URL.revokeObjectURL(url);
}
