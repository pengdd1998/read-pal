'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from '@/components/icons';
import { progressBg, progressFill, type ReaderTheme } from '@/lib/reader-theme';

interface ChapterItem {
  title: string;
}

interface ReaderFooterProps {
  currentPage: number;
  totalPages: number;
  currentSegment: number;
  totalSegments: number;
  chapters: ChapterItem[];
  theme: ReaderTheme;
  overallProgress: number;
  showControls: boolean;
  onPauseAutoHide?: () => void;
  onResumeAutoHide?: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  chapterDropdown: React.ReactNode;
}

/**
 * Bottom navigation bar for the reader.
 * Renders progress bar, prev/next buttons, and the chapter dropdown.
 */
export function ReaderFooter({
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
}: ReaderFooterProps) {
  const t = useTranslations('reader');
  const clampedProgress = Math.min(100, Math.max(0, overallProgress));

  return (
    <footer
      className={`relative z-30 border-t transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
        theme === 'dark' ? 'border-gray-700/50 bg-gray-900/95' : theme === 'sepia' ? 'border-amber-200/60 bg-amber-50/95' : 'border-gray-200/60 bg-white/95'
      } backdrop-blur-sm ${
        showControls
          ? 'opacity-100 shrink-0'
          : 'opacity-0 pointer-events-none shrink-0'
      }`}
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={onPauseAutoHide}
      onMouseLeave={onResumeAutoHide}
    >
      {/* Progress bar — overall book progress */}
      <div className={`h-0.5 ${progressBg[theme]}`}>
        <div
          className={`h-0.5 ${progressFill[theme]} transition-all duration-300 ease-out`}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>

      {/* Three-zone navigation: prev | toc | next */}
      <div className="flex items-center px-1 sm:px-4 py-1.5">
        {/* Prev — fixed touch target */}
        <button
          onClick={onPrevPage}
          disabled={currentPage === 0}
          className="w-12 h-10 sm:w-auto sm:px-3 sm:h-9 flex items-center justify-center gap-1 rounded-lg text-sm font-medium disabled:opacity-20 disabled:cursor-not-allowed hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10 dark:active:bg-white/10 transition-colors shrink-0"
          aria-label={t('reader_prev_chapter')}
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="hidden sm:inline">{t('reader_prev')}</span>
        </button>

        {/* Center: chapter dropdown */}
        {chapterDropdown}

        {/* Next — fixed touch target */}
        <button
          onClick={onNextPage}
          disabled={currentPage >= totalPages - 1}
          className="w-12 h-10 sm:w-auto sm:px-3 sm:h-9 flex items-center justify-center gap-1 rounded-lg text-sm font-medium disabled:opacity-20 disabled:cursor-not-allowed hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10 dark:active:bg-white/10 transition-colors shrink-0"
          aria-label={t('reader_next_chapter')}
        >
          <span className="hidden sm:inline">{t('reader_next')}</span>
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </footer>
  );
}
