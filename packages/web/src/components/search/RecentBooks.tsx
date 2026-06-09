'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { getBookCoverColors, getBookInitials, isDisplayableAuthor } from '@/lib/book-cover';
import { Link } from '@/i18n/navigation';
import type { Book } from './types';

interface RecentBooksProps {
 books: Book[];
}

export const RecentBooks = React.memo(function RecentBooks({ books }: RecentBooksProps) {
 const t = useTranslations('search');

 return (
 <div>
  <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-4">
  {t('your_library')}
  </h2>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
  {books.map((book) => (
   <Link
   key={book.id}
   href={`/read/${book.id}`}
   className="flex items-center gap-3 bg-surface-0 rounded-xl border border-surface-3 p-3 hover:shadow-md hover:border-amber-300 dark:hover:border-amber-700 transition-all duration-200"
   >
   <div className={`w-10 h-14 rounded-lg bg-gradient-to-br ${getBookCoverColors(book.title)[0]} ${getBookCoverColors(book.title)[1]} flex items-center justify-center flex-shrink-0`}>
    <span className="text-[10px] font-bold">{getBookInitials(book.title)}</span>
   </div>
   <div className="flex-1 min-w-0">
    <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">{book.title}</h3>
    {isDisplayableAuthor(book.author) && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{book.author}</p>}
    {book.progress > 0 && (
    <div className="w-full bg-surface-1 rounded-full h-1 mt-1.5">
     <div className="bg-amber-400 rounded-full h-1" style={{ width: `${Math.min(100, Math.round(book.progress))}%` }} />
    </div>
    )}
   </div>
   </Link>
  ))}
  </div>
 </div>
 );
});
