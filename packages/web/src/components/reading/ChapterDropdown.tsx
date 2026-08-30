'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, CheckCircle } from '@/components/icons';
import type { ReaderTheme } from '@/lib/reader-theme';

const OVERSCROLL_STYLE: React.CSSProperties = { overscrollBehavior: 'contain' };

interface ChapterItem {
 title: string;
}

interface ChapterItemRowProps {
 chapter: ChapterItem;
 index: number;
 isCurrent: boolean;
 theme: ReaderTheme;
 onPageChange: (page: number) => void;
 onClose: () => void;
 chapterLabel: string;
}

const ChapterItemRow = React.memo(function ChapterItemRow({
 chapter,
 index,
 isCurrent,
 theme,
 onPageChange,
 onClose,
 chapterLabel,
}: ChapterItemRowProps) {
 return (
  <button type="button"
   onClick={() => {
    onPageChange(index);
    onClose();
   }}
   className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 transition-colors ${
    isCurrent
     ? theme === 'dark'
     ? 'bg-amber-900/30 text-amber-300'
     : theme === 'sepia'
      ? 'bg-amber-200/50 text-amber-900'
      : 'bg-amber-100/60 text-amber-800'
     : theme === 'dark'
     ? 'text-gray-300 dark:text-gray-600 hover:bg-gray-700/60'
     : theme === 'sepia'
      ? 'text-amber-900/80 hover:bg-amber-100/40'
      : 'text-gray-700 dark:text-gray-300 hover:bg-amber-50'
   }`}
  >
   <span className={`flex-shrink-0 w-6 text-xs font-mono text-right ${
    isCurrent ? 'font-bold' : 'opacity-40'
   }`}>
    {index + 1}
   </span>
   <span className={`truncate ${isCurrent ? 'font-semibold' : ''}`}>
    {chapter.title?.trim() || chapterLabel}
   </span>
   {isCurrent && (
    <span className="flex-shrink-0 ml-auto">
     <CheckCircle className="w-4 h-4 text-amber-500" />
    </span>
   )}
  </button>
 );
});

interface ChapterDropdownProps {
 currentPage: number;
 totalPages: number;
 currentSegment: number;
 totalSegments: number;
 chapters: ChapterItem[];
 theme: ReaderTheme;
 onPageChange: (page: number) => void;
 externalTocOpen?: boolean;
 onTocClose?: () => void;
}

/**
 * Chapter dropdown / bottom-sheet for the reader footer.
 * Syncs with an external TOC toggle and closes on outside click.
 */
export const ChapterDropdown = React.memo(function ChapterDropdown({
 currentPage,
 totalPages,
 currentSegment,
 totalSegments,
 chapters,
 theme,
 onPageChange,
 externalTocOpen,
 onTocClose,
}: ChapterDropdownProps) {
 const t = useTranslations('reader');
 const [showChapterMenu, setShowChapterMenu] = React.useState(false);
 const chapterMenuRef = useRef<HTMLDivElement>(null);
 const prevTocOpenRef = useRef(externalTocOpen);

 // Sync with external TOC control
 useEffect(() => {
 if (externalTocOpen !== undefined && externalTocOpen !== prevTocOpenRef.current) {
  setShowChapterMenu(externalTocOpen);
 }
 prevTocOpenRef.current = externalTocOpen;
 }, [externalTocOpen]);

 const closeChapterMenu = useCallback(() => {
 setShowChapterMenu(false);
 onTocClose?.();
 }, [onTocClose]);

 // Close on outside click
 useEffect(() => {
 if (!showChapterMenu) return;
 const handleClickOutside = (e: MouseEvent) => {
  if (chapterMenuRef.current && !chapterMenuRef.current.contains(e.target as Node)) {
  closeChapterMenu();
  }
 };
 document.addEventListener('mousedown', handleClickOutside);
 return () => document.removeEventListener('mousedown', handleClickOutside);
 }, [showChapterMenu, closeChapterMenu]);

 return (
 <div className="flex-1 flex justify-center min-w-0 relative" ref={chapterMenuRef}>
  <button type="button"
  onClick={() => setShowChapterMenu((v) => !v)}
  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
   showChapterMenu
   ? theme === 'dark'
    ? 'bg-amber-900/40 text-amber-300'
    : theme === 'sepia'
    ? 'bg-amber-200/60 text-amber-800'
    : 'bg-amber-100/70 text-amber-700'
   : theme === 'dark'
    ? 'text-gray-400 dark:text-gray-500 hover:bg-white/5'
    : theme === 'sepia'
    ? 'text-amber-800/60 hover:bg-black/5'
    : 'text-gray-500 dark:text-gray-400 hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-amber-400'
  }`}
  aria-label={t('reader_open_chapter_list')}
  aria-expanded={showChapterMenu}
  >
  <span>{t('chapter_abbr')} {currentPage + 1}/{totalPages}{totalSegments > 1 ? ` · ${currentSegment + 1}/${totalSegments}` : ''}</span>
  <span className="hidden sm:inline opacity-50 truncate max-w-[140px]">
   {chapters[currentPage]?.title || ''}
  </span>
  <ChevronDown
   className={`w-3 h-3 opacity-50 transition-transform duration-200 ${showChapterMenu ? 'rotate-180' : ''}`}
  />
  </button>

  {/* Dropdown / bottom sheet */}
  {showChapterMenu && (
  <>
   {/* Mobile backdrop */}
   <div
   className="fixed inset-0 z-30 md:hidden bg-black/20 backdrop-blur-sm"
	   onClick={closeChapterMenu}
	   tabIndex={-1}
	   onKeyDown={(e) => { if (e.key === 'Escape') closeChapterMenu(); }}
/>

   {/* Dropdown panel — opens upward since footer is at bottom */}
   <div
   className={`absolute left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 sm:right-0 bottom-full z-40 mb-2 rounded-xl shadow-lg border max-h-[60vh] md:max-h-[40vh] overflow-y-auto w-64 sm:w-auto ${
    theme === 'dark'
    ? 'bg-gray-800 border-gray-700'
    : theme === 'sepia'
     ? 'bg-amber-50 border-amber-300/60'
     : 'bg-surface-0 border-amber-200/60'
   }`}
   style={OVERSCROLL_STYLE}
   tabIndex={-1}
   onKeyDown={(e) => { if (e.key === 'Escape') closeChapterMenu(); }}
   >
   {/* Header */}
   <div className={`sticky top-0 px-3 py-2 text-xs font-semibold uppercase tracking-wider border-b ${
    theme === 'dark'
    ? 'bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-700 dark:border-gray-700'
    : theme === 'sepia'
     ? 'bg-amber-50 text-amber-700 border-amber-300/60'
     : 'bg-surface-0 text-amber-600 border-amber-200/60'
   }`}>
    {t('toc_title')}
   </div>

   {chapters.map((ch, i) => (
    <ChapterItemRow
     key={ch.title + '-' + i}
     chapter={ch}
     index={i}
     isCurrent={i === currentPage}
     theme={theme}
     onPageChange={onPageChange}
     onClose={closeChapterMenu}
     chapterLabel={t('reader_chapter', { num: i + 1 })}
    />
   ))}
   </div>
  </>
  )}
 </div>
 );
});
