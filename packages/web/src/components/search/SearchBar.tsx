'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

interface SearchBarProps {
 query: string;
 searching: boolean;
 onQueryChange: (value: string) => void;
}

export const SearchBar = React.memo(function SearchBar({ query, searching, onQueryChange }: SearchBarProps) {
 const t = useTranslations('search');

 return (
 <div className="relative mb-6 sm:mb-8">
  <div className="absolute inset-y-0 left-0 pl-3 sm:pl-4 flex items-center pointer-events-none">
  <svg aria-hidden="true" className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
  </div>
  <input
  type="text"
  value={query}
  onChange={(e) => onQueryChange(e.target.value)}
  placeholder={t('placeholder')}
  aria-label={t('placeholder')}
  className="w-full pl-10 sm:pl-12 pr-4 py-3 sm:py-4 rounded-xl border border-surface-3 bg-surface-0 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 text-base sm:text-lg shadow-sm transition-all duration-200"
  autoFocus
  />
  {searching && (
  <div className="absolute right-4 top-4">
   <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
  </div>
  )}
 </div>
 );
});
