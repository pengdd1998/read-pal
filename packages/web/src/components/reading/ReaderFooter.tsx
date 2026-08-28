'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from '@/components/icons';
import { progressBg, progressFill, type ReaderTheme } from '@/lib/reader-theme';

interface ReaderFooterProps {
 currentPage: number;
 totalPages: number;
 theme: ReaderTheme;
 overallProgress: number;
 showControls: boolean;
 onPauseAutoHide?: () => void;
 onResumeAutoHide?: () => void;
 onPrevPage: () => void;
 onNextPage: () => void;
 chapterDropdown: React.ReactNode;
 /** Minutes left in the current chapter (Kindle-style comfort cue). */
 chapterMinutesLeft?: number;
}

const FOOTER_CLASSES = {
 light: 'border-gray-100 dark:border-gray-800 bg-white/90',
 dark: 'border-gray-800 dark:border-gray-700/50 bg-gray-950/90',
 sepia: 'border-amber-200/40 bg-amber-100/90',
} as const;

export const ReaderFooter = React.memo(function ReaderFooter({
 currentPage,
 totalPages,
 theme,
 overallProgress,
 showControls,
 onPauseAutoHide,
 onResumeAutoHide,
 onPrevPage,
 onNextPage,
 chapterDropdown,
 chapterMinutesLeft,
}: ReaderFooterProps) {
 const t = useTranslations('reader');
 const clampedProgress = Math.min(100, Math.max(0, overallProgress));

 return (
 <footer
  className={`relative z-30 border-t transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${FOOTER_CLASSES[theme]} backdrop-blur-md ${
  showControls
   ? 'opacity-100 translate-y-0 shrink-0'
   : 'opacity-0 translate-y-2 pointer-events-none shrink-0'
  }`}
  onClick={(e) => e.stopPropagation()}
  onMouseEnter={onPauseAutoHide}
  onMouseLeave={onResumeAutoHide}
 >
  {/* Overall book progress */}
  <div className={`h-[3px] ${progressBg[theme]}`}>
  <div
   className={`h-full ${progressFill[theme]} transition-all duration-500 ease-out rounded-r-full`}
   style={{ width: `${clampedProgress}%` }}
  />
  </div>

  {/* Navigation row */}
  <div className="flex items-center px-1 sm:px-3 h-10">
  <button type="button"
   onClick={onPrevPage}
   disabled={currentPage === 0}
   className="w-10 h-8 sm:w-auto sm:px-3 sm:h-8 flex items-center justify-center gap-1 rounded-md text-xs font-medium disabled:opacity-20 disabled:cursor-not-allowed hover:bg-black/[0.04] dark:hover:bg-white/[0.04] active:bg-black/[0.08] dark:active:bg-white/[0.08] transition-all focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 shrink-0 text-gray-500 dark:text-gray-400"
   aria-label={t('reader_prev_chapter')}
  >
   <ChevronLeft className="w-4 h-4" />
   <span className="hidden sm:inline">{t('reader_prev')}</span>
  </button>

  <div className="flex-1 min-w-0">
   {chapterDropdown}
  </div>

  {/* Reading comfort cues: chapter time-left + book % (Kindle-style) */}
  <div
   className="hidden sm:flex items-center gap-2 text-[11px] font-medium text-gray-400 dark:text-gray-500 tabular-nums shrink-0 mr-1"
   aria-live="off"
  >
   {typeof chapterMinutesLeft === 'number' && chapterMinutesLeft > 0 && (
   <span title={t('chapter_time_left_title', { minutes: chapterMinutesLeft })}>
    {t('chapter_time_left', { minutes: chapterMinutesLeft })}
   </span>
   )}
   <span aria-hidden="true" className="opacity-40">·</span>
   <span>{Math.round(clampedProgress)}%</span>
  </div>

  <button type="button"
   onClick={onNextPage}
   disabled={currentPage >= totalPages - 1}
   className="w-10 h-8 sm:w-auto sm:px-3 sm:h-8 flex items-center justify-center gap-1 rounded-md text-xs font-medium disabled:opacity-20 disabled:cursor-not-allowed hover:bg-black/[0.04] dark:hover:bg-white/[0.04] active:bg-black/[0.08] dark:active:bg-white/[0.08] transition-all focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 shrink-0 text-gray-500 dark:text-gray-400"
   aria-label={t('reader_next_chapter')}
  >
   <span className="hidden sm:inline">{t('reader_next')}</span>
   <ChevronRight className="w-4 h-4" />
  </button>
  </div>
 </footer>
 );
});
