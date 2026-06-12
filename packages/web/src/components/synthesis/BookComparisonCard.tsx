'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { AnalysisResultView } from '@/components/synthesis/AnalysisResultView';
import type { AnalysisResult } from '@/components/synthesis/types';
import { warn } from '@/lib/logger';

interface BookOption {
 id: string;
 title: string;
 author?: string;
}

interface BookComparisonCardProps {
 books: BookOption[];
}

export const BookComparisonCard = React.memo(function BookComparisonCard({ books }: BookComparisonCardProps) {
 const t = useTranslations('synthesis');
 const tRef = useRef(t); tRef.current = t;
  const [compareBook1, setCompareBook1] = useState<string>('');
 const [compareBook2, setCompareBook2] = useState<string>('');
 const [compareLoading, setCompareLoading] = useState(false);
 const [compareResult, setCompareResult] = useState<AnalysisResult | null>(null);
 const [compareError, setCompareError] = useState<string | null>(null);

 const handleCompare = useCallback(async () => {
 if (!compareBook1 || !compareBook2 || compareBook1 === compareBook2) return;
 setCompareLoading(true);
 setCompareError(null);
 setCompareResult(null);
 try {
  const res = await api.post<AnalysisResult>('/api/synthesis/cross-book/compare', {
  bookId1: compareBook1,
  bookId2: compareBook2,
  }, { timeout: 120_000 });
  if (res.success && res.data) {
  setCompareResult(res.data);
  } else {
  setCompareError(tRef.current('analysis_failed'));
  }
 } catch (error) {
  warn('BookComparisonCard: compare failed', error);
  setCompareError(tRef.current('network_error'));
 } finally {
  setCompareLoading(false);
 }
 }, [compareBook1, compareBook2]);

 return (
 <div className="mb-6 p-4 sm:p-5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
  <div className="flex items-center gap-2 mb-1">
  <svg aria-hidden="true" className="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
  <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
   {t('compare_title')}
  </h3>
  </div>
  <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
  {t('compare_desc')}
  </p>

  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
  <div>
   <label htmlFor="compare-book-1" className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1 block">
   {t('compare_book_1')}
   </label>
   <select
   id="compare-book-1"
   value={compareBook1}
   onChange={(e) => setCompareBook1(e.target.value)}
   className="w-full px-3 py-2 text-sm border border-amber-200 rounded-lg bg-surface-0 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400"
   >
   <option value="">{t('compare_select')}</option>
   {books.map((book) => (
    <option key={book.id} value={book.id}>
    {book.title}{book.author ? ` — ${book.author}` : ''}
    </option>
   ))}
   </select>
  </div>
  <div>
   <label htmlFor="compare-book-2" className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1 block">
   {t('compare_book_2')}
   </label>
   <select
   id="compare-book-2"
   value={compareBook2}
   onChange={(e) => setCompareBook2(e.target.value)}
   className="w-full px-3 py-2 text-sm border border-amber-200 rounded-lg bg-surface-0 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400"
   >
   <option value="">{t('compare_select')}</option>
   {books.map((book) => (
    <option key={book.id} value={book.id}>
    {book.title}{book.author ? ` — ${book.author}` : ''}
    </option>
   ))}
   </select>
  </div>
  </div>

  {compareBook1 && compareBook2 && compareBook1 === compareBook2 && (
  <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">{t('same_book_error')}</p>
  )}

  <button type="button"
  onClick={handleCompare}
  disabled={compareLoading || !compareBook1 || !compareBook2 || compareBook1 === compareBook2}
  className="w-full px-4 py-2 text-sm font-medium rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
  >
  {compareLoading ? (
   <>
   <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
   {t('analyzing')}
   </>
  ) : (
   <>
   <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
   </svg>
   {t('compare_button')}
   </>
  )}
  </button>

  {compareError && (
  <div role="alert" className="mt-3 p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
   {compareError}
  </div>
  )}

  {compareResult && (
  <div className="mt-3 p-3 rounded-lg border border-amber-200 bg-surface-0">
   <h4 className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-2">
   {t('results_title')}
   </h4>
   <AnalysisResultView result={compareResult} />
  </div>
  )}
 </div>
 );
});
