'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, API_BASE_URL } from '@/lib/api';
import { getAuthToken } from '@/lib/auth-fetch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PersonalBookSection {
  id: string;
  title: string;
  type: string;
}

interface PersonalBook {
  id: string;
  bookId: string;
  title: string;
  format: string;
  sections: PersonalBookSection[];
  htmlContent: string | null;
  stats: {
    pagesRead: number;
    totalHighlights: number;
    totalNotes: number;
    readingDuration: number;
  };
  generatedAt: string;
}

type GenerationStep = 'idle' | 'collecting' | 'analyzing' | 'curating' | 'synthesizing' | 'rendering' | 'done' | 'error';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PersonalBookPage() {
  const params = useParams();
  const router = useRouter();
  const bookId = params.bookId as string;

  const [book, setBook] = useState<PersonalBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep] = useState<GenerationStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Fetch existing personal book
  useEffect(() => {
    if (!bookId) return;
    api.get<PersonalBook>(`/api/memory-books/${bookId}`)
      .then((res) => {
        if (res.success && res.data && res.data.format === 'personal_book') {
          setBook(res.data);
        }
      })
      .catch(() => { /* no existing book */ })
      .finally(() => setLoading(false));
  }, [bookId]);

  // Generate personal book with step feedback
  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);

    const steps: GenerationStep[] = ['collecting', 'analyzing', 'curating', 'synthesizing', 'rendering'];
    const stepLabels = ['Collecting your reading data...', 'Analyzing themes and patterns...', 'Curating conversations...', 'Synthesizing insights...', 'Assembling your book...'];

    // Advance steps on a timer for UX feedback
    let stepIdx = 0;
    const timer = setInterval(() => {
      stepIdx++;
      if (stepIdx < steps.length) {
        setGenStep(steps[stepIdx]);
      }
    }, 5000);
    setGenStep(steps[0]);

    try {
      const res = await api.post<PersonalBook>(`/api/memory-books/${bookId}/generate`, {
        format: 'personal_book',
      });

      clearInterval(timer);
      setGenStep('done');

      if (res.success && res.data) {
        setBook(res.data);
      } else {
        setError('Generation returned empty result');
        setGenStep('error');
      }
    } catch (err) {
      clearInterval(timer);
      setError('Failed to generate your Personal Reading Book. Please try again.');
      setGenStep('error');
    } finally {
      setGenerating(false);
    }
  }, [bookId]);

  // Download as HTML file
  const handleDownload = useCallback(() => {
    if (!book?.htmlContent) return;
    const blob = new Blob([book.htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${book.title.replace(/[^a-zA-Z0-9]/g, '_')}_personal_book.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, [book]);

  // Print / save as PDF
  const handlePrint = useCallback(() => {
    if (!book?.htmlContent) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(book.htmlContent);
      printWindow.document.close();
      printWindow.onload = () => printWindow.print();
    }
  }, [book]);

  // Filter sections for navigation (exclude cover)
  const navSections = book?.sections?.filter((s) => s.type !== 'cover') || [];

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="w-12 h-12 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Generating state
  // ---------------------------------------------------------------------------
  if (generating) {
    const stepLabels: Record<GenerationStep, string> = {
      idle: 'Starting...',
      collecting: 'Collecting your reading data...',
      analyzing: 'Analyzing themes and patterns...',
      curating: 'Curating your best conversations...',
      synthesizing: 'Synthesizing insights...',
      rendering: 'Assembling your Personal Reading Book...',
      done: 'Done!',
      error: 'Something went wrong',
    };

    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center animate-fade-in">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/30 dark:to-amber-800/30 flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          Creating Your Personal Reading Book
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          This takes about 15-30 seconds. We&apos;re analyzing your highlights, notes, and conversations.
        </p>
        <div className="space-y-2">
          {['collecting', 'analyzing', 'curating', 'synthesizing', 'rendering'].map((step) => (
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
  if (error && !book) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center animate-fade-in">
        <div className="text-5xl mb-4">{'\u{1F614}'}</div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Generation Failed</h2>
        <p className="text-sm text-gray-500 mb-6">{error}</p>
        <div className="flex gap-3 justify-center">
          <button onClick={handleGenerate} className="btn btn-primary">
            Try Again
          </button>
          <Link href="/memory-books" className="btn bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
            Back to Memory Books
          </Link>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // No book yet — show generate CTA
  // ---------------------------------------------------------------------------
  if (!book) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center animate-fade-in">
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/30 dark:to-teal-900/30 flex items-center justify-center">
          <span className="text-4xl">{'\u{1F4D5}'}</span>
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          Your Personal Reading Book
        </h2>
        <p className="text-sm text-gray-500 mb-8 max-w-sm mx-auto">
          A unique book crafted from your reading journey — your highlights, notes, AI conversations, and insights, woven together.
        </p>
        <button
          onClick={handleGenerate}
          className="px-6 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-600 hover:to-amber-700 transition-all shadow-lg hover:shadow-xl active:scale-95"
        >
          Create Your Personal Reading Book
        </button>
        <div className="mt-6">
          <Link href="/memory-books" className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            Back to Memory Books
          </Link>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Book display
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
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">{book.title}</h1>
            <p className="text-xs text-gray-400">
              Generated {new Date(book.generatedAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerate}
            className="p-2 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
            title="Regenerate"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={handleDownload}
            className="p-2 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
            title="Download HTML"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
          <button
            onClick={handlePrint}
            className="p-2 rounded-lg text-gray-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
            title="Print / Save PDF"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main layout: sidebar + content */}
      <div className="flex gap-4">
        {/* Sidebar navigation */}
        {navSections.length > 0 && (
          <nav className="hidden md:block w-52 flex-shrink-0">
            <div className="sticky top-6 space-y-0.5">
              {navSections.map((section, i) => (
                <button
                  key={section.id}
                  onClick={() => {
                    setActiveSection(i + 1); // +1 because cover is 0
                    if (iframeRef.current?.contentWindow) {
                      iframeRef.current.contentWindow.postMessage({ type: 'scroll-to-section', sectionId: section.id }, '*');
                    }
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    activeSection === i + 1
                      ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {section.title}
                </button>
              ))}
            </div>
          </nav>
        )}

        {/* Book content */}
        <div className="flex-1 min-w-0">
          {book.htmlContent ? (
            <iframe
              ref={iframeRef}
              srcDoc={book.htmlContent}
              title="Personal Reading Book"
              className="w-full min-h-[80vh] border border-gray-200 dark:border-gray-700 rounded-xl bg-[#faf7f2]"
              sandbox="allow-same-origin"
              onLoad={() => {
                // Auto-resize iframe to content
                try {
                  const doc = iframeRef.current?.contentDocument;
                  if (doc?.body) {
                    const height = doc.body.scrollHeight + 40;
                    iframeRef.current!.style.height = `${height}px`;
                  }
                } catch { /* cross-origin fallback */ }
              }}
            />
          ) : (
            <div className="text-center py-20">
              <p className="text-gray-500">No content available</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
