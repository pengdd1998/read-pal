'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export function EmptyLibrary() {
 const t = useTranslations('search');

 return (
 <div className="text-center py-12">
  <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/30 dark:to-teal-900/30 flex items-center justify-center">
  <span className="text-3xl">{'🔍'}</span>
  </div>
  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
  {t('search_across_library')}
  </h2>
  <p className="text-gray-500 dark:text-gray-400 mb-4 max-w-md mx-auto leading-relaxed">
  {t('search_across_desc')}
  </p>
  <Link href="/library" className="btn btn-primary hover:scale-105 active:scale-95 transition-transform duration-200">
  {t('add_books_started')}
  </Link>
 </div>
 );
}
