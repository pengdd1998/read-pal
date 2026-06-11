'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

interface ExportModalHeaderProps {
  bookTitle?: string;
  onClose: () => void;
}

export const ExportModalHeader = React.memo(function ExportModalHeader({
  bookTitle,
  onClose,
}: ExportModalHeaderProps) {
  const t = useTranslations('reader');

  return (
    <div className="px-5 py-4 border-b border-surface-3 flex items-center justify-between">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t('export_title')}
        </h3>
        {bookTitle && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-xs">
            {bookTitle}
          </p>
        )}
      </div>
      <button
        onClick={onClose}
        aria-label={t('export_close_dialog')}
        className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-surface-1 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
      >
        <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
});
