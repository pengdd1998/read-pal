'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { LibraryGrid } from '@/components/library/LibraryGrid';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';

interface FreeBook {
  title: string;
  author: string;
  coverUrl?: string;
  subjects?: string[];
  downloadUrl?: string;
}

export default function LibraryPage() {
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [suggestions, setSuggestions] = useState<FreeBook[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);

  useEffect(() => {
    api.get<{ books: FreeBook[] }>('/api/discovery/free-books')
      .then((res) => {
        if (res.success && res.data?.books) {
          setSuggestions(res.data.books.slice(0, 6));
        }
      })
      .catch(() => { toast('Failed to load book suggestions', 'error'); })
      .finally(() => setLoadingSuggestions(false));
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in">
      <div className="flex justify-between items-center mb-6 sm:mb-8">
        <div className="animate-slide-up">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">My Library</h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1">
            Your personal reading collection
          </p>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-1 bg-surface-1 rounded-xl p-1 border border-gray-200 dark:border-gray-700 animate-slide-up stagger-2">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-lg transition-all duration-200 ${
              viewMode === 'grid'
                ? 'bg-white dark:bg-gray-800 shadow-xs text-primary-600 dark:text-primary-400'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
            aria-label="Grid view"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
              <rect x="1" y="1" width="6" height="6" rx="1" />
              <rect x="9" y="1" width="6" height="6" rx="1" />
              <rect x="1" y="9" width="6" height="6" rx="1" />
              <rect x="9" y="9" width="6" height="6" rx="1" />
            </svg>
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-lg transition-all duration-200 ${
              viewMode === 'list'
                ? 'bg-white dark:bg-gray-800 shadow-xs text-primary-600 dark:text-primary-400'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
            aria-label="List view"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
              <rect x="1" y="1" width="14" height="3" rx="1" />
              <rect x="1" y="6" width="14" height="3" rx="1" />
              <rect x="1" y="11" width="14" height="3" rx="1" />
            </svg>
          </button>
        </div>
      </div>

      <div className="animate-slide-up stagger-3">
        <LibraryGrid viewMode={viewMode} />
      </div>

      {/* Free books to explore */}
      {!loadingSuggestions && suggestions.length > 0 && (
        <div className="mt-12 pt-8 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Free Books to Explore</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Classic works from Project Gutenberg</p>
            </div>
            <Link href="/search" className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
              Browse all
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {suggestions.map((book) => (
              <div key={book.title} className="group">
                <div className="w-full aspect-[2/3] rounded-xl bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/20 dark:to-teal-900/20 flex flex-col items-center justify-center p-3 group-hover:shadow-md transition-shadow border border-gray-200/50 dark:border-gray-800/50">
                  <span className="text-3xl mb-2">{'\uD83D\uDCD6'}</span>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 text-center leading-tight">{book.title}</p>
                  <p className="text-[10px] text-gray-400 mt-1">{book.author}</p>
                </div>
                {book.subjects && book.subjects.length > 0 && (
                  <div className="mt-1.5 text-center">
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">{book.subjects[0]}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
