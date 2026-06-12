import React from 'react';
import { Link } from '@/i18n/navigation';
import { isDisplayableAuthor } from '@/lib/book-cover';
import type { Book } from './types';

interface BookResultCardProps {
 book: Book;
}

export const BookResultCard = React.memo(function BookResultCard({ book }: BookResultCardProps) {
 return (
 <Link
  key={book.id}
  href={`/read/${book.id}`}
  className="block bg-surface-0 rounded-xl border border-surface-3 p-4 hover:shadow-md hover:border-amber-300 dark:hover:border-amber-700 transition-all duration-200"
 >
  <div className="flex justify-between items-center">
  <div>
   <h3 className="font-semibold text-gray-900 dark:text-gray-100">{book.title}</h3>
   {isDisplayableAuthor(book.author) && <p className="text-sm text-gray-500">{book.author}</p>}
  </div>
  <div className="flex items-center gap-3">
   <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
   book.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' :
   book.status === 'reading' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' :
   'bg-surface-1 text-gray-500'
   }`}>
   {book.status}
   </span>
   {book.progress > 0 && (
   <span className="text-sm text-amber-600 dark:text-amber-400 font-medium">{Math.round(book.progress)}%</span>
   )}
  </div>
  </div>
 </Link>
 );
});
