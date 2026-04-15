'use client';

import { useState, useRef, useCallback } from 'react';
import { copyToClipboard } from '@/lib/clipboard';

interface QuoteCardProps {
  text: string;
  bookTitle: string;
  author: string;
  onClose: () => void;
}

export type CardTheme = 'warm' | 'dark';

const THEMES: Record<CardTheme, {
  label: string;
  bg: string;
  bgGradient: string;
  textColor: string;
  accentColor: string;
  quoteMarkColor: string;
  titleColor: string;
  watermarkColor: string;
  canvasStops: [number, string, number, string][];
  canvasText: string;
  canvasTitle: string;
  canvasWatermark: string;
  canvasQuoteMark: string;
}> = {
  warm: {
    label: 'Warm',
    bg: 'bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100',
    bgGradient: '',
    textColor: 'text-amber-950',
    accentColor: 'border-amber-300/60',
    quoteMarkColor: 'text-amber-200/70',
    titleColor: 'text-amber-700',
    watermarkColor: 'text-amber-400/50',
    canvasStops: [
      [0, '#FFFBEB', 0.3, '#FFF7ED'],
      [0.6, '#FEF3C7', 1, '#FDE68A'],
    ],
    canvasText: '#451A03',
    canvasTitle: '#B45309',
    canvasWatermark: 'rgba(217, 119, 6, 0.35)',
    canvasQuoteMark: 'rgba(253, 230, 138, 0.6)',
  },
  dark: {
    label: 'Dark',
    bg: 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900',
    bgGradient: '',
    textColor: 'text-gray-100',
    accentColor: 'border-amber-500/30',
    quoteMarkColor: 'text-amber-500/20',
    titleColor: 'text-amber-400',
    watermarkColor: 'text-gray-600',
    canvasStops: [
      [0, '#111827', 0.4, '#1F2937'],
      [0.7, '#1F2937', 1, '#111827'],
    ],
    canvasText: '#F3F4F6',
    canvasTitle: '#FBBF24',
    canvasWatermark: 'rgba(107, 114, 128, 0.5)',
    canvasQuoteMark: 'rgba(245, 158, 11, 0.15)',
  },
};

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

export function renderCardToCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  bookTitle: string,
  author: string,
  theme: CardTheme,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = 1200;
  const H = 630;
  const pad = 80;
  const t = THEMES[theme];

  canvas.width = W;
  canvas.height = H;

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, W, H);
  for (const [stop, color] of t.canvasStops) {
    grad.addColorStop(stop, color);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Subtle noise texture via tiny dots
  ctx.globalAlpha = 0.03;
  for (let i = 0; i < 800; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = Math.random() * 1.5;
    ctx.fillStyle = theme === 'warm' ? '#92400E' : '#FBBF24';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Decorative border line
  ctx.strokeStyle = theme === 'warm'
    ? 'rgba(217, 119, 6, 0.2)'
    : 'rgba(251, 191, 36, 0.15)';
  ctx.lineWidth = 1;
  const inset = 32;
  ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);

  // Large quotation mark watermark
  ctx.font = 'bold 280px Georgia, serif';
  ctx.fillStyle = t.canvasQuoteMark;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('\u201C', pad - 20, pad - 60);

  // Quote text
  const quoteFontSize = text.length > 200 ? 28 : text.length > 120 ? 32 : 38;
  ctx.font = `italic ${quoteFontSize}px Georgia, "Times New Roman", serif`;
  ctx.fillStyle = t.canvasText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const maxTextWidth = W - pad * 2 - 40;
  const lines = wrapText(ctx, text, maxTextWidth);
  const lineHeight = quoteFontSize * 1.6;
  const textBlockHeight = lines.length * lineHeight;
  const textStartY = (H - textBlockHeight) / 2 - 20;

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], W / 2, textStartY + i * lineHeight);
  }

  // Thin separator
  const sepY = textStartY + textBlockHeight + 30;
  ctx.strokeStyle = theme === 'warm'
    ? 'rgba(180, 83, 9, 0.25)'
    : 'rgba(251, 191, 36, 0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 40, sepY);
  ctx.lineTo(W / 2 + 40, sepY);
  ctx.stroke();

  // Book title & author
  const metaY = sepY + 20;
  ctx.font = '16px "DM Sans", system-ui, sans-serif';
  ctx.fillStyle = t.canvasTitle;
  ctx.textAlign = 'center';
  ctx.fillText(`${bookTitle}`, W / 2, metaY);

  ctx.font = 'italic 14px Georgia, serif';
  ctx.fillStyle = t.canvasTitle;
  ctx.globalAlpha = 0.7;
  ctx.fillText(`by ${author}`, W / 2, metaY + 24);
  ctx.globalAlpha = 1;

  // Watermark
  ctx.font = '11px "DM Sans", system-ui, sans-serif';
  ctx.fillStyle = t.canvasWatermark;
  ctx.textAlign = 'right';
  ctx.fillText('read-pal', W - inset - 8, H - inset - 4);

  // Closing quote mark (small, bottom-right of text block)
  ctx.font = 'bold 120px Georgia, serif';
  ctx.fillStyle = t.canvasQuoteMark;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('\u201D', W - pad + 20, textStartY + textBlockHeight + 10);
}

