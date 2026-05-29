'use client';

import React from 'react';
import type { CrossBookTheme } from '@/types/knowledge';

interface CrossBookThemesProps {
  themes: CrossBookTheme[];
  t: (key: string, params?: Record<string, string | number>) => string;
}

export function CrossBookThemes({ themes, t }: CrossBookThemesProps) {
  if (themes.length === 0) return null;

  return (
    <div className="bg-surface-0 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <h3 className="font-semibold text-gray-900 dark:text-white mb-3">{t('cross_book_themes')}</h3>
      <div className="space-y-3">
        {themes.slice(0, 8).map((theme) => (
          <div key={theme.conceptId} className="flex items-start gap-2">
            <div className="w-2 h-2 rounded-full bg-violet-500 mt-1.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">{theme.concept}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('found_in_books', { count: theme.bookTitles.length })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
