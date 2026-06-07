'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';
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

interface SingleBookAnalysisCardProps {
 books: BookOption[];
 booksLoading: boolean;
 booksError: string | null;
}

export function SingleBookAnalysisCard({ books, booksLoading, booksError }: SingleBookAnalysisCardProps) {
 const t = useTranslations('synthesis');
 const { toast } = useToast();
 const [selectedBookId, setSelectedBookId] = useState<string>('');
 const [mode, setMode] = useState<AnalysisMode>('cross_reference');
 const [query, setQuery] = useState('');
 const [loading, setLoading] = useState(false);
 const [result, setResult] = useState<AnalysisResult | null>(null);
 const [error, setError] = useState<string | null>(null);

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
  setError(t('analysis_failed'));
  }
 } catch {
  setError(t('network_error'));
 } finally {
  setLoading(false);
 }
 }, [selectedBookId, query, mode, t]);

 return (
 <>
  {/* Single-book analysis form */}
  <div className="bg-surface-0 rounded-xl border border-surface-3 p-5 mb-6">
  <h3 className="text-sm font-semibold text-gray-800 mb-4">
   {t('single_book_title')}
  </h3>

  {/* Book selector */}
  <div className="mb-4">
   <label className="text-xs font-medium text-gray-500 mb-1 block">
   {t('select_book')}
   </label>
   {booksLoading ? (
   <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
   ) : booksError ? (
   <div className="px-3 py-2.5 text-sm rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300">
    {booksError}
   </div>
   ) : (
   <select
    value={selectedBookId}
    onChange={(e) => setSelectedBookId(e.target.value)}
    className="w-full px-3 py-2.5 text-sm border border-surface-3 rounded-lg bg-surface-0 text-gray-800"
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
   <label className="text-xs font-medium text-gray-500 mb-2 block">
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
     : 'bg-gray-50 text-gray-600 border border-surface-3 hover:bg-gray-100'
    }`}
    >
    <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     <path strokeLinecap="round" strokeLinejoin="round" d={m.icon} />
    </svg>
    {t(`mode_${m.key}`)}
    </button>
   ))}
   </div>
  </div>

  {/* Query input */}
  <div className="mb-4">
   <label className="text-xs font-medium text-gray-500 mb-1 block">
   {t('query_label')}
   </label>
   <textarea
   value={query}
   onChange={(e) => setQuery(e.target.value)}
   placeholder={t('query_placeholder')}
   rows={3}
   className="w-full px-3 py-2.5 text-sm border border-surface-3 rounded-lg bg-surface-0 text-gray-800 resize-none"
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
    <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
  <div className="bg-surface-0 rounded-xl border border-surface-3 p-5">
   <h3 className="text-sm font-semibold text-gray-800 mb-4">
   {t('results_title')}
   </h3>
   <AnalysisResultView result={result} />
  </div>
  )}

  {/* Empty state */}
  {!result && !error && !loading && (
  <div className="text-center py-12 text-gray-400">
   <svg aria-hidden="true" className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
   </svg>
   <p className="text-sm">{t('empty_state')}</p>
  </div>
  )}
 </>
 );
}
