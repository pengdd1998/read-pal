'use client';

import React, { useState, useRef, useCallback, memo } from 'react';
import { useTranslations } from 'next-intl';
import { THEMES } from './QuoteCardCanvas';
import { useQuoteCardActions } from './useQuoteCardActions';

export type CardTheme = 'warm' | 'dark';

export { renderCardToCanvas } from './QuoteCardCanvas';

interface QuoteCardProps {
 text: string;
 bookTitle: string;
 author: string;
 onClose: () => void;
}

export const QuoteCard = memo(function QuoteCard({ text, bookTitle, author, onClose }: QuoteCardProps) {
 const [theme, setTheme] = useState<CardTheme>('warm');
 const [downloading, setDownloading] = useState(false);
 const [copied, setCopied] = useState(false);
 const canvasRef = useRef<HTMLCanvasElement>(null);
 const t = THEMES[theme];
 const tc = useTranslations('common');
 const tr = useTranslations('reader');

 const { handleDownload, handleCopyImage, handleNativeShare } = useQuoteCardActions({
 text,
 bookTitle,
 author,
 theme,
 canvasRef,
 setDownloading,
 setCopied,
 });

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
  aria-label={tc('share_quote_card')}
 >
  {/* Backdrop */}
  <div className="absolute inset-0 bg-black/60 dark:bg-surface-0/80 backdrop-blur-sm" />

  {/* Hidden canvas for rendering */}
  <canvas ref={canvasRef} className="hidden" width={1200} height={630} aria-hidden="true" />

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
   {'“'}
   </div>

   {/* Closing quotation mark */}
   <div
   className={`absolute bottom-2 right-6 font-serif font-bold text-[100px] leading-none select-none pointer-events-none ${t.quoteMarkColor}`}
   aria-hidden="true"
   >
   {'”'}
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
    {tr('quote_by_author', { author })}
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
   <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium">
    {tr('theme_label')}
   </span>
   <button
    onClick={() => setTheme('warm')}
    className={`w-7 h-7 rounded-full bg-gradient-to-br from-amber-100 via-orange-100 to-amber-200 border-2 transition-all duration-200 ${
    theme === 'warm'
     ? 'border-amber-500 scale-110 shadow-glow-amber'
     : 'border-transparent hover:border-amber-300 hover:scale-105'
    }`}
    aria-label={tc('warm_theme')}
   />
   <button
    onClick={() => setTheme('dark')}
    className={`w-7 h-7 rounded-full bg-gradient-to-br from-gray-800 via-gray-700 to-gray-900 border-2 transition-all duration-200 ${
    theme === 'dark'
     ? 'border-amber-500 scale-110 shadow-glow-amber'
     : 'border-transparent hover:border-gray-500 hover:scale-105'
    }`}
    aria-label={tc('dark_theme')}
   />
   </div>

   {/* Action buttons */}
   <div className="flex items-center gap-2">
   {/* Copy Image */}
   <button
    onClick={handleCopyImage}
    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 active:scale-95 bg-white/10 dark:bg-white/5 text-gray-300 hover:bg-white/20 border border-white/10 hover:border-white/20"
    title={tc('copy_image_to_clipboard')}
   aria-label={tc('copy_image_to_clipboard')}
   >
    {copied ? (
    <>
     <svg aria-hidden="true" className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
     </svg>
     <span className="text-emerald-400">{tr('toolbar_copied')}</span>
    </>
    ) : (
    <>
     <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
     </svg>
     <span className="hidden sm:inline">{tr('toolbar_copy')}</span>
    </>
    )}
   </button>

   {/* Native Share / Download */}
   <button
    onClick={handleNativeShare}
    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 active:scale-95 bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-600 hover:to-amber-700 shadow-md hover:shadow-lg focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
    title={typeof navigator.share === 'function' ? tc('share_via_apps') : tc('download_image')}
   aria-label={typeof navigator.share === 'function' ? tc('share_via_apps') : tc('download_image')}
   >
    <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
    </svg>
    <span>{typeof navigator.share === 'function' ? tr('toolbar_share') : tc('download_image')}</span>
   </button>

   {/* Download Image */}
   <button
    onClick={handleDownload}
    disabled={downloading}
    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 active:scale-95 bg-white/10 dark:bg-white/5 text-gray-300 hover:bg-white/20 border border-white/10 hover:border-white/20 disabled:opacity-60 disabled:cursor-not-allowed"
    title={tc('download_as_png')}
    aria-label={tc('download_as_png')}
   >
    {downloading ? (
    <>
     <svg aria-hidden="true" className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
     <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
     <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
     </svg>
    </>
    ) : (
    <>
     <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
     </svg>
    </>
    )}
   </button>

   {/* Close */}
   <button
    onClick={onClose}
    className="flex items-center justify-center w-11 h-11 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 border border-white/5 transition-all duration-200 active:scale-95"
    aria-label={tr('share_close_quote')}
   >
    <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
   </button>
   </div>
  </div>
  </div>
 </div>
 );
});