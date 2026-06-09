'use client';

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import type { Book } from '@read-pal/shared';
import { BookCard } from './BookCard';
import { BookUploader } from './BookUploader';
import { LibraryEmptyState } from './LibraryEmptyState';
import { LibraryFilterBar, type StatusFilter, type SortOption } from './LibraryFilterBar';

interface LibraryGridProps {
 viewMode?: 'grid' | 'list';
 collectionBookIds?: string[] | null;
}

function sortBooks(bookList: Book[], sortOption: SortOption): Book[] {
 const sorted = [...bookList];
 const [field, direction] = sortOption.split('-') as [keyof Book, 'asc' | 'desc'];
 const mult = direction === 'asc' ? 1 : -1;

 sorted.sort((a, b) => {
 const aVal = a[field];
 const bVal = b[field];

 if (field === 'progress') {
  return mult * ((aVal as number ?? 0) - (bVal as number ?? 0));
 }
 if (field === 'lastReadAt' || field === 'addedAt') {
  const aTime = aVal ? new Date(aVal as string | Date).getTime() : 0;
  const bTime = bVal ? new Date(bVal as string | Date).getTime() : 0;
  return mult * (aTime - bTime);
 }
 const aStr = String(aVal ?? '').toLowerCase();
 const bStr = String(bVal ?? '').toLowerCase();
 return mult * aStr.localeCompare(bStr);
 });

 return sorted;
}

