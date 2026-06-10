'use client';
import React from 'react';
import { Link } from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type { Highlight } from './types';

interface HighlightResultCardProps {
 highlight: Highlight;
}

export const HighlightResultCard = React.memo(function HighlightResultCard({ highlight }: HighlightResultCardProps) {
 const locale = useLocale();
 const t = useTranslations('search');
 const typeLabel = t(`type_${highlight.type}`, { defaultValue: highlight.type });
 return (
 <Link
  href={`/read/${highlight.bookId}`}
  className="block bg-amber-50/50 dark:bg-amber-900/10 rounded-xl border border-amber-200/50 dark:border-amber-800/30 p-4 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all duration-200"
 >
  <div className="flex items-start gap-2">
  <span className="text-amber-500 text-sm mt-0.5">
   {highlight.type === 'highlight' ? (
      <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
      </svg>
    ) : highlight.type === 'note' ? (
      <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ) : (
      <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
      </svg>
    )}
  </span>
  <div className="flex-1 min-w-0">
   <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">{highlight.content}</p>
   <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{typeLabel} &middot; {new Date(highlight.createdAt).toLocaleDateString(locale)}</p>
  </div>
  </div>
 </Link>
 );
});
