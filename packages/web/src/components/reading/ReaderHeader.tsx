'use client';

import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';

const BookmarkToggle = dynamic(() => import('@/components/reading/BookmarkToggle').then((m) => ({ default: m.BookmarkToggle })), { ssr: false });

interface ReaderHeaderProps {
  bookTitle: string;
  author?: string;
  currentChapter: number;
  totalChapters: number;
  readingWpm: number | null;
  isPaused: boolean;
  isBookmarked: boolean;
  annotationsCount: number;
  theme: 'light' | 'dark' | 'sepia';
  searchOpen: boolean;
  sidebarOpen: boolean;
  synthesisOpen: boolean;
  studyModeEnabled: boolean;
  onBack: () => void;
  onToggleBookmark: () => void;
  onToggleSearch: () => void;
  onToggleSidebar: () => void;
  onToggleSynthesis: () => void;
  onToggleStudyMode: () => void;
  onShowTimeline: () => void;
  onShowSettings: () => void;
  settingsMenu: React.ReactNode;
}

const HEADER_BG_CLASSES = {
  light: 'bg-[#fdfbf7]/95 border-amber-200/50',
  dark: 'bg-[#1a1f26]/95 border-amber-900/30',
  sepia: 'bg-[#f5f0e6]/95 border-amber-300/50',
} as const;

export function ReaderHeader(props: ReaderHeaderProps) {
  const {
    bookTitle, author, currentChapter, totalChapters, readingWpm, isPaused,
    isBookmarked, annotationsCount, theme, searchOpen, sidebarOpen, synthesisOpen,
    studyModeEnabled, onBack, onToggleBookmark, onToggleSearch, onToggleSidebar,
    onToggleSynthesis, onToggleStudyMode, onShowTimeline, onShowSettings, settingsMenu,
  } = props;
  const t = useTranslations('reader');

  return (
    <div className={`relative z-10 flex items-center justify-between px-3 py-2 backdrop-blur-sm ${HEADER_BG_CLASSES[theme]} shrink-0 border-b`}>
      {/* Left: Back + Book info */}
      <div className="flex items-center gap-2 min-w-0">
        <button onClick={onBack} className="flex items-center justify-center w-11 h-11 -ml-1 rounded-xl text-gray-400 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors" aria-label={t('back_to_library_label')}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="min-w-0">
          <h1 id="tour-reading-book" className="text-sm font-medium truncate text-gray-800 dark:text-gray-200">{bookTitle}</h1>
          <p id="tour-progress" className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
            {author && `${author} · `}{t('chapter_abbr')} {currentChapter + 1}/{totalChapters}
            {readingWpm && (
              <span className="ml-1.5 text-teal-500 dark:text-teal-400">· {readingWpm} {t('wpm')}</span>
            )}
            {isPaused && (
              <span className="ml-1.5 text-amber-500 dark:text-amber-400">· {t('paused')}</span>
            )}
          </p>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {/* Search */}
        <button onClick={onToggleSearch} className={`w-11 h-11 flex items-center justify-center rounded-lg text-sm transition-colors ${searchOpen ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20'}`} aria-label={t('search_label')}>
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>

        <BookmarkToggle isBookmarked={isBookmarked} onToggle={onToggleBookmark} />

        {/* Annotations */}
        <button id="tour-annotations" onClick={onToggleSidebar} className={`w-11 h-11 flex items-center justify-center rounded-lg text-sm transition-colors relative ${sidebarOpen ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20'}`} aria-label={t('annotations_label')}>
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
          {annotationsCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center rounded-full bg-amber-500 text-white text-[9px] font-bold">{annotationsCount}</span>
          )}
        </button>

        {/* Study mode */}
        <button onClick={onToggleStudyMode} className={`w-11 h-11 flex items-center justify-center rounded-lg text-sm transition-colors ${studyModeEnabled ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20'}`} aria-label={t('study_mode_label')} title={t('study_mode_title')}>
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </button>

        {/* Synthesis */}
        <button onClick={onToggleSynthesis} className={`w-11 h-11 hidden sm:flex items-center justify-center rounded-lg text-sm transition-colors ${synthesisOpen ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300' : 'text-gray-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20'}`} aria-label={t('synthesize_label')}>
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
        </button>

        {/* Chapter Timeline */}
        <button onClick={onShowTimeline} className="w-11 h-11 hidden sm:flex items-center justify-center rounded-lg text-sm transition-colors text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20" aria-label={t('chapter_timeline_label')} title={t('chapter_timeline_title')}>
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </button>

        {/* Settings */}
        <div className="relative">
          <button
            onClick={onShowSettings}
            className={`w-11 h-11 flex items-center justify-center rounded-lg text-sm transition-colors ${props.searchOpen ? '' : ''} text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20`}
            aria-label={t('settings_label')}
          >
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          {settingsMenu}
        </div>
      </div>
    </div>
  );
}
