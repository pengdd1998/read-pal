'use client';

import { useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { copyToClipboard } from '@/lib/clipboard';
import { useToast } from '@/components/Toast';
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
  const tr = useTranslations('reader');
  const { toast } = useToast();
  const byLabel = tr('quote_card_by');
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current ?? document.createElement('canvas');
    setDownloading(true);

    try {
      renderCardToCanvas(canvas, text, bookTitle, author, theme, byLabel);

      const link = document.createElement('a');
      const safeTitle = bookTitle.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 30);
      link.download = `read-pal-${safeTitle}-quote.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.warn('useQuoteCardActions: failed to download quote card', err);
      toast(tr('quote_card_download_failed'), 'error');
    } finally {
      setTimeout(() => { if (mountedRef.current) setDownloading(false); }, 600);
    }
  }, [text, bookTitle, author, theme, canvasRef, setDownloading]);

  const handleCopyImage = useCallback(async () => {
    const canvas = canvasRef.current ?? document.createElement('canvas');
    renderCardToCanvas(canvas, text, bookTitle, author, theme, byLabel);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    if (!blob) return;

    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      setCopied(true);
      setTimeout(() => { if (mountedRef.current) setCopied(false); }, 2000);
    } catch (err) {
      console.warn('useQuoteCardActions: clipboard image copy failed, falling back to text', err);
      const formatted = `”${text}”\n— ${author}, ${bookTitle}`;
      await copyToClipboard(formatted);
      setCopied(true);
      setTimeout(() => { if (mountedRef.current) setCopied(false); }, 2000);
    }
  }, [text, bookTitle, author, theme, canvasRef, setCopied]);

  const handleNativeShare = useCallback(async () => {
    const canvas = canvasRef.current ?? document.createElement('canvas');
    renderCardToCanvas(canvas, text, bookTitle, author, theme, byLabel);

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
          console.warn('QuoteCard: share failed', err);
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
