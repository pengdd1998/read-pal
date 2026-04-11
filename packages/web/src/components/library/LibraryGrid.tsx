'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { api } from '@/lib/api';
import type { Book } from '@read-pal/shared';
import { BookCard } from './BookCard';
import { BookUploader } from './BookUploader';

interface LibraryGridProps {
  viewMode?: 'grid' | 'list';
}

type StatusFilter = 'all' | 'reading' | 'completed' | 'unread';
type SortOption = 'addedAt-desc' | 'title-asc' | 'author-asc' | 'lastReadAt-desc' | 'progress-desc';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'addedAt-desc', label: 'Recently Added' },
  { value: 'title-asc', label: 'Title A-Z' },
  { value: 'author-asc', label: 'Author A-Z' },
  { value: 'lastReadAt-desc', label: 'Last Read' },
  { value: 'progress-desc', label: 'Progress' },
];

function sortBooks(bookList: Book[], sortOption: SortOption): Book[] {
  const sorted = [...bookList];
  const [field, direction] = sortOption.split('-') as [keyof Book, 'asc' | 'desc'];
  const mult = direction === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    const aVal = a[field];
    const bVal = b[field];

    if (field === 'progress') {
      return mult * ((aVal as number ?? 0) - (bVal as number ?? 0));
    }
    if (field === 'lastReadAt' || field === 'addedAt') {
      const aTime = aVal ? new Date(aVal as string | Date).getTime() : 0;
      const bTime = bVal ? new Date(bVal as string | Date).getTime() : 0;
      return mult * (aTime - bTime);
    }
    // String fields (title, author)
    const aStr = String(aVal ?? '').toLowerCase();
    const bStr = String(bVal ?? '').toLowerCase();
    return mult * aStr.localeCompare(bStr);
  });

  return sorted;
}

