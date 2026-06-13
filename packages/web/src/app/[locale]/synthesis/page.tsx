'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { Link } from '@/i18n/navigation';
import { warn } from '@/lib/logger';
import { usePageTitle } from '@/hooks/usePageTitle';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import type { AnalysisResult } from '@/components/synthesis/types';

const BookComparisonCard = dynamic(
  () => import('@/components/synthesis/BookComparisonCard').then((m) => m.BookComparisonCard),
);
const SingleBookAnalysisCard = dynamic(
  () => import('@/components/synthesis/SingleBookAnalysisCard').then((m) => m.SingleBookAnalysisCard),
);
const AnalysisResultView = dynamic(
  () => import('@/components/synthesis/AnalysisResultView').then((m) => m.AnalysisResultView),
);

interface BookOption {
 id: string;
 title: string;
 author?: string;
}

export default function SynthesisPage() {
 const t = useTranslations('synthesis');
 const tRef = useRef(t);
 tRef.current = t;
  usePageTitle(t('page_title'));
 const [books, setBooks] = useState<BookOption[]>([]);
 const [booksLoading, setBooksLoading] = useState(true);
 const [booksError, setBooksError] = useState<string | null>(null);
 const [loading, setLoading] = useState(false);
 const [result, setResult] = useState<AnalysisResult | null>(null);
 const [error, setError] = useState<string | null>(null);
 const abortRef = useRef<AbortController | null>(null);

 // Fetch user's books on mount
 useEffect(() => {
 let cancelled = false;
 (async () => {
  setBooksError(null);
  try {
  const res = await api.get<BookOption[]>('/api/books');
  if (!cancelled && res.success && res.data) {
   setBooks(res.data);
  }
  } catch (err) {
  warn('Synthesis: failed to load books', err);
  if (!cancelled) setBooksError(tRef.current('network_error'));
  } finally {
  if (!cancelled) setBooksLoading(false);
  }
 })();
 return () => { cancelled = true; };
 }, []);

 // Cleanup cross-book analysis on unmount
 useEffect(() => () => { abortRef.current?.abort(); }, []);

 const handleCrossBook = useCallback(async () => {
 abortRef.current?.abort();
 const controller = new AbortController();
 abortRef.current = controller;
 setLoading(true);
 setError(null);
 setResult(null);
 try {
  const res = await api.get<AnalysisResult>('/api/synthesis/cross-book', undefined, { timeout: 120_000 });
  if (controller.signal.aborted) return;
  if (res.success && res.data) {
  setResult(res.data);
  } else {
  setError(tRef.current('analysis_failed'));
  }
 } catch (err) {
  if (controller.signal.aborted) return;
  warn('Synthesis: analysis failed', err);
  setError(tRef.current('network_error'));
 } finally {
  if (!controller.signal.aborted) setLoading(false);
 }
 }, []);

 if (booksLoading) {
 return (
  <div className="px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in max-w-4xl mx-auto">
  <div className="mb-8">
   <div className="h-8 bg-surface-2 rounded-lg w-48 animate-pulse" />
   <div className="h-4 bg-surface-2 rounded-lg w-72 mt-2 animate-pulse" />
  </div>
  <div className="space-y-4">
   <div className="h-24 rounded-xl bg-surface-1 animate-pulse" />
   <div className="h-48 rounded-xl bg-surface-1 animate-pulse" />
   <div className="h-64 rounded-xl bg-surface-1 animate-pulse" />
  </div>
  </div>
 );
 }

 if (!booksLoading && books.length === 0 && !booksError) {
 return (
  <section aria-label={t('page_title')} className="px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in max-w-4xl mx-auto">
  <div className="mb-8">
   <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('page_title')}</h1>
   <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('page_subtitle')}</p>
  </div>
  <div className="flex flex-col items-center justify-center py-16">
   <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
   <svg aria-hidden="true" className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
   </svg>
   </div>
   <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('empty_books_title')}</h2>
   <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-sm text-center">{t('empty_books_message')}</p>
   <Link href="/library" className="btn btn-primary">{t('empty_books_action')}</Link>
  </div>
  </section>
 );
 }

 return (
 <section aria-label={t('page_title')} className="px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in max-w-4xl mx-auto">
  {/* Header */}
  <div className="mb-8">
  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
   {t('page_title')}
  </h1>
  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
   {t('page_subtitle')}
  </p>
  </div>

  {/* Cross-book analysis button */}
  <div className="mb-6 p-4 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20">
  <div className="flex items-center justify-between">
   <div>
   <h3 className="text-sm font-semibold text-teal-800 dark:text-teal-200">
    {t('cross_book_title')}
   </h3>
   <p className="text-xs text-teal-600 dark:text-teal-400 mt-0.5">
    {t('cross_book_desc')}
   </p>
   </div>
   <button
   type="button"
   onClick={handleCrossBook}
   disabled={loading}
   className="px-4 py-2.5 text-sm font-medium rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 min-h-[44px]"
   >
   {loading ? (
    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
   ) : (
    <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
   )}
   {t('run_cross_book')}
   </button>
  </div>
  </div>

  {error && (
  <div role="alert" className="mb-6 p-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 flex items-center justify-between">
   <span>{error}</span>
   <button type="button" onClick={() => { setError(null); handleCrossBook(); }} className="text-xs font-medium underline hover:no-underline min-h-[44px] inline-flex items-center focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none rounded">{t('retry')}</button>
  </div>
  )}

  {result && (
  <div className="mb-6 bg-surface-0 rounded-xl border border-surface-3 p-5">
   <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-4">
   {t('results_title')}
   </h3>
   <ErrorBoundary label="AnalysisResult">
     <AnalysisResultView result={result} />
   </ErrorBoundary>
  </div>
  )}

  <ErrorBoundary label="BookComparison">
    <BookComparisonCard books={books} />
  </ErrorBoundary>
  <ErrorBoundary label="SingleBookAnalysis">
    <SingleBookAnalysisCard books={books} booksLoading={booksLoading} booksError={booksError} />
  </ErrorBoundary>
 </section>
 );
}
