'use client';

import { useMemo } from 'react';
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

export function SearchOverlay({
  searchQuery,
  onQueryChange,
  currentChapter,
  chapters,
  onNavigate,
  onClose,
}: SearchOverlayProps) {
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
        return { index: i, title: ch.title || `Chapter ${i + 1}`, snippet, titleMatch };
      })
      .filter(Boolean) as SearchResult[];
  }, [searchQuery, chapters]);

  return (
    <div
      className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      tabIndex={-1}
      role="button"
      aria-label="Close search"
    >
      <div
        className="absolute top-16 left-1/2 -translate-x-1/2 w-full max-w-lg px-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search in this book..."
              aria-label="Search in this book"
              className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none"
              autoFocus
            />
            <span className="text-xs text-gray-400">
              {searchResults.length > 0 ? `${searchResults.length} chapters` : ''}
            </span>
            <button
              onClick={() => { onQueryChange(''); onClose(); }}
              className="p-2 -m-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {searchQuery.trim().length >= 2 && (
            <div className="max-h-64 overflow-y-auto border-t border-gray-100 dark:border-gray-800">
              {searchResults.length > 0 ? (
                searchResults.map((r) => (
                  <button
                    key={r.index}
                    onClick={() => {
                      onNavigate(r.index);
                      onClose();
                      onQueryChange('');
                    }}
                    className={`w-full text-left px-4 py-2.5 hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-colors ${
                      r.index === currentChapter ? 'bg-amber-50/50 dark:bg-amber-900/5' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-amber-500 font-mono font-bold">{r.index + 1}</span>
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                        {r.title}
                      </span>
                      {r.index === currentChapter && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full font-medium">
                          Current
                        </span>
                      )}
                    </div>
                    {r.snippet && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2 leading-relaxed pl-5">
                        {r.snippet}
                      </p>
                    )}
                  </button>
                ))
              ) : (
                <div className="px-4 py-6 text-center text-sm text-gray-400">
                  No results for &ldquo;{searchQuery}&rdquo;
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
