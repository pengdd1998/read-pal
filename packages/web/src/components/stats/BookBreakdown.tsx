'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { BookProgress } from './types';
import { getBookInitials, getBookCoverColors } from '@/lib/book-cover';

interface BookBreakdownProps {
 books: BookProgress[];
}

export const BookBreakdown = React.memo(function BookBreakdown({ books }: BookBreakdownProps) {
 const t = useTranslations('stats');

 if (books.length === 0) return null;

 return (
 <div className="bg-surface-0 rounded-xl border border-surface-3 p-6">
  <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('books_progress')}</h2>
  <div className="space-y-3">
  {books.slice(0, 6).map((book) => (
  <BookProgressRow key={book.id} book={book} />
  ))}
  </div>
 </div>
 );
});

interface BookProgressRowProps {
 book: BookProgress;
}

const BookProgressRow = React.memo(function BookProgressRow({ book }: BookProgressRowProps) {
 return (
 <Link href={`/read/${book.id}`} className="flex items-center gap-3 group">
  <div className="w-10 h-14 rounded-lg bg-gradient-to-br from-amber-400/30 to-amber-600/50 flex items-center justify-center flex-shrink-0">
  <span className="text-sm">{'📖'}</span>
  </div>
  <div className="flex-1 min-w-0">
  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
  {book.title}
  </h3>
  <div className="w-full bg-surface-1 rounded-full h-1.5 mt-1">
   <div
   className={`h-full rounded-full transition-all duration-500 ${
   book.progress >= 100 ? 'bg-emerald-500' : 'bg-amber-500'
   }`}
   style={{ width: `${Math.min(100, book.progress)}%` }}
   />
  </div>
  </div>
  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 tabular-nums">{Math.round(book.progress)}%</span>
 </Link>
 );
});
