'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { warn } from '@/lib/logger';
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
 const tRef = useRef(t);
 tRef.current = t;
 usePageTitle(t('page_title'));
 const [query, setQuery] = useState('');
 const [results, setResults] = useState<Book[]>([]);
 const [highlights, setHighlights] = useState<Highlight[]>([]);
 const [searching, setSearching] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [searched, setSearched] = useState(false);
 const [recentBooks, setRecentBooks] = useState<Book[]>([]);
 const [recentLoading, setRecentLoading] = useState(true);
 const [recentError, setRecentError] = useState<string | null>(null);
 const [recentFetchKey, setRecentFetchKey] = useState(0);

 const [filter, setFilter] = useState<FilterKey>('all');
 const [fetchKey, setFetchKey] = useState(0);
 const retrySearch = useCallback(() => setFetchKey((k) => k + 1), []);
 const retryRecent = useCallback(() => setRecentFetchKey((k) => k + 1), []);

 // Load recent books for recommendations when no search
 useEffect(() => {
 let stale = false;
 setRecentLoading(true);
 setRecentError(null);
 function loadRecent() {
  api.get<Book[]>('/api/books')
  .then((res) => {
  if (stale) return;
  if (res.success && res.data) {
   const data = res.data;
   setRecentBooks(Array.isArray(data) ? data.slice(0, 6) : []);
  } else {
   setRecentBooks([]);
   setRecentError(tRef.current('failed_recent'));
  }
  })
  .catch((err) => {
  if (stale) return;
  warn('SearchPage: recent books load failed', err);
  setRecentBooks([]);
  setRecentError(tRef.current('failed_recent'));
  })
  .finally(() => {
  if (!stale) setRecentLoading(false);
  });
 }
 loadRecent();
 const onFocus = () => { loadRecent(); };
 window.addEventListener('focus', onFocus);
 return () => { stale = true; window.removeEventListener('focus', onFocus); };
 }, [recentFetchKey]);

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

  const failedCount = settled.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;
  if (failedCount === 3) {
   warn('search: all 3 search queries failed');
   setError(tRef.current('failed_search'));
  } else if (failedCount > 0) {
   warn(`search: ${failedCount} of 3 search queries failed`);
   setError(tRef.current('partial_failure'));
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
  } catch (err) {
  warn('Search: failed to search', err);
  if (stale) return;
  setError(tRef.current('failed_search'));
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
 }, [query, fetchKey]);

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
 <section aria-label={t('page_title')} className="container-shell px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
  {/* Header */}
  <div className="mb-6 sm:mb-8">
  <h1 className="text-[28px] font-bold text-gray-900 dark:text-gray-100">{t('page_title')}</h1>
  <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mt-1">{t('subtitle')}</p>
  </div>

  <SearchBar query={query} searching={searching} onQueryChange={setQuery} />

  {/* Error */}
  {error && (
  <div role="alert" className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-sm flex items-center justify-between">
   <span>{error}</span>
   <button
    type="button"
    onClick={retrySearch}
    className="ml-3 underline hover:text-red-800 dark:hover:text-red-200 min-h-[44px] inline-flex items-center focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none rounded"
   >
    {t('retry')}
   </button>
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
  recentError ? (
   <div role="alert" className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-sm flex items-center justify-between">
    <span>{recentError}</span>
    <button
     type="button"
     onClick={retryRecent}
     className="ml-3 underline hover:text-red-800 dark:hover:text-red-200 min-h-[44px] inline-flex items-center focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none rounded"
    >
     {t('retry')}
    </button>
   </div>
  ) : recentBooks.length > 0 ? (
   <RecentBooks books={recentBooks} />
  ) : !recentLoading ? (
   <EmptyLibrary />
  ) : null
  ) : null}
 </section>
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
