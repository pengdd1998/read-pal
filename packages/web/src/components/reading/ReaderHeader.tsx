'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';

const BookmarkToggle = dynamic(() => import('@/components/reading/BookmarkToggle').then((m) => ({ default: m.BookmarkToggle })), { ssr: false });
const OfflineSaveButton = dynamic(() => import('@/components/reading/OfflineSaveButton').then((m) => ({ default: m.OfflineSaveButton })), { ssr: false });

interface ReaderHeaderProps {
 bookId: string;
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
 settingsMenuOpen: boolean;
 timelineOpen: boolean;
 readingPlanOpen: boolean;
 onBack: () => void;
 onToggleBookmark: () => void;
 onToggleSearch: () => void;
 onToggleSidebar: () => void;
 onToggleSynthesis: () => void;
 onToggleStudyMode: () => void;
 onShowTimeline: () => void;
 onShowSettings: () => void;
 onToggleReadingPlan: () => void;
 settingsMenu: React.ReactNode;
}

const HEADER_CLASSES = {
 light: 'bg-white/80 border-gray-100',
 dark: 'bg-gray-950/80 border-gray-800/50',
 sepia: 'bg-amber-100/80 border-amber-200/40',
} as const;

const ICON_BASE = 'w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-150';
const ICON_IDLE = `${ICON_BASE} text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100/80 dark:hover:bg-gray-700/60 active:bg-gray-200/60`;

function ActiveIconStyle(theme: string, color: 'amber' | 'teal' | 'purple' = 'amber') {
 const colors = {
 amber: { light: 'bg-amber-50 text-amber-700', dark: 'dark:bg-amber-900/30 dark:text-amber-300', sepia: 'bg-amber-100/60 text-amber-800' },
 teal: { light: 'bg-teal-50 text-teal-700', dark: 'dark:bg-teal-900/30 dark:text-teal-300', sepia: 'bg-teal-50/60 text-teal-700' },
 purple: { light: 'bg-violet-50 text-violet-700', dark: 'dark:bg-violet-900/30 dark:text-violet-300', sepia: 'bg-violet-50/60 text-violet-700' },
 };
 const c = colors[color][theme as keyof typeof colors.amber] || colors.amber.light;
 return `${ICON_BASE} ${c}`;
}

