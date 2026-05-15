'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { usePageTitle } from '@/hooks/usePageTitle';
import SectionRenderer, { getSectionTitle, type MirrorSection } from '@/components/reading-mirror/SectionRenderer';

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

type GenerationStep = 'idle' | 'collecting' | 'analyzing' | 'curating' | 'synthesizing' | 'rendering' | 'done' | 'error';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReadingMirrorPage() {
  const t = useTranslations('memoryBooks');
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
  const [activeSection, setActiveSection] = useState(0);

  // Fetch existing mirror + book metadata
  useEffect(() => {
    if (!bookId) return;
    Promise.all([
      api.get<ReadingMirror>(`/api/memory-books/${bookId}`),
      api.get<{ title: string; author: string; coverUrl?: string }>(`/api/books/${bookId}`),
    ]).then(([mirrorRes, bookRes]) => {
      if (mirrorRes.success && mirrorRes.data) {
        setMirror(mirrorRes.data);
      }
      if (bookRes.success && bookRes.data) {
        setBookTitle(bookRes.data.title);
        setBookAuthor(bookRes.data.author);
        setCoverUrl(bookRes.data.coverUrl);
      }
    }).catch(() => { /* ignore */ })
    .finally(() => setLoading(false));
  }, [bookId]);

  // Generate reading mirror
  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);

    const steps: GenerationStep[] = ['collecting', 'analyzing', 'curating', 'synthesizing', 'rendering'];
    let stepIdx = 0;
    const timer = setInterval(() => {
      stepIdx++;
      if (stepIdx < steps.length) setGenStep(steps[stepIdx]);
    }, 5000);
    setGenStep(steps[0]);

    try {
      const res = await api.post<ReadingMirror>(`/api/memory-books/${bookId}/generate`, {
        format: 'reading_mirror',
      });
      clearInterval(timer);
      setGenStep('done');

      if (res.success && res.data) {
        setMirror(res.data);
      } else {
        setError(t('generationEmpty'));
        setGenStep('error');
      }
    } catch {
      clearInterval(timer);
      setError(t('generationFailedError'));
      setGenStep('error');
    } finally {
      setGenerating(false);
    }
  }, [bookId, t]);

  // Download as HTML (legacy fallback)
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

  // Section navigation
  const sections = mirror?.sections || [];

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="w-12 h-12 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500">{t('loading')}</p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Generating state
  // ---------------------------------------------------------------------------
  if (generating) {
    const stepLabels: Record<GenerationStep, string> = {
      idle: t('starting'),
      collecting: t('stepCollecting'),
      analyzing: t('stepAnalyzing'),
      curating: t('stepCurating'),
      synthesizing: t('stepSynthesizing'),
      rendering: t('stepRendering'),
      done: t('stepDone'),
      error: t('stepError'),
    };

    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center animate-fade-in">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/30 dark:to-amber-800/30 flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('creatingTitle')}</h2>
        <p className="text-sm text-gray-500 mb-6">{t('creatingDesc')}</p>
        <div className="space-y-2">
          {steps_array.map((step) => (
            <div
              key={step}
              className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg transition-all ${
                genStep === step
                  ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 font-medium'
                  : 'text-gray-400'
              }`}
            >
              {genStep === step ? (
                <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <div className="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-700" />
              )}
              {stepLabels[step as GenerationStep]}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------
  if (error && !mirror) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center animate-fade-in">
        <div className="text-5xl mb-4">{'\u{1F614}'}</div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('generationFailed')}</h2>
        <p className="text-sm text-gray-500 mb-6">{error}</p>
        <div className="flex gap-3 justify-center">
          <button onClick={handleGenerate} className="btn btn-primary">{t('tryAgain')}</button>
          <Link href="/memory-books" className="btn bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
            {t('backToMemoryBooks')}
          </Link>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // No mirror yet — generate CTA
  // ---------------------------------------------------------------------------
  if (!mirror) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center animate-fade-in">
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/30 dark:to-teal-900/30 flex items-center justify-center">
          <span className="text-4xl">{'\u{1FA9E}'}</span>
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('yourPersonalBook')}</h2>
        <p className="text-sm text-gray-500 mb-8 max-w-sm mx-auto">{t('yourPersonalBookDesc')}</p>
        <button
          onClick={handleGenerate}
          className="px-6 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-600 hover:to-amber-700 transition-all shadow-lg hover:shadow-xl active:scale-95"
        >
          {t('createButton')}
        </button>
        <div className="mt-6">
          <Link href="/memory-books" className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            {t('backToMemoryBooks')}
          </Link>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Mirror display — React section renderer
  // ---------------------------------------------------------------------------
  return (
    <div className="max-w-6xl mx-auto px-4 py-6 animate-fade-in">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/memory-books"
            className="p-2 rounded-lg text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">{bookTitle || mirror.title}</h1>
            <p className="text-xs text-gray-400">
              {t('generatedDate', { date: mirror.generatedAt ? new Date(mirror.generatedAt).toLocaleDateString() : '' })}
              {mirror.version > 1 && <span className="ml-1 opacity-60">(v{mirror.version})</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerate}
            className="p-2 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
            title={t('regenerate_title')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={handleDownload}
            className="p-2 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
            title={t('download_html_title')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
          <button
            onClick={handlePrint}
            className="p-2 rounded-lg text-gray-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
            title={t('print_save_pdf')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile section dropdown */}
      {sections.length > 0 && (
        <div className="md:hidden mb-4">
          <select
            value={activeSection}
            onChange={(e) => setActiveSection(parseInt(e.target.value, 10))}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-surface-0 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {sections.map((section, i) => (
              <option key={section.id || i} value={i}>
                {getSectionTitle(section.type)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Main layout: sidebar + content */}
      <div className="flex gap-6">
        {/* Sidebar navigation (desktop) */}
        {sections.length > 0 && (
          <nav className="hidden md:block w-52 flex-shrink-0">
            <div className="sticky top-6 space-y-0.5">
              {sections.map((section, i) => (
                <button
                  key={section.id || i}
                  onClick={() => setActiveSection(i)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    activeSection === i
                      ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {getSectionTitle(section.type)}
                </button>
              ))}
            </div>
          </nav>
        )}

        {/* Section content */}
        <div className="flex-1 min-w-0">
          <div className="bg-[#fefdfb] dark:bg-[#1a1f26] border border-gray-200 dark:border-gray-700 rounded-xl p-6 md:p-8 shadow-xs">
            {sections[activeSection] ? (
              <SectionRenderer
                section={sections[activeSection]}
                bookId={bookId}
                bookTitle={bookTitle}
                bookAuthor={bookAuthor}
                coverUrl={coverUrl}
                locale={locale}
              />
            ) : (
              <div className="text-center py-20">
                <p className="text-gray-500">{t('noContent')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const steps_array = ['collecting', 'analyzing', 'curating', 'synthesizing', 'rendering'] as const;
