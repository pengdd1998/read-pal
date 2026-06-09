'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export const EmptyState = React.memo(function EmptyState() {
 const t = useTranslations('stats');

 return (
 <div className="text-center py-16 animate-fade-in">
  <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 flex items-center justify-center text-3xl">
  📊
  </div>
  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('no_stats_title')}</h2>
  <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-xs mx-auto">
  {t('no_stats_desc')}
  </p>
  <Link
  href="/library"
  className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-xl transition-colors text-sm"
  >
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
  {t('browse_library')}
  </Link>
 </div>
 );
});
