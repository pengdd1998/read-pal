'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

interface BookmarkToggleProps {
 isBookmarked: boolean;
 onToggle: () => void;
}

export const BookmarkToggle = React.memo(function BookmarkToggle({ isBookmarked, onToggle }: BookmarkToggleProps) {
 const t = useTranslations('reader');

 return (
 <button type="button"
  onClick={onToggle}
  className={`w-11 h-11 flex items-center justify-center rounded-lg transition-all duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 ${
  isBookmarked
   ? 'text-amber-500 hover:text-amber-600'
   : 'text-gray-500 hover:text-gray-600 hover:bg-gray-100/80/60'
  }`}
  aria-label={isBookmarked ? t('bookmark_remove') : t('bookmark_add')}
  aria-pressed={isBookmarked}
 >
  {isBookmarked ? (
  <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
   <path d="M5 2a2 2 0 00-2 2v17.138a1 1 0 001.555.832L12 17.202l7.445 5.768A1 1 0 0021 21.138V4a2 2 0 00-2-2H5z" />
  </svg>
  ) : (
  <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M5 2a2 2 0 00-2 2v17.138a1 1 0 001.555.832L12 17.202l7.445 5.768A1 1 0 0021 21.138V4a2 2 0 00-2-2H5z" />
  </svg>
  )}
 </button>
 );
});
