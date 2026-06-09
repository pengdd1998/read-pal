'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type { StatusFilter } from './LibraryFilterBar';

interface LibraryNoResultsProps {
  searchQuery: string;
  statusFilter: StatusFilter;
  onClearFilters: () => void;
}

export const LibraryNoResults = React.memo(function LibraryNoResults({
  searchQuery,
  statusFilter,
  onClearFilters,
}: LibraryNoResultsProps) {
  const t = useTranslations('library');

  return (
    <div className="text-center py-12 animate-fade-in">
      <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
        <svg aria-hidden="true" className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <p className="text-gray-500 dark:text-gray-400 mb-1">
        {t('no_books_match', { query: searchQuery })}
        {statusFilter !== 'all' ? ` ${t('with_status', { status: statusFilter })}` : ''}
      </p>
      <button
        onClick={onClearFilters}
        className="min-h-[44px] px-3 text-sm text-primary-600 dark:text-primary-400 hover:underline focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
      >
        {t('clear_filters')}
      </button>
    </div>
  );
});
