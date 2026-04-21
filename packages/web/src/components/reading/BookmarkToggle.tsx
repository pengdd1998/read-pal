'use client';

import { useTranslations } from 'next-intl';

interface BookmarkToggleProps {
  isBookmarked: boolean;
  onToggle: () => void;
}

export function BookmarkToggle({ isBookmarked, onToggle }: BookmarkToggleProps) {
  const t = useTranslations('reader');

  return (
    <button
      onClick={onToggle}
      className={`p-2 rounded-lg transition-all duration-150 active:scale-110 ${
        isBookmarked
          ? 'text-amber-500 hover:text-amber-600'
          : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
      aria-label={isBookmarked ? t('bookmark_remove') : t('bookmark_add')}
      aria-pressed={isBookmarked}
    >
      {isBookmarked ? (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M5 2a2 2 0 00-2 2v17.138a1 1 0 001.555.832L12 17.202l7.445 5.768A1 1 0 0021 21.138V4a2 2 0 00-2-2H5z" />
        </svg>
      ) : (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 2a2 2 0 00-2 2v17.138a1 1 0 001.555.832L12 17.202l7.445 5.768A1 1 0 0021 21.138V4a2 2 0 00-2-2H5z" />
        </svg>
      )}
    </button>
  );
}
