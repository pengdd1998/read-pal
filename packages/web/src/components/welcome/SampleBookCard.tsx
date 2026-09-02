'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { getBookInitials, getBookCoverColors } from '@/lib/book-cover';

interface SampleBookCardProps {
  bookTitle?: string;
}

export const SampleBookCard = React.memo(function SampleBookCard({ bookTitle }: SampleBookCardProps) {
  const t = useTranslations('welcome');

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-2xl border border-amber-200/50 dark:border-amber-800/30 p-5">
      <div className="flex items-center gap-3 text-left">
        <div className={`w-12 h-16 rounded-lg bg-gradient-to-br ${getBookCoverColors(bookTitle || 'Gatsby')[0]} flex items-center justify-center flex-shrink-0`}>
          <span className={`${getBookCoverColors(bookTitle || 'Gatsby')[1]} text-xs font-bold`}>{getBookInitials(bookTitle || 'Gatsby')}</span>
        </div>
        <div>
          <div className="font-semibold text-sm">
            {bookTitle || t('sample_book_title')}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {t('sample_book_ready')}
          </div>
        </div>
      </div>
    </div>
  );
});
