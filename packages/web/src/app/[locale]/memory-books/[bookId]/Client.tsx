'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { api } from '@/lib/api';
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
  if (mirrorRes.success && mirrorRes.data) {
  setMirror(mirrorRes.data);
  }
  if (bookRes.success && bookRes.data) {
  setBookTitle(bookRes.data.title);
  setBookAuthor(bookRes.data.author);
  setCoverUrl(bookRes.data.coverUrl);
  }
 }).catch((err) => {
  console.warn('MemoryBookDetail: failed to load', err);
  if (mountedRef.current) setError(t('failedToLoad'));
  })
 .finally(() => { if (mountedRef.current) setLoading(false); });
 }, [bookId, t]);

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
  });
  if (genTimerRef.current) { clearInterval(genTimerRef.current); genTimerRef.current = null; }
  if (!mountedRef.current) return;
  setGenStep('done');

  if (res.success && res.data) {
  setMirror(res.data);
  } else {
  setError(t('generationEmpty'));
  setGenStep('error');
  }
 } catch (err) {
  console.warn('MemoryBookDetail: generate failed', err);
  if (genTimerRef.current) { clearInterval(genTimerRef.current); genTimerRef.current = null; }
  if (!mountedRef.current) return;
  setError(t('generationFailedError'));
  setGenStep('error');
 } finally {
  if (mountedRef.current) setGenerating(false);
 }
 }, [bookId, t]);

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
  toast(t('popupBlocked'), 'error');
  return;
 }
 printWindow.document.write(mirror.htmlContent);
 printWindow.document.close();
 printWindow.onload = () => printWindow.print();
 }, [mirror, toast, t]);

 // ---------------------------------------------------------------------------
 // Loading state
 // ---------------------------------------------------------------------------
 if (loading) {
 return (
  <div className="px-4 sm:px-6 lg:px-8 py-12 animate-fade-in">
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
