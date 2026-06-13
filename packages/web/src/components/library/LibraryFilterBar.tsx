'use client';

import React, { useMemo } from 'react';
import { useTranslations } from 'next-intl';

export type StatusFilter = 'all' | 'reading' | 'completed' | 'unread';
export type SortOption = 'addedAt-desc' | 'title-asc' | 'author-asc' | 'lastReadAt-desc' | 'progress-desc';

interface LibraryFilterBarProps {
 searchQuery: string;
 onSearchChange: (q: string) => void;
 statusFilter: StatusFilter;
 onStatusFilterChange: (f: StatusFilter) => void;
 sortOption: SortOption;
 onSortChange: (s: SortOption) => void;
}

export const LibraryFilterBar = React.memo(function LibraryFilterBar({
 searchQuery,
 onSearchChange,
 statusFilter,
 onStatusFilterChange,
 sortOption,
 onSortChange,
}: LibraryFilterBarProps) {
 const t = useTranslations('library');
 const tc = useTranslations('common');

 const SORT_OPTIONS: { value: SortOption; label: string }[] = useMemo(() => [
 { value: 'addedAt-desc', label: t('sort_recently_added') },
 { value: 'title-asc', label: t('sort_title_az') },
 { value: 'author-asc', label: t('sort_author_az') },
 { value: 'lastReadAt-desc', label: t('sort_last_read') },
 { value: 'progress-desc', label: t('sort_progress') },
 ], [t]);

 const STATUS_OPTIONS: [StatusFilter, string][] = [
 ['all', t('status_all')],
 ['reading', t('status_reading')],
 ['completed', t('status_done')],
 ['unread', t('status_unread')],
 ];

 return (
 <div className="flex flex-col sm:flex-row gap-3 animate-slide-up">
  <div className="relative flex-1">
  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
   <svg aria-hidden="true" className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
   </svg>
  </div>
  <input
   type="text"
   autoComplete="off"
   value={searchQuery}
   onChange={(e) => onSearchChange(e.target.value)}
   placeholder={t('search_title_author')}
   aria-label={t('search_title_author')}
   className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-3 bg-surface-0 text-sm placeholder-gray-400 focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 transition-all duration-200"
   inputMode="search"
   enterKeyHint="search"
   spellCheck={false}
  />
  {searchQuery && (
   <button type="button"
   onClick={() => onSearchChange('')}
   aria-label={tc('clear_search')}
   className="absolute top-1/2 -translate-y-1/2 right-0 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-400 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
   >
   <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
   </svg>
   </button>
  )}
  </div>

  <div className="flex items-center gap-2">
  <div className="flex items-center gap-1 bg-surface-1 rounded-xl p-1 border border-surface-3">
   {STATUS_OPTIONS.map(([value, label]) => (
   <button type="button"
    key={value}
    onClick={() => onStatusFilterChange(value)}
    className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 ${
    statusFilter === value
     ? 'bg-surface-0 shadow-xs text-primary-600'
     : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
    }`}
   >
    {label}
   </button>
   ))}
  </div>

  <select
   value={sortOption}
   onChange={(e) => onSortChange(e.target.value as SortOption)}
   aria-label={tc('sort_by')}
   className="px-3 py-2 rounded-xl border border-surface-3 bg-surface-0 text-xs font-medium text-gray-600 dark:text-gray-400 focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 transition-all duration-200 appearance-none pr-8 bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[position:right_8px_center] bg-no-repeat"
  >
   {SORT_OPTIONS.map((opt) => (
   <option key={opt.value} value={opt.value}>
    {opt.label}
   </option>
   ))}
  </select>
  </div>
 </div>
 );
});
