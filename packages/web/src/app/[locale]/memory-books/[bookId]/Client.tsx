'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
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
 const tc = useTranslations('common');
 usePageTitle(t('detailPageTitle'));
 const params = useParams();
 const locale = (params?.locale as string) || 'en';
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
 useEffect(() => () => { mountedRef.current = false; if (genTimerRef.current) clearInterval(genTimerRef.current); }, []);

 // Fetch existing mirror + book metadata
 useEffect(() => {
 if (!bookId) return;
 let stale = false;
 Promise.all([
  api.get<ReadingMirror>(`/api/v1/reading-book/${bookId}`),
  api.get<{ title: string; author: string; coverUrl?: string }>(`/api/books/${bookId}`),
 ]).then(([mirrorRes, bookRes]) => {
  if (stale) return;
  if (mirrorRes.success && mirrorRes.data) {
  setMirror(mirrorRes.data);
  }
  if (bookRes.success && bookRes.data) {
  setBookTitle(bookRes.data.title);
  setBookAuthor(bookRes.data.author);
  setCoverUrl(bookRes.data.coverUrl);
  }
 }).catch(() => {
  if (!stale) setError(t('failedToLoad'));
  })
 .finally(() => { if (!stale) setLoading(false); });
 return () => { stale = true; };
 }, [bookId]);

 // Generate reading mirror
 const handleGenerate = useCallback(async () => {
 setGenerating(true);
 setError(null);

 const steps: GenerationStep[] = ['collecting', 'analyzing', 'curating', 'synthesizing', 'rendering'];
 let stepIdx = 0;
 if (genTimerRef.current) clearInterval(genTimerRef.current);
 genTimerRef.current = setInterval(() => {
  stepIdx++;
  if (stepIdx < steps.length && mountedRef.current) setGenStep(steps[stepIdx]);
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
 } catch {
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
 a.download = `${bookTitle.replace(/[^a-zA-Z0-9]/g, '_')}_reading_mirror.html`;
 a.click();
 URL.revokeObjectURL(url);
 }, [mirror, bookTitle]);

 // Print
 const handlePrint = useCallback(() => {
 if (!mirror?.htmlContent) return;
 const printWindow = window.open('', '_blank');
 if (printWindow) {
  printWindow.document.write(mirror.htmlContent);
  printWindow.document.close();
  printWindow.onload = () => printWindow.print();
 }
 }, [mirror]);

 // ---------------------------------------------------------------------------
 // Loading state
 // ---------------------------------------------------------------------------
 if (loading) {
 return (
  <div className="px-4 sm:px-6 lg:px-8 py-12 text-center">
  <div className="w-12 h-12 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
  <p className="text-gray-500">{t('loading')}</p>
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
 return <ErrorState error={error} onRetry={handleGenerate} />;
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
   className="p-2 rounded-lg text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
   >
   <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
   </svg>
   </Link>
   <div>
   <h1 className="text-lg font-bold text-gray-900">{bookTitle || mirror.title}</h1>
   <p className="text-xs text-gray-400">
    {t('generatedDate', { date: mirror.generatedAt ? new Date(mirror.generatedAt).toLocaleDateString() : '' })}
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
