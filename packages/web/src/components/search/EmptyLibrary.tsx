'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export const EmptyLibrary = React.memo(function EmptyLibrary() {
 const t = useTranslations('search');

 return (
 <div className="text-center py-12">
  <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/30 dark:to-teal-900/30 flex items-center justify-center">
  <svg aria-hidden="true" className="w-8 h-8 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  </div>
  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
  {t('search_across_library')}
  </h2>
  <p className="text-gray-500 dark:text-gray-400 mb-4 max-w-md mx-auto leading-relaxed">
  {t('search_across_desc')}
  </p>
  <Link href="/library" prefetch={false} className="btn btn-primary hover:scale-105 active:scale-95 transition-transform duration-200">
  {t('add_books_started')}
  </Link>
 </div>
 );
});
