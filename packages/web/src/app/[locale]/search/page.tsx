'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { usePageTitle } from '@/hooks/usePageTitle';
import { SearchBar } from '@/components/search/SearchBar';
import { FilterPills } from '@/components/search/FilterPills';
import { SearchResults } from '@/components/search/SearchResults';
import { EmptyResults } from '@/components/search/EmptyResults';
import { RecentBooks } from '@/components/search/RecentBooks';
import { EmptyLibrary } from '@/components/search/EmptyLibrary';
import type { Book, Highlight } from '@/components/search/types';

type FilterKey = 'all' | 'books' | 'highlights' | 'notes';

export default function SearchPage() {
 const t = useTranslations('search');
 usePageTitle(t('page_title'));
 const [query, setQuery] = useState('');
 const [results, setResults] = useState<Book[]>([]);
 const [highlights, setHighlights] = useState<Highlight[]>([]);
 const [searching, setSearching] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [searched, setSearched] = useState(false);
 const [recentBooks, setRecentBooks] = useState<Book[]>([]);
 const [filter, setFilter] = useState<FilterKey>('all');

 // Load recent books for recommendations when no search
 useEffect(() => {
 let stale = false;
 api.get<Book[]>('/api/books')
  .then((res) => {
  if (stale) return;
  if (res.success && res.data) {
   const data = res.data;
   setRecentBooks(Array.isArray(data) ? data.slice(0, 6) : []);
  }
  })
  .catch((err) => {
  if (stale) return;
  console.warn('search: recent books load failed', err);
  });
 return () => { stale = true; };
 }, []);

 // Debounced search across books, annotations, and semantic index
 useEffect(() => {
 if (query.trim().length < 2) {
  setResults([]);
  setHighlights([]);
  setError(null);
  setSearched(false);
  setFilter('all');
  return;
 }

 let stale = false;
 const timer = setTimeout(async () => {
  if (stale) return;
  setSearching(true);
  setError(null);
  setSearched(false);
  try {
  const settled = await Promise.allSettled([
   api.get<Book[]>('/api/discovery/search', { q: query }),
   api.get<Record<string, unknown>[]>('/api/annotations/search', { q: query, limit: 20 }),
   api.get<Book[]>('/api/discovery/semantic', { q: query }),
  ]);
  if (stale) return;

  const failedCount = settled.filter((r) => r.status === 'rejected').length;
  if (failedCount > 0) {
   console.warn(`search: ${failedCount} of 3 search queries failed`);
   setError(t('partial_failure'));
  }

  const bookRes = settled[0].status === 'fulfilled' ? settled[0].value : { success: false as const, data: [] as Book[] };
  const annRes = settled[1].status === 'fulfilled' ? settled[1].value : { success: false as const, data: [] as Record<string, unknown>[] };
  const semRes = settled[2].status === 'fulfilled' ? settled[2].value : { success: false as const, data: [] as Book[] };

  const bookResults = mergeBookResults(bookRes, semRes);
  setResults(bookResults);

  if (annRes.success && annRes.data) {
   const raw = annRes.data as unknown;
   const annItems = Array.isArray(raw) ? raw : ((raw as Record<string, unknown>)?.items ?? []);
   setHighlights((annItems as Record<string, unknown>[]).map(normalizeAnnotation));
  } else {
   setHighlights([]);
  }

  setSearched(true);
  } catch {
  if (stale) return;
  setError(t('failed_search'));
  setResults([]);
  setHighlights([]);
  setSearched(true);
  } finally {
  if (!stale) setSearching(false);
  }
 }, 300);

 return () => {
  stale = true;
  clearTimeout(timer);
 };
 }, [query, t]);

 const hasResults = results.length > 0 || highlights.length > 0;

 const filteredResults = useMemo(
 () => filter === 'highlights' || filter === 'notes' ? [] : results,
 [filter, results],
 );
 const filteredHighlights = useMemo(
 () => filter === 'books' ? [] : highlights.filter((h) => {
  if (filter === 'notes') return h.type === 'note';
  if (filter === 'highlights') return h.type === 'highlight';
  return true;
 }),
 [filter, highlights],
 );
 const filteredHasResults = filteredResults.length > 0 || filteredHighlights.length > 0;

 return (
 <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
  {/* Header */}
  <div className="mb-6 sm:mb-8">
  <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{t('page_title')}</h1>
  <p className="text-sm sm:text-base text-gray-500 mt-1">{t('subtitle')}</p>
  </div>

  <SearchBar query={query} searching={searching} onQueryChange={setQuery} />

  {/* Error */}
  {error && (
  <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-sm">
   {error}
  </div>
  )}

  {/* Filter Pills */}
  {searched && hasResults && (
  <FilterPills filter={filter} results={results} highlights={highlights} onFilterChange={setFilter} />
  )}

  {/* Search Results */}
  {searched ? (
  filteredHasResults ? (
   <SearchResults results={filteredResults} highlights={filteredHighlights} filter={filter} />
  ) : (
   <EmptyResults query={query} />
  )
  ) : query.trim().length < 2 && !searching ? (
  /* Default state — recommendations */
  recentBooks.length > 0 ? (
   <RecentBooks books={recentBooks} />
  ) : (
   <EmptyLibrary />
  )
  ) : null}
 </div>
 );
}

// Merge keyword and semantic book results with deduplication
function mergeBookResults(
 bookRes: { success: boolean; data?: Book[] },
 semRes: { success: boolean; data?: Book[] },
): Book[] {
 const bookResults: Book[] = [];

 if (bookRes.success && bookRes.data) {
 const raw = bookRes.data as unknown;
 const books = Array.isArray(raw) ? raw : (raw as Record<string, unknown>)?.items;
 if (Array.isArray(books)) bookResults.push(...(books as Book[]));
 }

 if (semRes.success && semRes.data) {
 const raw = semRes.data as unknown;
 const items = (Array.isArray(raw) ? raw : (raw as Record<string, unknown>)?.items) as Book[] | undefined;
 if (Array.isArray(items)) {
  const existingIds = new Set(bookResults.map((b) => b.id));
  for (const b of items) {
  if (!existingIds.has(b.id)) bookResults.push(b);
  }
 }
 }

 return bookResults;
}

// Normalize annotation API response into Highlight shape
function normalizeAnnotation(a: Record<string, unknown>): Highlight {
 return {
 id: a.id as string,
 content: (a.content as string) || (a.note as string) || '',
 type: a.type as string,
 bookId: (a.bookId ?? a.book_id) as string,
 createdAt: (a.createdAt ?? a.created_at) as string,
 };
}
