'use client';

import { useTranslations } from 'next-intl';

interface EmptyResultsProps {
 query: string;
}

export function EmptyResults({ query }: EmptyResultsProps) {
 const t = useTranslations('search');

 return (
 <div className="text-center py-12">
  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
  <svg className="w-7 h-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
  </div>
  <p className="text-gray-500 mb-1">{t('no_results', { query })}</p>
  <p className="text-sm text-gray-400">{t('try_different')}</p>
 </div>
 );
}
