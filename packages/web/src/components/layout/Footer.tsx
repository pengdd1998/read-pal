'use client';

import React from 'react';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';

export const Footer = React.memo(function Footer() {
 const t = useTranslations('nav');
 const tc = useTranslations('common');

 return (
 <footer className="border-t border-surface-2 py-8 sm:py-10 mt-auto bg-surface-1">
  <div className="px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
  <div className="flex items-center gap-2">
   <span className="w-6 h-6 rounded-md bg-primary-500 flex items-center justify-center text-white text-xs font-bold">
   r
   </span>
   <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-sans">
   &copy; 2026 read-pal. {t('footer_companion')}
   </span>
  </div>
  <div className="flex items-center gap-4 sm:gap-6 flex-wrap justify-center">
   <Link href="/terms" className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 hover:text-primary-500 dark:hover:text-amber-400 transition-colors duration-200 font-sans py-1 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none">{tc('terms')}</Link>
   <Link href="/privacy" className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 hover:text-primary-500 dark:hover:text-amber-400 transition-colors duration-200 font-sans py-1 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none">{tc('privacy')}</Link>
   <Link href="/settings" className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 hover:text-primary-500 dark:hover:text-amber-400 transition-colors duration-200 font-sans py-1 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none">{t('nav_settings')}</Link>
  </div>
  </div>
 </footer>
 );
});
