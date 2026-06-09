'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

interface SampleBookCardProps {
  bookTitle?: string;
}

export const SampleBookCard = React.memo(function SampleBookCard({ bookTitle }: SampleBookCardProps) {
  const t = useTranslations('welcome');

  return (
    <div className="bg-gradient-to-br from-amber-50 to-teal-50 dark:from-amber-900/20 dark:to-teal-900/20 rounded-2xl border border-amber-200/50 dark:border-amber-800/30 p-5">
      <div className="flex items-center gap-3 text-left">
        <div className="w-12 h-16 rounded-lg bg-gradient-to-br from-amber-200 to-amber-300 dark:from-amber-800 dark:to-amber-700 flex items-center justify-center flex-shrink-0">
          <span className="text-lg">{'📖'}</span>
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
