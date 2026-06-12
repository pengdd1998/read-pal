'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { getBookCoverColors, getBookInitials, isDisplayableAuthor } from '@/lib/book-cover';
import { useToast } from '@/components/Toast';
import { warn } from '@/lib/logger';

interface FreeBook {
 title: string;
 author: string;
 coverUrl?: string;
 subjects?: string[];
 downloadUrl?: string;
}

interface FreeBooksSectionProps {
 searchQuery: string;
}

export const FreeBooksSection = React.memo(function FreeBooksSection({ searchQuery }: FreeBooksSectionProps) {
 const t = useTranslations('library');
 const tRef = useRef(t); tRef.current = t;
 const tc = useTranslations('common');
 const { toast } = useToast();
 const [suggestions, setSuggestions] = useState<FreeBook[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState(false);
 const [importing, setImporting] = useState<string | null>(null);
 const mountedRef = useRef(true);

 useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

 const fetchSuggestions = useCallback(() => {
  setLoading(true);
  setError(false);
  api.get<{ items: FreeBook[] }>('/api/discovery/free-books')
   .then((res) => {
    if (res.success && res.data?.items) {
     setSuggestions(res.data.items.slice(0, 6));
    } else {
     setError(true);
    }
   })
   .catch((err) => {
    warn('FreeBooksSection: suggestions fetch failed', err);
    setError(true);
    toast(tRef.current('toast_suggestions_fail'), 'error');
   })
   .finally(() => setLoading(false));
 }, [toast]);

 useEffect(() => {
  let stale = false;
  setLoading(true);
  api.get<{ items: FreeBook[] }>('/api/discovery/free-books')
   .then((res) => {
    if (stale) return;
    if (res.success && res.data?.items) {
     setSuggestions(res.data.items.slice(0, 6));
    } else {
     setError(true);
    }
   })
   .catch((err) => {
    if (stale) return;
    warn('FreeBooksSection: free books fetch failed', err);
    setError(true);
    toast(tRef.current('toast_suggestions_fail'), 'error');
   })
   .finally(() => {
    if (!stale) setLoading(false);
   });
  return () => { stale = true; };
 }, [toast]);

 const handleSeedSample = async () => {
  if (importing) return;
  setImporting('sample');
  try {
   const res = await api.post<{ book: { id: string } }>('/api/books/seed-sample');
   if (!mountedRef.current) return;
   if (res.success && res.data) {
    toast(t('toast_sample_added'), 'success');
    window.dispatchEvent(new CustomEvent('library-refresh'));
   } else {
    toast(t('toast_add_book_fail'), 'error');
   }
  } catch (err) {
   warn('FreeBooksSection: seed sample failed', err);
   if (!mountedRef.current) return;
   toast(t('toast_add_book_retry'), 'error');
  } finally {
   if (mountedRef.current) setImporting(null);
  }
 };

 const filtered = useMemo(
  () => searchQuery.trim()
   ? suggestions.filter((b) =>
    b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.author.toLowerCase().includes(searchQuery.toLowerCase()),
   )
   : suggestions,
  [searchQuery, suggestions],
 );

 if (loading) {
  return (
   <div className="mt-12 pt-8 border-t border-surface-3">
    <h3 className="text-sm font-medium text-gray-700 mb-4">{t('free_books_title')}</h3>
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
     {[1, 2, 3, 4].map((i) => (
      <div key={i} className="animate-pulse rounded-xl bg-surface-1 h-32" />
     ))}
    </div>
   </div>
  );
 }
 if (error) {
  return (
   <div className="mt-12 pt-8 border-t border-surface-3 text-center">
   <p className="text-sm text-gray-500 mb-3">{t('toast_suggestions_fail')}</p>
   <button type="button"
    onClick={fetchSuggestions}
    className="min-h-[44px] px-4 py-2 text-sm font-medium rounded-lg bg-surface-1 border border-surface-3 text-gray-600 hover:bg-surface-2 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
   >
    {tc('retry')}
   </button>
   </div>
  );
 }
 if (filtered.length === 0) return null;

 return (
 <div className="mt-12 pt-8 border-t border-surface-3">
  <div className="flex items-center justify-between mb-5">
   <div>
    <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">{t('free_books_title')}</h2>
    <p className="text-sm text-gray-500 dark:text-gray-400">{t('free_books_desc')}</p>
   </div>
   <div className="flex items-center gap-3">
    <button type="button"
     onClick={handleSeedSample}
     disabled={importing === 'sample'}
     aria-label={importing === 'sample' ? t('adding') : t('quick_start')}
     className="min-h-[44px] text-sm font-medium px-4 py-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
    >
     {importing === 'sample' ? t('adding') : t('quick_start')}
    </button>
    <Link href="/search" prefetch={false} className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
     {t('browse_all')}
    </Link>
   </div>
  </div>
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
   {filtered.map((book) => (
   <FreeBookCard key={book.title} book={book} t={t} />
   ))}
  </div>
 </div>
 );
});

interface FreeBookCardProps {
 book: FreeBook;
 t: (key: string, params?: Record<string, string | number>) => string;
}

const FreeBookCard = React.memo(function FreeBookCard({
 book,
 t,
}: FreeBookCardProps) {
 const [bgClass, textClass] = getBookCoverColors(book.title);
 return (
 <div className="group">
  <Link
  href={`/search?q=${encodeURIComponent(book.title)}`}
  aria-label={`${book.title} ${t('book_by_author', { author: book.author })}`}
  className={`w-full aspect-[2/3] rounded-xl bg-gradient-to-br ${bgClass} ${textClass} flex flex-col items-center justify-center p-3 group-hover:shadow-md transition-all border border-white/10 block`}
  >
  <span className="text-2xl font-bold tracking-wide opacity-90">{getBookInitials(book.title)}</span>
  <p className="text-[10px] mt-2 font-medium text-center leading-tight px-1 line-clamp-2">{book.title}</p>
  {isDisplayableAuthor(book.author) && <p className="text-[9px] mt-1 opacity-60">{book.author}</p>}
  </Link>
  {book.subjects && book.subjects.length > 0 && (
  <div className="mt-1.5 text-center">
   <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">{book.subjects[0]}</span>
  </div>
  )}
 </div>
 );
});
