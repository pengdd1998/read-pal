'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { AnalysisResultView } from '@/components/synthesis/AnalysisResultView';
import type { AnalysisResult } from '@/components/synthesis/types';

interface BookOption {
  id: string;
  title: string;
  author?: string;
}

type AnalysisMode = 'cross_reference' | 'concept_map' | 'contradictions' | 'summary' | 'synthesize';

const MODES: { key: AnalysisMode; icon: string }[] = [
  { key: 'cross_reference', icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1' },
  { key: 'concept_map', icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7' },
  { key: 'contradictions', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
  { key: 'summary', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { key: 'synthesize', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' },
];

export default function SynthesisPage() {
  const t = useTranslations('synthesis');
  const { toast } = useToast();
  usePageTitle(t('page_title'));
  const [books, setBooks] = useState<BookOption[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string>('');
  const [mode, setMode] = useState<AnalysisMode>('cross_reference');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [booksLoading, setBooksLoading] = useState(true);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compareBook1, setCompareBook1] = useState<string>('');
  const [compareBook2, setCompareBook2] = useState<string>('');
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareResult, setCompareResult] = useState<AnalysisResult | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  // Fetch user's books on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<BookOption[]>('/api/books');
        if (!cancelled && res.success && res.data) {
          setBooks(res.data);
        }
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setBooksLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!selectedBookId || !query.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<AnalysisResult>(`/api/synthesis/${selectedBookId}`, {
        query: query.trim(),
        mode,
      });
      if (res.success && res.data) {
        setResult(res.data);
      } else {
        setError(res.error?.message || t('analysis_failed'));
      }
    } catch {
      setError(t('network_error'));
    } finally {
      setLoading(false);
    }
  }, [selectedBookId, query, mode, t]);

  const handleCrossBook = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.get<AnalysisResult>('/api/synthesis/cross-book');
      if (res.success && res.data) {
        setResult(res.data);
      } else {
        setError(res.error?.message || t('analysis_failed'));
      }
    } catch {
      setError(t('network_error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const handleCompare = useCallback(async () => {
    if (!compareBook1 || !compareBook2 || compareBook1 === compareBook2) return;
    setCompareLoading(true);
    setCompareError(null);
    setCompareResult(null);
    try {
      const res = await api.post<AnalysisResult>('/api/synthesis/cross-book/compare', {
        bookId1: compareBook1,
        bookId2: compareBook2,
      });
      if (res.success && res.data) {
        setCompareResult(res.data);
      } else {
        setCompareError(res.error?.message || t('analysis_failed'));
      }
    } catch {
      setCompareError(t('network_error'));
    } finally {
      setCompareLoading(false);
    }
  }, [compareBook1, compareBook2, t]);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in max-w-4xl mx-auto">
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
            onClick={handleCrossBook}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            )}
            {t('run_cross_book')}
          </button>
        </div>
      </div>

      {/* Book Comparison section */}
      <div className="mb-6 p-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
        <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">
          {t('compare_title')}
        </h3>
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
          {t('compare_desc')}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1 block">
              {t('compare_book_1')}
            </label>
            <select
              value={compareBook1}
              onChange={(e) => setCompareBook1(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-amber-200 dark:border-amber-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
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
            <label className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1 block">
              {t('compare_book_2')}
            </label>
            <select
              value={compareBook2}
              onChange={(e) => setCompareBook2(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-amber-200 dark:border-amber-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
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

        <button
          onClick={handleCompare}
          disabled={compareLoading || !compareBook1 || !compareBook2 || compareBook1 === compareBook2}
          className="w-full px-4 py-2 text-sm font-medium rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {compareLoading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              {t('analyzing')}
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              {t('compare_button')}
            </>
          )}
        </button>

        {/* Comparison error */}
        {compareError && (
          <div className="mt-3 p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
            {compareError}
          </div>
        )}

        {/* Comparison result */}
        {compareResult && (
          <div className="mt-3 p-3 rounded-lg border border-amber-200 dark:border-amber-700 bg-white dark:bg-gray-900">
            <h4 className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-2">
              {t('results_title')}
            </h4>
            <AnalysisResultView result={compareResult} />
          </div>
        )}
      </div>

      {/* Single-book analysis section */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-4">
          {t('single_book_title')}
        </h3>

        {/* Book selector */}
        <div className="mb-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
            {t('select_book')}
          </label>
          {booksLoading ? (
            <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
          ) : (
            <select
              value={selectedBookId}
              onChange={(e) => setSelectedBookId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
            >
              <option value="">{t('choose_book')}</option>
              {books.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title}{book.author ? ` — ${book.author}` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Mode selector */}
        <div className="mb-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">
            {t('analysis_mode')}
          </label>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('analysis_mode')}>
            {MODES.map((m) => (
              <button
                key={m.key}
                role="radio"
                aria-checked={mode === m.key}
                onClick={() => setMode(m.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  mode === m.key
                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-750'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={m.icon} />
                </svg>
                {t(`mode_${m.key}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Query input */}
        <div className="mb-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
            {t('query_label')}
          </label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('query_placeholder')}
            rows={3}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 resize-none"
          />
        </div>

        {/* Run button */}
        <button
          onClick={handleAnalyze}
          disabled={loading || !selectedBookId || !query.trim()}
          className="w-full px-4 py-2.5 text-sm font-medium rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              {t('analyzing')}
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {t('run_analysis')}
            </>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-4">
            {t('results_title')}
          </h3>
          <AnalysisResultView result={result} />
        </div>
      )}

      {/* Empty state */}
      {!result && !error && !loading && (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
          <p className="text-sm">{t('empty_state')}</p>
        </div>
      )}
    </div>
  );
}