export function LibraryGrid({ viewMode = 'grid' }: LibraryGridProps) {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [seeding, setSeeding] = useState(false);
  const uploaderRef = useRef<HTMLDivElement>(null);

  // Search, filter & sort
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortOption, setSortOption] = useState<SortOption>('addedAt-desc');
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const loadLibrary = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get<Book[]>('/api/books');

      if (response.success && response.data) {
        const data = response.data as unknown as Book[];
        setBooks(Array.isArray(data) ? data : []);
      } else {
        setError(response.error?.message || 'Failed to load library');
      }
    } catch {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  const handleUploadComplete = (newBook: Book) => {
    setBooks((prev) => [newBook, ...prev]);
  };

  const handleDeleteBook = async (id: string) => {
    const prev = books;
    setBooks((bs) => bs.filter((b) => b.id !== id));
    try {
      await api.delete(`/api/books/${id}`);
    } catch {
      setBooks(prev); // rollback on failure
    }
  };

  const handleSeedSample = async () => {
    try {
      setSeeding(true);
      const res = await api.post<{ book: Book }>('/api/books/seed-sample');
      if (res.success && res.data) {
        const data = res.data as unknown as { book: Book };
        if (data.book) {
          setBooks((prev) => [data.book, ...prev]);
        }
      }
    } catch {
      // Silently fail
    } finally {
      setSeeding(false);
    }
  };

  // Client-side filter & sort (works with loaded books; no extra API calls)
  const filteredBooks = useMemo(() => sortBooks(
    books.filter((book) => {
      const matchesStatus = statusFilter === 'all' || book.status === statusFilter;
      if (!matchesStatus) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesText = (book.title || '').toLowerCase().includes(q)
          || (book.author || '').toLowerCase().includes(q);
        const matchesTags = (book.tags || []).some((t) => t.includes(q));
        return matchesText || matchesTags;
      }
      return true;
    }),
    sortOption,
  ), [books, statusFilter, searchQuery, sortOption]);

  const handleTagsChange = useCallback((id: string, newTags: string[]) => {
    setBooks((prev) => prev.map((b) => (b.id === id ? { ...b, tags: newTags } : b)));
  }, []);

  if (loading) {
    return (
      <div className="space-y-8">
        {/* Uploader skeleton */}
        <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-12 animate-pulse" />
        {/* Grid skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-[3/4] bg-gray-100 dark:bg-gray-800 rounded-xl mb-3" />
              <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-3/4" />
              <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/2 mt-2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const hasBooks = books.length > 0;

  return (
    <div className="space-y-6">
      {/* Error */}
      {error && (
        <div className="animate-slide-up p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm">
          <div className="flex items-center justify-between">
            <p>{error}</p>
            <button
              onClick={loadLibrary}
              className="ml-4 px-3 py-1.5 bg-red-100 dark:bg-red-900 rounded-lg text-xs font-medium hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Upload area — always visible at top */}
      <div ref={uploaderRef} className="animate-fade-in">
        <BookUploader onUploadComplete={handleUploadComplete} />
      </div>

      {/* Empty state with prominent CTA */}
      {!hasBooks && !error && (
        <div className="animate-scale-in">
          <div className="text-center py-16">
            {/* Large illustrated book icon */}
            <div className="w-28 h-28 mx-auto mb-6 relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary-100 to-amber-100 dark:from-primary-900/30 dark:to-amber-900/30 rounded-3xl rotate-6 scale-95" />
              <div className="absolute inset-0 bg-gradient-to-br from-primary-50 to-amber-50 dark:from-primary-900/20 dark:to-amber-900/20 rounded-3xl flex items-center justify-center shadow-sm">
                <svg className="w-12 h-12 text-primary-400 dark:text-primary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  <line x1="9" y1="7" x2="16" y2="7" />
                  <line x1="9" y1="11" x2="14" y2="11" />
                </svg>
              </div>
            </div>
            <h3 className="font-bold text-gray-900 dark:text-white text-2xl mb-2">
              Your library is empty
            </h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto mb-8 leading-relaxed">
              Upload an EPUB or PDF above, or try a sample book to explore all features
              including AI chat, highlights, and annotations.
            </p>

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleSeedSample}
                disabled={seeding}
                className="btn btn-primary hover:scale-105 active:scale-95 transition-transform duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {seeding ? 'Loading sample...' : 'Try a sample book'}
              </button>
            </div>

            <p className="text-xs text-gray-400 mt-6">
              Drag and drop a file onto the upload area above to add your own books
            </p>
          </div>
        </div>
      )}

      {/* Search & Filter bar — shown when library has books */}
      {hasBooks && (
        <>
          <div className="flex flex-col sm:flex-row gap-3 animate-slide-up">
            {/* Search input */}
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title or author..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 transition-all duration-200"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Status filter pills + Sort dropdown */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-surface-1 rounded-xl p-1 border border-gray-200 dark:border-gray-700">
                {([
                  ['all', 'All'],
                  ['reading', 'Reading'],
                  ['completed', 'Done'],
                  ['unread', 'Unread'],
                ] as [StatusFilter, string][]).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setStatusFilter(value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                      statusFilter === value
                        ? 'bg-white dark:bg-gray-800 shadow-xs text-primary-600 dark:text-primary-400'
                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Sort dropdown */}
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as SortOption)}
                className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs font-medium text-gray-600 dark:text-gray-300 focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 transition-all duration-200 appearance-none pr-8 bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[position:right_8px_center] bg-no-repeat"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Results info */}
          <div className="flex items-center justify-between animate-slide-up">
            <p className="text-sm text-gray-500">
              {filteredBooks.length === books.length
                ? `${books.length} book${books.length !== 1 ? 's' : ''} in your library`
                : `${filteredBooks.length} of ${books.length} books`}
            </p>
            <button
              onClick={handleSeedSample}
              disabled={seeding}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {seeding ? 'Loading...' : '+ Add sample book'}
            </button>
          </div>

          {/* Filtered grid / list */}
          {filteredBooks.length > 0 ? (
            <div className={
              viewMode === 'grid'
                ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5'
                : 'flex flex-col gap-3'
            }>
              {filteredBooks.map((book, i) => (
                <div key={book.id} className={`stagger-${Math.min(i + 1, 6)} animate-slide-up`}>
                  <BookCard
                    id={book.id}
                    title={book.title}
                    author={book.author}
                    coverUrl={book.coverUrl}
                    progress={Math.round((book.progress ?? 0) * 100)}
                    status={book.status}
                    currentPage={book.currentPage || 0}
                    totalPages={book.totalPages || 0}
                    tags={book.tags}
                    lastReadAt={book.lastReadAt}
                    onDelete={handleDeleteBook}
                    onTagsChange={handleTagsChange}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 animate-fade-in">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <p className="text-gray-500 dark:text-gray-400 mb-1">
                No books match &quot;{searchQuery}&quot;
                {statusFilter !== 'all' ? ` with status "${statusFilter}"` : ''}
              </p>
              <button
                onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
                className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
              >
                Clear filters
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
