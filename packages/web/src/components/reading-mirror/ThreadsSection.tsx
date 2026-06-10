'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

interface Thread {
  theme: string;
  books: string[];
  connection: string;
}

interface ThreadsSectionProps {
  data: Record<string, unknown>;
}

export default React.memo(function ThreadsSection({ data }: ThreadsSectionProps) {
  const t = useTranslations('readingMirror');
  const threads = (data.threads as Thread[]) || [];
  const readingPattern = data.reading_pattern as string | undefined;
  const suggestedNext = data.suggested_next_theme as string | undefined;

  if (threads.length === 0) {
    return (
      <div className="py-8 text-center">
        <span className="text-2xl">📚</span>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 italic">{t('no_threads')}</p>
      </div>
    );
  }

  return (
    <div className="py-8 space-y-6">
      {readingPattern && (
        <p className="text-gray-600 dark:text-gray-400 text-base italic leading-relaxed max-w-[65ch]">
          {readingPattern}
        </p>
      )}

      <div className="space-y-4">
        {threads.map((thread, i) => (
          <div
            key={i}
            className="bg-surface-0 border border-surface-3 rounded-xl p-5 space-y-2"
          >
            <h4 className="font-serif text-lg font-semibold text-gray-900 dark:text-gray-100 m-0">
              {thread.theme}
            </h4>

            {thread.books && thread.books.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {thread.books.map((book, j) => (
                  <span
                    key={j}
                    className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-xs text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50"
                  >
                    {book}
                  </span>
                ))}
              </div>
            )}

            <p className="text-sm text-gray-600 dark:text-gray-400 m-0 leading-relaxed">
              {thread.connection}
            </p>
          </div>
        ))}
      </div>

      {suggestedNext && (
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-800/50 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-lg shrink-0">🔮</span>
            <div>
              <h4 className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase tracking-wider mb-1">
                {t('explore_next')}
              </h4>
              <p className="text-sm text-purple-900 dark:text-purple-200 m-0 leading-relaxed">
                {suggestedNext}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
