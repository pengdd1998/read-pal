'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { authFetch } from '@/lib/auth-fetch';
import { api } from '@/lib/api';

interface BookData {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  status: 'unread' | 'reading' | 'completed';
  progress: number;
  currentPage: number;
  totalPages: number;
  addedAt: string;
  lastReadAt?: string;
  completedAt?: string;
}

interface AnnotationStats {
  highlights: number;
  notes: number;
  bookmarks: number;
}

interface AnnotationItem {
  id: string;
  type: string;
  content: string;
  note?: string;
  tags?: string[];
  createdAt: string;
  location?: { chapterIndex?: number };
}

export default function BookDetailPage() {
  const params = useParams();
  const router = useRouter();
  const bookId = params.id as string;

  const [book, setBook] = useState<BookData | null>(null);
  const [annotationStats, setAnnotationStats] = useState<AnnotationStats>({ highlights: 0, notes: 0, bookmarks: 0 });
  const [recentAnnotations, setRecentAnnotations] = useState<AnnotationItem[]>([]);
  const [hasPersonalBook, setHasPersonalBook] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generatingFlashcards, setGeneratingFlashcards] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<BookData>(`/api/books/${bookId}`);
        if (res.success && res.data) {
          setBook(res.data);
        } else {
          setError('Book not found.');
        }

        const annRes = await api.get<AnnotationItem[]>(`/api/annotations?bookId=${bookId}&limit=1000`);
        if (annRes.success && annRes.data) {
          const annotations = annRes.data;
          setAnnotationStats({
            highlights: annotations.filter((a) => a.type === 'highlight').length,
            notes: annotations.filter((a) => a.type === 'note').length,
            bookmarks: annotations.filter((a) => a.type === 'bookmark').length,
          });
          setRecentAnnotations(annotations.slice(-5).reverse());
        }

        // Check if personal book exists
        api.get<{ format: string }>(`/api/memory-books/${bookId}`)
          .then((res) => { if (res.success && res.data?.format === 'personal_book') setHasPersonalBook(true); })
          .catch(() => {});
      } catch {
        setError('Failed to load book. Please try again.');
      }
      setLoading(false);
    })();
  }, [bookId]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 animate-fade-in">
        {/* Back link skeleton */}
        <div className="mb-8">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-lg w-20 animate-pulse" />
        </div>

        {/* Book header skeleton */}
        <div className="flex gap-6 mb-10">
          <div className="w-28 h-40 rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse flex-shrink-0" />
          <div className="flex-1 space-y-3">
            <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded-lg w-3/4 animate-pulse" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-lg w-1/2 animate-pulse" />
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-20 animate-pulse" />
          </div>
        </div>

        {/* Progress skeleton */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
          <div className="h-5 bg-gray-100 dark:bg-gray-800 rounded w-20 mb-4 animate-pulse" />
          <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full animate-pulse" />
          <div className="flex justify-between mt-3">
            <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-32 animate-pulse" />
            <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-10 animate-pulse" />
          </div>
        </div>

        {/* Stats grid skeleton */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 animate-pulse">
              <div className="h-6 bg-gray-100 dark:bg-gray-800 rounded w-8 mx-auto" />
              <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-12 mx-auto mt-2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center animate-scale-in">
          <p className="text-lg font-semibold mb-2">{error || 'Book not found'}</p>
          <div className="flex gap-3 justify-center mt-4">
            <button onClick={() => window.location.reload()} className="btn btn-secondary">Retry</button>
            <Link href="/library" className="btn btn-primary">Back to Library</Link>
          </div>
        </div>
      </div>
    );
  }

  const progressPct = Math.round(book.progress);
  const estimatedMinutesLeft = book.totalPages > 0
    ? Math.round((book.totalPages - book.currentPage) * 8) // ~8 min per chapter avg
    : 0;
  const statusConfig = {
    unread: { label: 'Not Started', color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' },
    reading: { label: 'Reading', color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300' },
    completed: { label: 'Completed', color: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' },
  };
  const status = statusConfig[book.status];
  const lastRead = book.lastReadAt ? new Date(book.lastReadAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : null;

  const totalAnnotations = annotationStats.highlights + annotationStats.notes + annotationStats.bookmarks;

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-12 animate-fade-in">
      {/* Error banner */}
      {error && (
        <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300 flex items-center justify-between animate-scale-in">
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-2 text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}
      {/* Back */}
      <div className="mb-8 animate-slide-up">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Library
        </button>
      </div>

      {/* Book header */}
      <div className="flex gap-6 mb-10 animate-slide-up stagger-1">
        {/* Cover */}
        <div className="w-28 h-40 rounded-xl bg-gradient-to-br from-primary-400/30 to-primary-600/70 flex-shrink-0 overflow-hidden shadow-md">
          {book.coverUrl ? (
            <img src={book.coverUrl} alt={`Cover of ${book.title}`} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-4xl opacity-60">{'\uD83D\uDCD6'}</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">{book.title}</h1>
          <p className="text-gray-500 mt-1">by {book.author}</p>
          <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold mt-3 ${status.color}`}>
            {status.label}
          </span>
          {lastRead && (
            <p className="text-xs text-gray-400 mt-2">Last read {lastRead}</p>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-6 animate-slide-up stagger-2">
        <h2 className="font-semibold mb-4">Progress</h2>
        <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-3 overflow-hidden mb-3">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-teal-500 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">{book.currentPage} of {book.totalPages} chapters</span>
          <span className="font-semibold text-amber-600 dark:text-amber-400">{progressPct}%</span>
        </div>
        {book.status === 'reading' && estimatedMinutesLeft > 0 && (
          <p className="text-xs text-gray-400 mt-2">
            ~{estimatedMinutesLeft < 60 ? `${estimatedMinutesLeft} min` : `${Math.floor(estimatedMinutesLeft / 60)}h ${estimatedMinutesLeft % 60}m`} remaining
          </p>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3 mb-6 animate-slide-up stagger-3">
        {[
          { label: 'Highlights', value: annotationStats.highlights, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/10' },
          { label: 'Notes', value: annotationStats.notes, color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-900/10' },
          { label: 'Bookmarks', value: annotationStats.bookmarks, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/10' },
        ].map((item) => (
          <div key={item.label} className={`${item.bg} rounded-xl p-4 text-center`}>
            <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
            <div className="text-xs text-gray-500 mt-1">{item.label}</div>
          </div>
        ))}
      </div>

      {/* Annotation timeline */}
      {recentAnnotations.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 mb-6 animate-slide-up stagger-3">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Recent Annotations</h2>
            <Link href="/library" className="text-xs text-amber-600 dark:text-amber-400 hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {recentAnnotations.map((ann) => {
              const icon = ann.type === 'highlight' ? '\u{1F58D}' : ann.type === 'note' ? '\u{1F4DD}' : '\u{1F516}';
              const colorClass = ann.type === 'highlight'
                ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/30'
                : ann.type === 'note'
                ? 'bg-teal-50 dark:bg-teal-900/10 border-teal-200 dark:border-teal-800/30'
                : 'bg-violet-50 dark:bg-violet-900/10 border-violet-200 dark:border-violet-800/30';
              return (
                <div key={ann.id} className={`flex items-start gap-3 p-3 rounded-xl border ${colorClass}`}>
                  <span className="text-sm mt-0.5 shrink-0">{icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                      {ann.content || ann.note || 'Bookmark'}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {new Date(ann.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      {ann.location?.chapterIndex !== undefined && ` \u00B7 Ch ${ann.location.chapterIndex + 1}`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Personal Reading Book */}
      {book.progress > 10 && (
        <div className="bg-gradient-to-r from-amber-50 to-teal-50 dark:from-amber-900/10 dark:to-teal-900/10 rounded-2xl border border-amber-200/50 dark:border-amber-800/30 p-5 mb-6 animate-slide-up stagger-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">{'\uD83D\uDCD5'}</span>
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">Personal Reading Book</h2>
              <p className="text-xs text-gray-500">Your unique reading journey, woven into a book</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/memory-books/${bookId}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              {hasPersonalBook ? 'View Your Book' : 'Generate Now'}
            </Link>
            {hasPersonalBook && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Generated
              </span>
            )}
          </div>
        </div>
      )}

      {/* Export annotations */}
      {totalAnnotations > 0 && (
        <div className="flex gap-2 mb-6 animate-slide-up stagger-4">
          <button
            onClick={async () => {
              try {
                const res = await authFetch(`/api/annotations/export?bookId=${bookId}&format=markdown`);
                const text = await res.text();
                const blob = new Blob([text], { type: 'text/markdown' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `annotations-${book.title.replace(/\s+/g, '-')}.md`;
                a.click();
                URL.revokeObjectURL(url);
              } catch { setError('Failed to export annotations.'); }
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export Markdown
          </button>
          <button
            onClick={async () => {
              try {
                const res = await authFetch(`/api/annotations/export?bookId=${bookId}&format=json`);
                const text = await res.text();
                const blob = new Blob([text], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `annotations-${book.title.replace(/\s+/g, '-')}.json`;
                a.click();
                URL.revokeObjectURL(url);
              } catch { setError('Failed to export annotations.'); }
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export JSON
          </button>
        </div>
      )}

      {/* Flashcard Review */}
      {totalAnnotations > 0 && (
        <div className="bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-900/10 dark:to-emerald-900/10 rounded-2xl border border-teal-200/50 dark:border-teal-800/30 p-5 mb-6 animate-slide-up stagger-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">{'\uD83D\uDCC7'}</span>
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">Flashcard Review</h2>
              <p className="text-xs text-gray-500">Generate flashcards from your highlights and review with spaced repetition</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                try {
                  setGeneratingFlashcards(true);
                  const res = await api.post<{ generated: number }>(`/api/flashcards/generate`, {
                    bookId,
                    count: 5,
                  });
                  if (res.success && res.data) {
                    window.location.href = '/flashcards';
                  }
                } catch {
                  setError('Failed to generate flashcards.');
                } finally {
                  setGeneratingFlashcards(false);
                }
              }}
              disabled={generatingFlashcards}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-teal-500 hover:bg-teal-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generatingFlashcards ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generate Flashcards
                </>
              )}
            </button>
            <Link
              href="/flashcards"
              className="inline-flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 hover:underline"
            >
              Review due cards
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 animate-slide-up stagger-4">
        <Link
          href={`/read/${bookId}`}
          className="flex-1 btn btn-primary text-center hover:scale-[1.02] active:scale-[0.98] transition-transform duration-200"
        >
          {book.status === 'unread' ? 'Start Reading' : book.status === 'completed' ? 'Read Again' : 'Continue Reading'}
        </Link>
        <Link
          href="/library"
          className="btn bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Library
        </Link>
      </div>
    </main>
  );
}
