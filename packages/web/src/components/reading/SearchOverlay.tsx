'use client';

import React, { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { Chapter } from '@read-pal/shared';

interface SearchResult {
 index: number;
 title: string;
 snippet: string;
 titleMatch: boolean;
}

interface SearchOverlayProps {
 searchQuery: string;
 onQueryChange: (query: string) => void;
 currentChapter: number;
 chapters: Chapter[];
 onNavigate: (chapterIndex: number) => void;
 onClose: () => void;
}

export const SearchOverlay = React.memo(function SearchOverlay({
 searchQuery,
 onQueryChange,
 currentChapter,
 chapters,
 onNavigate,
 onClose,
}: SearchOverlayProps) {
 const t = useTranslations('reader');

 const searchResults = useMemo(() => {
 const q = searchQuery.trim().toLowerCase();
 if (q.length < 2) return [];
 return chapters
  .map((ch, i) => {
  const titleMatch = (ch.title || '').toLowerCase().includes(q);
  const contentLower = (ch.content || '').toLowerCase();
  const contentMatch = contentLower.includes(q);
  if (!titleMatch && !contentMatch) return null;
  let snippet = '';
  if (contentMatch) {
   const idx = contentLower.indexOf(q);
   const start = Math.max(0, idx - 40);
   const end = Math.min(ch.content!.length, idx + q.length + 40);
   snippet = (start > 0 ? '...' : '') +
   ch.content!.slice(start, end) +
   (end < ch.content!.length ? '...' : '');
  }
  return { index: i, title: ch.title || t('reader_chapter', { num: i + 1 }), snippet, titleMatch };
  })
  .filter(Boolean) as SearchResult[];
 }, [searchQuery, chapters, t]);

 return (
 <div
  className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm animate-fade-in"
  onClick={onClose}
  onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
  tabIndex={-1}
  aria-label={t('search_close')}
 >
  <div
  className="absolute top-16 left-1/2 -translate-x-1/2 w-full max-w-lg px-4"
  onClick={(e) => e.stopPropagation()}
  >
  <div className="bg-surface-0 rounded-2xl shadow-xl border border-surface-3 overflow-hidden">
   <div className="flex items-center gap-3 px-4 py-3">
   <svg aria-hidden="true" className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
   </svg>
   <input
    type="text"
    value={searchQuery}
    onChange={(e) => onQueryChange(e.target.value)}
    placeholder={t('search_in_book')}
    aria-label={t('search_in_book')}
    className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500/30"
    autoFocus
   />
   <span className="text-xs text-gray-500 dark:text-gray-400">
    {searchResults.length > 0 ? t('search_chapters', { count: searchResults.length }) : ''}
   </span>
   <button
    onClick={() => { onQueryChange(''); onClose(); }}
    aria-label={t('search_close')}
    className="p-2.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
   >
    <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
   </button>
   </div>

   {searchQuery.trim().length >= 2 && (
   <div className="max-h-64 overflow-y-auto border-t border-surface-2">
    {searchResults.length > 0 ? (
    searchResults.map((r) => (
    <SearchResultItem
     key={r.index}
     result={r}
     isCurrent={r.index === currentChapter}
     onNavigate={() => {
      onNavigate(r.index);
      onClose();
      onQueryChange('');
     }}
     t={t}
    />
    ))
    ) : (
    <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
     {t('search_no_results', { query: searchQuery })}
    </div>
    )}
   </div>
   )}
  </div>
  </div>
 </div>
 );
});

interface SearchResultItemProps {
 result: SearchResult;
 isCurrent: boolean;
 onNavigate: () => void;
 t: (key: string, params?: Record<string, string | number>) => string;
}

const SearchResultItem = React.memo(function SearchResultItem({
 result,
 isCurrent,
 onNavigate,
 t,
}: SearchResultItemProps) {
 return (
 <button
  onClick={onNavigate}
  className={`w-full text-left px-4 py-2.5 hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 ${
  isCurrent ? 'bg-amber-50/50 dark:bg-amber-900/5' : ''
  }`}
 >
 <div className="flex items-center gap-2">
  <span className="text-xs text-amber-500 font-mono font-bold">{result.index + 1}</span>
  <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
  {result.title}
  </span>
  {isCurrent && (
  <span className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full font-medium">
   {t('search_current')}
  </span>
  )}
 </div>
 {result.snippet && (
  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2 leading-relaxed pl-5">
  {result.snippet}
  </p>
 )}
 </button>
 );
});
