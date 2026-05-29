'use client';

import { useCallback } from 'react';
import { copyToClipboard } from '@/lib/clipboard';
import { renderCardToCanvas } from './QuoteCardCanvas';
import type { CardTheme } from './QuoteCard';

interface UseQuoteCardActionsParams {
  text: string;
  bookTitle: string;
  author: string;
  theme: CardTheme;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  setDownloading: (v: boolean) => void;
  setCopied: (v: boolean) => void;
}

export function useQuoteCardActions({
  text,
  bookTitle,
  author,
  theme,
  canvasRef,
  setDownloading,
  setCopied,
}: UseQuoteCardActionsParams) {
  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current ?? document.createElement('canvas');
    setDownloading(true);

    try {
      renderCardToCanvas(canvas, text, bookTitle, author, theme);

      const link = document.createElement('a');
      const safeTitle = bookTitle.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 30);
      link.download = `read-pal-${safeTitle}-quote.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      // Graceful degradation
    } finally {
      setTimeout(() => setDownloading(false), 600);
    }
  }, [text, bookTitle, author, theme, canvasRef, setDownloading]);

  const handleCopyImage = useCallback(async () => {
    const canvas = canvasRef.current ?? document.createElement('canvas');
    renderCardToCanvas(canvas, text, bookTitle, author, theme);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    if (!blob) return;

    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: copy as text
      const formatted = `“${text}”\n— ${author}, ${bookTitle}`;
      await copyToClipboard(formatted);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text, bookTitle, author, theme, canvasRef, setCopied]);

  const handleNativeShare = useCallback(async () => {
    const canvas = canvasRef.current ?? document.createElement('canvas');
    renderCardToCanvas(canvas, text, bookTitle, author, theme);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    if (!blob) return;

    const file = new File([blob], 'read-pal-quote.png', { type: 'image/png' });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `${bookTitle} — read-pal`,
          text: `“${text}” — ${author}`,
        });
      } catch (err) {
        // User cancelled share sheet — not an error
        if ((err as DOMException).name !== 'AbortError') {
          // Fallback: download
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `read-pal-${bookTitle.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 30)}-quote.png`;
          a.click();
          URL.revokeObjectURL(url);
        }
      }
    } else {
      // Fallback: download image
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `read-pal-${bookTitle.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 30)}-quote.png`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [text, bookTitle, author, theme, canvasRef]);

  return { handleDownload, handleCopyImage, handleNativeShare };
}
