'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { api } from '@/lib/api';
import { warn } from '@/lib/logger';
import { useToast } from '@/components/Toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import type { MirrorSection } from '@/components/reading-mirror/SectionRenderer';
import GeneratingState, { type GenerationStep } from '@/components/memory-books/GeneratingState';
import { ErrorState, EmptyCta } from '@/components/memory-books/FallbackStates';
import ActionButtons from '@/components/memory-books/ActionButtons';
import SectionNav from '@/components/memory-books/SectionNav';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReadingMirror {
 id: string;
 bookId: string;
 title: string;
 format: string;
 sections: MirrorSection[];
 htmlContent: string | null;
 version: number;
 stats: Record<string, number>;
 generatedAt: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReadingMirrorPage() {
 const t = useTranslations('memoryBooks');
 const locale = useLocale();
 const tc = useTranslations('common');
 const { toast } = useToast();
 usePageTitle(t('detailPageTitle'));
 const params = useParams();
 const bookId = (params?.bookId ?? '') as string;

 const [mirror, setMirror] = useState<ReadingMirror | null>(null);
 const [bookTitle, setBookTitle] = useState('');
 const [bookAuthor, setBookAuthor] = useState('');
 const [coverUrl, setCoverUrl] = useState<string | undefined>();
 const [loading, setLoading] = useState(true);
 const [generating, setGenerating] = useState(false);
 const [genStep, setGenStep] = useState<GenerationStep>('idle');
 const [error, setError] = useState<string | null>(null);
 const genTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
 const mountedRef = useRef(true);
 const tRef = useRef(t);
 tRef.current = t;
 useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; if (genTimerRef.current) clearInterval(genTimerRef.current); }; }, []);

 // Fetch existing mirror + book metadata
 const fetchData = useCallback(() => {
 if (!bookId) return;
 setLoading(true);
 setError(null);
 Promise.all([
  api.get<ReadingMirror>(`/api/v1/reading-book/${bookId}`),
  api.get<{ title: string; author: string; coverUrl?: string }>(`/api/books/${bookId}`),
 ]).then(([mirrorRes, bookRes]) => {
  if (!mountedRef.current) return;
  let anySuccess = false;
  if (mirrorRes.success && mirrorRes.data) {
  setMirror(mirrorRes.data);
  anySuccess = true;
  }
  if (bookRes.success && bookRes.data) {
  setBookTitle(bookRes.data.title);
  setBookAuthor(bookRes.data.author);
  setCoverUrl(bookRes.data.coverUrl);
  anySuccess = true;
  }
  if (!anySuccess) {
  setError(tRef.current('failedToLoad'));
  }
 }).catch((err) => {
  warn('MemoryBookDetail: failed to load', err);
  if (mountedRef.current) setError(tRef.current('failedToLoad'));
  })
 .finally(() => { if (mountedRef.current) setLoading(false); });
 }, [bookId]);

 useEffect(() => { fetchData(); }, [fetchData]);

 // Refetch on tab focus
 useEffect(() => {
 const onFocus = () => { if (!generating) fetchData(); };
 window.addEventListener('focus', onFocus);
 return () => window.removeEventListener('focus', onFocus);
 }, [fetchData, generating]);

 // Generate reading mirror
 const handleGenerate = useCallback(async () => {
 setGenerating(true);
 setError(null);

 const steps: GenerationStep[] = ['collecting', 'analyzing', 'curating', 'synthesizing', 'rendering', 'finishing'];
 let stepIdx = 0;
 if (genTimerRef.current) clearInterval(genTimerRef.current);
 genTimerRef.current = setInterval(() => {
  stepIdx++;
  if (stepIdx < steps.length && mountedRef.current) {
   setGenStep(steps[stepIdx]);
  }
 }, 5000);
 setGenStep(steps[0]);

 try {
  const res = await api.post<ReadingMirror>(`/api/v1/reading-book/${bookId}/generate`, {
  format: 'reading_mirror',
  }, { timeout: 120_000 });
  if (genTimerRef.current) { clearInterval(genTimerRef.current); genTimerRef.current = null; }
  if (!mountedRef.current) return;
  setGenStep('done');

  if (res.success && res.data) {
  setMirror(res.data);
  } else {
  setError(tRef.current('generationEmpty'));
  setGenStep('error');
  }
 } catch (err) {
  warn('MemoryBookDetail: generate failed', err);
  if (genTimerRef.current) { clearInterval(genTimerRef.current); genTimerRef.current = null; }
  if (!mountedRef.current) return;
  setError(tRef.current('generationFailedError'));
  setGenStep('error');
 } finally {
  if (mountedRef.current) setGenerating(false);
 }
 }, [bookId]);

 // Download as HTML
 const handleDownload = useCallback(() => {
 if (!mirror?.htmlContent) return;
 const blob = new Blob([mirror.htmlContent], { type: 'text/html' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `${bookTitle.replace(/[<>:\"/\\|?*]/g, '_')}_reading_mirror.html`;
 a.click();
 URL.revokeObjectURL(url);
 }, [mirror, bookTitle]);

 // Print
 const handlePrint = useCallback(() => {
 if (!mirror?.htmlContent) return;
 const printWindow = window.open('', '_blank');
 if (!printWindow) {
  toast(tRef.current('popupBlocked'), 'error');
  return;
 }
 printWindow.document.write(mirror.htmlContent);
 printWindow.document.close();
 printWindow.onload = () => printWindow.print();
 }, [mirror, toast]);

 // ---------------------------------------------------------------------------
 // Loading state
 // ---------------------------------------------------------------------------
 if (loading) {
 return (
  <div aria-busy="true" className="px-4 sm:px-6 lg:px-8 py-12 animate-fade-in">
  {/* Back link skeleton */}
  <div className="mb-8">
   <div className="h-4 bg-surface-2 rounded-lg w-20 animate-pulse" />
  </div>
  {/* Title skeleton */}
  <div className="mb-6">
   <div className="h-8 bg-surface-2 rounded-lg w-3/4 animate-pulse mb-3" />
   <div className="h-4 bg-surface-2 rounded-lg w-1/2 animate-pulse" />
  </div>
  {/* Section cards skeleton */}
  <div className="space-y-4">
   {Array.from({ length: 4 }).map((_, i) => (
   <div key={i} className="bg-surface-0 rounded-2xl border border-surface-3 p-6 animate-pulse">
    <div className="h-5 bg-surface-1 rounded w-1/3 mb-3" />
    <div className="h-4 bg-surface-1 rounded w-full mb-2" />
    <div className="h-4 bg-surface-1 rounded w-4/5" />
   </div>
   ))}
  </div>
  </div>
 );
 }

 // ---------------------------------------------------------------------------
 // Generating state
 // ---------------------------------------------------------------------------
 if (generating) {
 return <GeneratingState genStep={genStep} />;
 }

 if (error && !mirror) {
 return <ErrorState error={error} onRetry={fetchData} />;
 }

 if (!mirror) {
 return <EmptyCta onGenerate={handleGenerate} />;
 }

 const failedCount = mirror.sections.filter((s) => !!s.error).length;
 const total = mirror.sections.length;
 const allFailed = total > 0 && failedCount === total;

 // ---------------------------------------------------------------------------
 // Mirror display
 // ---------------------------------------------------------------------------
 return (
 <div className="px-4 sm:px-6 lg:px-8 py-6 animate-fade-in">
  {/* Top bar */}
  <div className="flex items-center justify-between mb-4">
  <div className="flex items-center gap-3">
   <Link
   href="/memory-books"
   aria-label={tc('back')}
   className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
   >
   <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
   </svg>
   </Link>
   <div>
   <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">{bookTitle || mirror.title}</h1>
   <p className="text-xs text-gray-500 dark:text-gray-400">
    {t('generatedDate', { date: mirror.generatedAt ? new Date(mirror.generatedAt).toLocaleDateString(locale) : '' })}
    {mirror.version > 1 && <span className="ml-1 opacity-60">(v{mirror.version})</span>}
   </p>
   </div>
  </div>
  <ActionButtons
   onRegenerate={handleGenerate}
   onDownload={handleDownload}
   onPrint={handlePrint}
  />
  </div>

  {/* Broken mirror banner — surface when most or all sections errored */}
  {failedCount > 0 && (
  <div
  role="alert"
  className={`mb-4 rounded-xl border p-4 flex items-start gap-3 ${
   allFailed
   ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40'
   : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40'
  }`}
  >
  <svg aria-hidden="true" className={`w-5 h-5 flex-shrink-0 mt-0.5 ${allFailed ? 'text-red-500 dark:text-red-400' : 'text-amber-500 dark:text-amber-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z" />
  </svg>
  <div className="flex-1 min-w-0">
   <p className={`text-sm font-medium ${allFailed ? 'text-red-800 dark:text-red-200' : 'text-amber-800 dark:text-amber-200'}`}>
   {allFailed
    ? t('mirror_completely_broken')
    : t('mirror_partially_broken', { failed: failedCount, total })}
   </p>
   <button
   type="button"
   onClick={handleGenerate}
   disabled={generating}
   className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
   >
   <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
   </svg>
   {t('regenerate_cta')}
   </button>
  </div>
  </div>
  )}

  {/* Section navigation + content */}
  <SectionNav
  sections={mirror.sections}
  bookId={bookId}
  bookTitle={bookTitle}
  bookAuthor={bookAuthor}
  coverUrl={coverUrl}
  locale={locale}
  />
 </div>
 );
}
