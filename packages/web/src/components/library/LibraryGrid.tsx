'use client';

import React, { useRef, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { Book } from '@read-pal/shared';
import { BookCard } from './BookCard';
import { BookUploader } from './BookUploader';
import { LibraryEmptyState } from './LibraryEmptyState';
import { LibraryFilterBar, type StatusFilter, type SortOption } from './LibraryFilterBar';
import { LibraryLoadingSkeleton } from './LibraryLoadingSkeleton';
import { LibraryErrorBanner } from './LibraryErrorBanner';
import { LibraryNoResults } from './LibraryNoResults';
import { useLibraryBooks } from './useLibraryBooks';

interface LibraryGridProps {
  viewMode?: 'grid' | 'list';
  collectionBookIds?: string[] | null;
  searchQuery?: string;
}

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
    const aStr = String(aVal ?? '').toLowerCase();
    const bStr = String(bVal ?? '').toLowerCase();
    return mult * aStr.localeCompare(bStr);
  });

  return sorted;
}

export const LibraryGrid = React.memo(function LibraryGrid({ viewMode = 'grid', collectionBookIds, searchQuery: externalSearch }: LibraryGridProps) {
  const t = useTranslations('library');
  const {
    books,
    loading,
    error,
    seeding,
    handleRetry,
    handleUploadComplete,
    handleDeleteBook,
    handleSeedSample,
    handleTagsChange,
    handleBookAdded,
  } = useLibraryBooks();

  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');
  const [sortOption, setSortOption] = React.useState<SortOption>('addedAt-desc');
  const uploaderRef = useRef<HTMLDivElement>(null);

  const effectiveSearch = externalSearch || searchQuery;
  const filteredBooks = useMemo(() => sortBooks(
    books.filter((book) => {
      if (collectionBookIds && !collectionBookIds.includes(book.id)) return false;
      const matchesStatus = statusFilter === 'all' || book.status === statusFilter;
      if (!matchesStatus) return false;
      if (effectiveSearch.trim()) {
        const q = effectiveSearch.toLowerCase();
        const matchesText = (book.title || '').toLowerCase().includes(q)
          || (book.author || '').toLowerCase().includes(q);
        const matchesTags = (book.tags || []).some((tag) => tag.includes(q));
        return matchesText || matchesTags;
      }
      return true;
    }),
    sortOption,
  ), [books, statusFilter, effectiveSearch, sortOption, collectionBookIds]);

  if (loading) {
    return <LibraryLoadingSkeleton />;
  }

  const hasBooks = books.length > 0;

  return (
    <div className="space-y-6">
      {error && <LibraryErrorBanner error={error} onRetry={handleRetry} />}

      <div ref={uploaderRef} className="animate-fade-in">
        <BookUploader onUploadComplete={handleUploadComplete} />
      </div>

      {!hasBooks && !error && (
        <LibraryEmptyState
          onBookAdded={handleBookAdded}
          uploaderRef={uploaderRef}
        />
      )}

      {hasBooks && (
        <>
          <LibraryFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            sortOption={sortOption}
            onSortChange={setSortOption}
          />

          <div className="flex items-center justify-between animate-slide-up">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {filteredBooks.length === books.length
                ? t('books_in_library', { count: books.length })
                : t('books_of_total', { filtered: filteredBooks.length, total: books.length })}
            </p>
            <button type="button"
              onClick={handleSeedSample}
              disabled={seeding}
              aria-label={seeding ? t('loading_sample') : t('add_sample_book')}
              className="min-h-[44px] px-3 text-xs text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
            >
              {seeding ? t('loading_sample') : t('add_sample_book')}
            </button>
          </div>

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
                    progress={Math.round(book.progress ?? 0)}
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
            <LibraryNoResults
              searchQuery={searchQuery}
              statusFilter={statusFilter}
              onClearFilters={() => { setSearchQuery(''); setStatusFilter('all'); }}
            />
          )}
        </>
      )}
    </div>
  );
});
