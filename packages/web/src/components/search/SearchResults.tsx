'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { BookResultCard } from './BookResultCard';
import { HighlightResultCard } from './HighlightResultCard';
import type { Book, Highlight } from './types';

interface SearchResultsProps {
 results: Book[];
 highlights: Highlight[];
 filter: 'all' | 'books' | 'highlights' | 'notes';
}

export const SearchResults = React.memo(function SearchResults({ results, highlights, filter }: SearchResultsProps) {
 const t = useTranslations('search');

 return (
 <div className="space-y-6">
  {results.length > 0 && (
  <div>
   <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
   {t('books_heading', { count: results.length })}
   </h2>
   <div className="space-y-3">
   {results.map((book) => (
    <BookResultCard key={book.id} book={book} />
   ))}
   </div>
  </div>
  )}

  {highlights.length > 0 && (
  <div>
   <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
   {filter === 'notes'
    ? t('notes_heading', { count: highlights.length })
    : filter === 'highlights'
    ? t('highlights_heading', { count: highlights.length })
    : t('highlights_notes_heading', { count: highlights.length })}
   </h2>
   <div className="space-y-2">
   {highlights.map((h) => (
    <HighlightResultCard key={h.id} highlight={h} />
   ))}
   </div>
  </div>
  )}
 </div>
 );
});