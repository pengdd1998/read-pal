'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { warn } from '@/lib/logger';
import { usePageTitle } from '@/hooks/usePageTitle';
import { BookComparisonCard } from '@/components/synthesis/BookComparisonCard';
import { SingleBookAnalysisCard } from '@/components/synthesis/SingleBookAnalysisCard';
import { AnalysisResultView } from '@/components/synthesis/AnalysisResultView';
import type { AnalysisResult } from '@/components/synthesis/types';

interface BookOption {
 id: string;
 title: string;
 author?: string;
}

export default function SynthesisPage() {
 const t = useTranslations('synthesis');
  usePageTitle(t('page_title'));
 const [books, setBooks] = useState<BookOption[]>([]);
 const [booksLoading, setBooksLoading] = useState(true);
 const [booksError, setBooksError] = useState<string | null>(null);
 const [loading, setLoading] = useState(false);
 const [result, setResult] = useState<AnalysisResult | null>(null);
 const [error, setError] = useState<string | null>(null);

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
  if (!cancelled) setBooksError(t('network_error'));
  } finally {
  if (!cancelled) setBooksLoading(false);
  }
 })();
 return () => { cancelled = true; };
 }, []);

 const handleCrossBook = useCallback(async () => {
 setLoading(true);
 setError(null);
 setResult(null);
 try {
  const res = await api.get<AnalysisResult>('/api/synthesis/cross-book');
  if (res.success && res.data) {
  setResult(res.data);
  } else {
  setError(t('analysis_failed'));
  }
 } catch (err) {
  warn('Synthesis: analysis failed', err);
  setError(t('network_error'));
 } finally {
  setLoading(false);
 }
 }, [t]);

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

 return (
 <section id="main-content" aria-label={t('page_title')} className="px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in max-w-4xl mx-auto">
  {/* Header */}
  <div className="mb-8">
  <h1 className="text-2xl font-bold text-gray-900">
   {t('page_title')}
  </h1>
  <p className="mt-1 text-sm text-gray-500">
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
  <div className="mb-6 p-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 flex items-center justify-between">
   <span>{error}</span>
   <button type="button" onClick={() => { setError(null); handleCrossBook(); }} className="text-xs font-medium underline hover:no-underline min-h-[44px] inline-flex items-center">{t('retry')}</button>
  </div>
  )}

  {result && (
  <div className="mb-6 bg-surface-0 rounded-xl border border-surface-3 p-5">
   <h3 className="text-sm font-semibold text-gray-800 mb-4">
   {t('results_title')}
   </h3>
   <AnalysisResultView result={result} />
  </div>
  )}

  <BookComparisonCard books={books} />
  <SingleBookAnalysisCard books={books} booksLoading={booksLoading} booksError={booksError} />
 </section>
 );
}
