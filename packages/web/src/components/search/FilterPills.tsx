'use client';

import React from 'react';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { Book, Highlight } from './types';

type FilterKey = 'all' | 'books' | 'highlights' | 'notes';

interface FilterPillsProps {
 filter: FilterKey;
 results: Book[];
 highlights: Highlight[];
 onFilterChange: (filter: FilterKey) => void;
}

export const FilterPills = React.memo(function FilterPills({ filter, results, highlights, onFilterChange }: FilterPillsProps) {
 const t = useTranslations('search');

 const pills = useMemo(() => [
 { key: 'all' as const, label: t('filter_all'), count: results.length + highlights.length },
 { key: 'books' as const, label: t('filter_books'), count: results.length },
 { key: 'highlights' as const, label: t('filter_highlights'), count: highlights.filter((h) => h.type === 'highlight').length },
 { key: 'notes' as const, label: t('filter_notes'), count: highlights.filter((h) => h.type === 'note').length },
 ], [results.length, highlights, t]);

 return (
 <div className="flex gap-2 mb-5">
  {pills
  .filter((f) => f.key === 'all' || f.key === 'books' || f.count > 0)
  .map((f) => (
   <button
   key={f.key}
   aria-pressed={filter === f.key}
   onClick={() => onFilterChange(f.key)}
   className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 min-h-[44px] ${
    filter === f.key
    ? 'bg-amber-500 text-white'
    : 'bg-surface-1 text-gray-500 dark:text-gray-400 hover:bg-amber-100 dark:hover:bg-amber-900/30'
   }`}
   >
   {f.label}
   {f.count > 0 && <span className="ml-1 text-xs opacity-70">({f.count})</span>}
   </button>
  ))}
 </div>
 );
});