export function QuoteCard({ text, bookTitle, author, onClose }: QuoteCardProps) {
  const [theme, setTheme] = useState<CardTheme>('warm');
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const t = THEMES[theme];

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
  }, [text, bookTitle, author, theme]);

  const handleCopy = useCallback(async () => {
    const formatted = `\u201C${text}\u201D\n\u2014 ${author}, ${bookTitle}`;
    const ok = await copyToClipboard(formatted);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text, author, bookTitle]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  // Truncate long quotes for display
  const displayText = text.length > 300 ? `${text.slice(0, 300)}...` : text;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 animate-fade-in"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Share quote card"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm" />

      {/* Hidden canvas for rendering */}
      <canvas ref={canvasRef} className="hidden" width={1200} height={630} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-2xl animate-scale-in">
        {/* Card Preview */}
        <div
          className={`${t.bg} rounded-2xl shadow-lg overflow-hidden border ${t.accentColor} relative aspect-[1200/630]`}
        >
          {/* Decorative inner border */}
          <div className="absolute inset-3 rounded-xl border border-current opacity-10 pointer-events-none" />

          {/* Quotation mark watermark */}
          <div
            className={`absolute top-4 left-6 font-serif font-bold text-[180px] leading-none select-none pointer-events-none ${t.quoteMarkColor}`}
            aria-hidden="true"
          >
            {'\u201C'}
          </div>

          {/* Closing quotation mark */}
          <div
            className={`absolute bottom-2 right-6 font-serif font-bold text-[100px] leading-none select-none pointer-events-none ${t.quoteMarkColor}`}
            aria-hidden="true"
          >
            {'\u201D'}
          </div>

          {/* Quote content */}
          <div className="relative z-10 flex flex-col items-center justify-center h-full px-16 sm:px-20 py-10">
            <blockquote
              className={`font-serif text-lg sm:text-xl leading-relaxed text-center italic ${t.textColor}`}
            >
              {displayText}
            </blockquote>

            {/* Separator */}
            <div className="mt-5 mb-3 w-10 h-px bg-current opacity-25" />

            {/* Attribution */}
            <cite className="not-italic">
              <span className={`block text-sm font-medium ${t.titleColor}`}>
                {bookTitle}
              </span>
              <span className={`block text-xs mt-0.5 ${t.titleColor} opacity-70`}>
                by {author}
              </span>
            </cite>

            {/* Watermark */}
            <span
              className={`absolute bottom-4 right-5 text-[10px] tracking-wider font-sans uppercase ${t.watermarkColor}`}
            >
              read-pal
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {/* Theme selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">
              Theme
            </span>
            <button
              onClick={() => setTheme('warm')}
              className={`w-7 h-7 rounded-full bg-gradient-to-br from-amber-100 via-orange-100 to-amber-200 border-2 transition-all duration-200 ${
                theme === 'warm'
                  ? 'border-amber-500 scale-110 shadow-glow-amber'
                  : 'border-transparent hover:border-amber-300 hover:scale-105'
              }`}
              aria-label="Warm theme"
            />
            <button
              onClick={() => setTheme('dark')}
              className={`w-7 h-7 rounded-full bg-gradient-to-br from-gray-800 via-gray-700 to-gray-900 border-2 transition-all duration-200 ${
                theme === 'dark'
                  ? 'border-amber-500 scale-110 shadow-glow-amber'
                  : 'border-transparent hover:border-gray-500 hover:scale-105'
              }`}
              aria-label="Dark theme"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {/* Copy to Clipboard */}
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 active:scale-95 bg-white/10 dark:bg-white/5 text-gray-300 hover:bg-white/20 border border-white/10 hover:border-white/20"
            >
              {copied ? (
                <>
                  <svg
                    className="w-4 h-4 text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  <span>Copy Text</span>
                </>
              )}
            </button>

            {/* Download Image */}
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-medium transition-all duration-200 active:scale-95 bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-600 hover:to-amber-700 shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {downloading ? (
                <>
                  <svg
                    className="w-4 h-4 animate-spin"
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
                  <span>Rendering...</span>
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  <span>Download Image</span>
                </>
              )}
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="flex items-center justify-center w-11 h-11 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 border border-white/5 transition-all duration-200 active:scale-95"
              aria-label="Close"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