export const LibraryGrid = React.memo(function LibraryGrid({ viewMode = 'grid', collectionBookIds }: LibraryGridProps) {
 const t = useTranslations('library');
 const tc = useTranslations('common');
 const [books, setBooks] = useState<Book[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState('');
 const [seeding, setSeeding] = useState(false);
 const uploaderRef = useRef<HTMLDivElement>(null);
 const mountedRef = useRef(true);

 useEffect(() => { return () => { mountedRef.current = false; }; }, []);

 const [searchQuery, setSearchQuery] = useState('');
 const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
 const [sortOption, setSortOption] = useState<SortOption>('addedAt-desc');

 const handleRetry = useCallback(() => {
  let stale = false;
  setLoading(true);
  setError('');
  api.get<Book[]>('/api/books')
   .then((response) => {
    if (stale) return;
    if (response.success && response.data) {
     setBooks(Array.isArray(response.data) ? response.data : []);
    } else {
     setError(t('failed_load_library'));
    }
   })
   .catch((err) => {
    if (stale) return;
    console.warn('LibraryGrid: failed to load library', err);
    setError(t('failed_connect_server'));
   })
   .finally(() => { if (!stale) setLoading(false); });
  return () => { stale = true; };
 }, [t]);

 useEffect(() => {
  let stale = false;
  setLoading(true);
  setError('');
  api.get<Book[]>('/api/books')
   .then((response) => {
    if (stale) return;
    if (response.success && response.data) {
     setBooks(Array.isArray(response.data) ? response.data : []);
    } else {
     setError(t('failed_load_library'));
    }
   })
   .catch((err) => {
    if (stale) return;
    console.warn('LibraryGrid: failed to load library', err);
    setError(t('failed_connect_server'));
   })
   .finally(() => {
    if (!stale) setLoading(false);
   });
  return () => { stale = true; };
 }, [t]);

 const handleUploadComplete = (newBook: Book) => {
 if (!newBook?.id) return;
 setBooks((prev) => [newBook, ...prev]);
 };

 const deletingRef = useRef<Set<string>>(new Set());

 const handleDeleteBook = async (id: string) => {
 if (deletingRef.current.has(id)) return;
 deletingRef.current.add(id);
 const prev = books;
 setBooks((bs) => bs.filter((b) => b.id !== id));
 try {
  await api.delete(`/api/books/${id}`);
 } catch (err) {
  console.warn('LibraryGrid: failed to delete book', err);
  if (!mountedRef.current) return;
  setBooks(prev);
 } finally {
  if (mountedRef.current) deletingRef.current.delete(id);
 }
 };

 const handleSeedSample = async () => {
 if (seeding) return;
 try {
  setSeeding(true);
  const res = await api.post<{ book: Book }>('/api/books/seed-sample');
  if (!mountedRef.current) return;
  if (res.success && res.data?.book) {
  setBooks((prev) => [res.data!.book, ...prev]);
  } else {
  setError(t('failed_seed_sample'));
  }
 } catch (err) {
  console.warn('LibraryGrid: failed to seed sample book', err);
  if (!mountedRef.current) return;
  setError(t('failed_seed_sample'));
 } finally {
  if (mountedRef.current) setSeeding(false);
 }
 };

 const filteredBooks = useMemo(() => sortBooks(
 books.filter((book) => {
  if (collectionBookIds && !collectionBookIds.includes(book.id)) return false;
  const matchesStatus = statusFilter === 'all' || book.status === statusFilter;
  if (!matchesStatus) return false;
  if (searchQuery.trim()) {
  const q = searchQuery.toLowerCase();
  const matchesText = (book.title || '').toLowerCase().includes(q)
   || (book.author || '').toLowerCase().includes(q);
  const matchesTags = (book.tags || []).some((tag) => tag.includes(q));
  return matchesText || matchesTags;
  }
  return true;
 }),
 sortOption,
 ), [books, statusFilter, searchQuery, sortOption, collectionBookIds]);

 const handleTagsChange = useCallback((id: string, newTags: string[]) => {
 setBooks((prev) => prev.map((b) => (b.id === id ? { ...b, tags: newTags } : b)));
 }, []);

 const handleBookAdded = useCallback((book: Book) => {
 setBooks((prev) => [book, ...prev]);
 }, []);

 if (loading) {
 return (
  <div className="space-y-8">
  <div className="border-2 border-dashed border-surface-3 rounded-2xl p-12 animate-pulse" />
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
   {Array.from({ length: 8 }).map((_, i) => (
   <div key={i} className="animate-pulse">
    <div className="aspect-[3/4] bg-gray-100 dark:bg-gray-800 rounded-xl mb-3" />
    <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-3/4" />
    <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/2 mt-2" />
   </div>
   ))}
  </div>
  </div>
 );
 }

 const hasBooks = books.length > 0;

 return (
 <div className="space-y-6">
  {error && (
  <div className="animate-slide-up p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm">
   <div className="flex items-center justify-between">
   <p>{error}</p>
   <button
    onClick={handleRetry}
    aria-label={tc('retry')}
    className="ml-4 min-h-[44px] px-4 py-2 bg-red-100 dark:bg-red-900 rounded-lg text-xs font-medium hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
   >
    {tc('retry')}
   </button>
   </div>
  </div>
  )}

  <div ref={uploaderRef} className="animate-fade-in">
  <BookUploader onUploadComplete={handleUploadComplete} />
  </div>

  {!hasBooks && !error && (
  <LibraryEmptyState
   onBookAdded={handleBookAdded}
   uploaderRef={uploaderRef}
  />
  )}

  {hasBooks && (
  <>
   <LibraryFilterBar
   searchQuery={searchQuery}
   onSearchChange={setSearchQuery}
   statusFilter={statusFilter}
   onStatusFilterChange={setStatusFilter}
   sortOption={sortOption}
   onSortChange={setSortOption}
   />

   <div className="flex items-center justify-between animate-slide-up">
   <p className="text-sm text-gray-500 dark:text-gray-400">
    {filteredBooks.length === books.length
    ? t('books_in_library', { count: books.length })
    : t('books_of_total', { filtered: filteredBooks.length, total: books.length })}
   </p>
   <button
    onClick={handleSeedSample}
    disabled={seeding}
    aria-label={seeding ? t('loading_sample') : t('add_sample_book')}
    className="min-h-[44px] px-3 text-xs text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
   >
    {seeding ? t('loading_sample') : t('add_sample_book')}
   </button>
   </div>

   {filteredBooks.length > 0 ? (
   <div className={
    viewMode === 'grid'
    ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5'
    : 'flex flex-col gap-3'
   }>
    {filteredBooks.map((book, i) => (
    <div key={book.id} className={`stagger-${Math.min(i + 1, 6)} animate-slide-up`}>
     <BookCard
     id={book.id}
     title={book.title}
     author={book.author}
     coverUrl={book.coverUrl}
     progress={Math.round(book.progress ?? 0)}
     status={book.status}
     currentPage={book.currentPage || 0}
     totalPages={book.totalPages || 0}
     tags={book.tags}
     lastReadAt={book.lastReadAt}
     onDelete={handleDeleteBook}
     onTagsChange={handleTagsChange}
     />
    </div>
    ))}
   </div>
   ) : (
   <div className="text-center py-12 animate-fade-in">
    <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
    <svg aria-hidden="true" className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
    </div>
    <p className="text-gray-500 dark:text-gray-400 mb-1">
    {t('no_books_match', { query: searchQuery })}
    {statusFilter !== 'all' ? ` ${t('with_status', { status: statusFilter })}` : ''}
    </p>
    <button
    onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
    className="min-h-[44px] px-3 text-sm text-primary-600 dark:text-primary-400 hover:underline focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
    >
    {t('clear_filters')}
    </button>
   </div>
   )}
  </>
  )}
 </div>
 );
});