export function ReaderHeader(props: ReaderHeaderProps) {
 const {
 bookId, bookTitle, author, currentChapter, totalChapters, readingWpm, isPaused,
 isBookmarked, annotationsCount, theme, searchOpen, sidebarOpen, synthesisOpen,
 studyModeEnabled, settingsMenuOpen, timelineOpen, readingPlanOpen, onBack, onToggleBookmark,
 onToggleSearch, onToggleSidebar, onToggleSynthesis, onToggleStudyMode,
 onShowTimeline, onShowSettings, onToggleReadingPlan, settingsMenu,
 } = props;
 const t = useTranslations('reader');
 const [moreOpen, setMoreOpen] = useState(false);

 return (
 <div className={`relative z-40 flex items-center justify-between px-2 sm:px-3 h-12 backdrop-blur-md ${HEADER_CLASSES[theme]} border-b shrink-0`}>
  {/* Left: Back + Book info */}
  <div className="flex items-center gap-1.5 min-w-0 flex-1">
  <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100/60 dark:hover:bg-gray-700/40 transition-all active:scale-95" aria-label={t('back_to_library_label')}>
   <svg aria-hidden="true" className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
   </svg>
  </button>
  <div className="min-w-0">
   <h1 className="text-[13px] font-medium truncate text-gray-700 dark:text-gray-300 leading-tight">{bookTitle}</h1>
   <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate leading-tight mt-px">
   {author && <span>{author} · </span>}
   {t('chapter_abbr')} {currentChapter + 1}/{totalChapters}
   {readingWpm && <span className="ml-1 text-teal-500/80 dark:text-teal-400/70">· {readingWpm} {t('wpm')}</span>}
   {isPaused && <span className="ml-1 text-amber-500/70">· {t('paused')}</span>}
   </p>
  </div>
  </div>

  {/* Right: Primary actions */}
  <div className="flex items-center gap-0.5 flex-shrink-0">
  <button onClick={onToggleSearch} className={searchOpen ? ActiveIconStyle(theme) : ICON_IDLE} aria-label={t('search_label')}>
   <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
   </svg>
  </button>

  <BookmarkToggle isBookmarked={isBookmarked} onToggle={onToggleBookmark} />

  <button onClick={onToggleSidebar} className={`${sidebarOpen ? ActiveIconStyle(theme) : ICON_IDLE} relative`} aria-label={t('annotations_label')}>
   <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
   </svg>
   {annotationsCount > 0 && (
   <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-amber-500 text-white text-[8px] font-bold leading-none px-0.5">{annotationsCount}</span>
   )}
  </button>

  {/* More actions toggle */}
  <div className="relative">
   <button
   onClick={() => setMoreOpen(!moreOpen)}
   className={moreOpen ? ActiveIconStyle(theme) : ICON_IDLE}
   aria-label={t('settings_label')}
   >
   <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
   </svg>
   </button>

   {/* Dropdown menu for secondary actions */}
   {moreOpen && (
   <>
    <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} onKeyDown={(e) => { if (e.key === 'Escape') setMoreOpen(false); }} tabIndex={-1} />
    <div className={`absolute right-0 top-full mt-1 z-50 w-52 py-1 rounded-xl shadow-lg border ${
    theme === 'dark' ? 'bg-gray-900 border-gray-800' : theme === 'sepia' ? 'bg-amber-100 border-amber-200/60' : 'bg-white border-gray-100'
    }`}>
    {/* Study mode */}
    <button onClick={() => { onToggleStudyMode(); setMoreOpen(false); }} aria-label={t('study_mode_title')} className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2.5 transition-colors ${
     studyModeEnabled ? 'text-amber-700 dark:text-amber-300 bg-amber-50/50 dark:bg-amber-900/20' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50/40 dark:hover:bg-gray-700/40'
    }`}>
     <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
     </svg>
     {t('study_mode_title')}
    </button>

    {/* Synthesis */}
    <button onClick={() => { onToggleSynthesis(); setMoreOpen(false); }} aria-label={t('synthesize_label')} className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2.5 transition-colors ${
     synthesisOpen ? 'text-teal-700 dark:text-teal-300 bg-teal-50/50 dark:bg-teal-900/20' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50/40 dark:hover:bg-gray-700/40'
    }`}>
     <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
     </svg>
     {t('synthesize_label')}
    </button>

    {/* Reading plan */}
    <button onClick={() => { onToggleReadingPlan(); setMoreOpen(false); }} aria-label={t('reading_plan_title')} className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2.5 transition-colors ${
     readingPlanOpen ? 'text-amber-700 dark:text-amber-300 bg-amber-50/50 dark:bg-amber-900/20' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50/40 dark:hover:bg-gray-700/40'
    }`}>
     <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
     </svg>
     {t('reading_plan_title')}
    </button>

    {/* Chapter timeline */}
    <button onClick={() => { onShowTimeline(); setMoreOpen(false); }} aria-label={t('chapter_timeline_title')} className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2.5 transition-colors ${
     timelineOpen ? 'text-violet-700 dark:text-violet-300 bg-violet-50/50 dark:bg-violet-900/20' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50/40 dark:hover:bg-gray-700/40'
    }`}>
     <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
     </svg>
     {t('chapter_timeline_title')}
    </button>

    <OfflineSaveButton bookId={bookId} />

    <div className={`my-1 h-px ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'}`} />

    {/* Settings */}
    <button onClick={() => { onShowSettings(); setMoreOpen(false); }} aria-label={t('settings_label')} className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2.5 transition-colors ${
     settingsMenuOpen ? 'text-amber-700 dark:text-amber-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50/40 dark:hover:bg-gray-700/40'
    }`}>
     <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
     <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
     </svg>
     {t('settings_label')}
    </button>
    </div>
   </>
   )}
  </div>
  </div>

  {/* Settings dropdown (rendered outside the flow so it positions correctly) */}
  {settingsMenu}
 </div>
 );
}
