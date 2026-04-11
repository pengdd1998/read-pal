'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
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

export default function BookDetailPage() {
  const params = useParams();
  const router = useRouter();
  const bookId = params.id as string;

  const [book, setBook] = useState<BookData | null>(null);
  const [annotationStats, setAnnotationStats] = useState<AnnotationStats>({ highlights: 0, notes: 0, bookmarks: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<BookData>(`/api/books/${bookId}`);
        if (res.success && res.data) {
          setBook(res.data);
        }

        const annRes = await api.get<{ type: string }[]>(`/api/annotations?bookId=${bookId}&limit=1000`);
        if (annRes.success && annRes.data) {
          const annotations = annRes.data;
          setAnnotationStats({
            highlights: annotations.filter((a) => a.type === 'highlight').length,
            notes: annotations.filter((a) => a.type === 'note').length,
            bookmarks: annotations.filter((a) => a.type === 'bookmark').length,
          });
        }
      } catch {}
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
          <p className="text-lg font-semibold mb-4">Book not found</p>
          <Link href="/library" className="btn btn-primary">Back to Library</Link>
        </div>
      </div>
    );
  }

  const progressPct = Math.round(book.progress);
  const statusConfig = {
    unread: { label: 'Not Started', color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' },
    reading: { label: 'Reading', color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300' },
    completed: { label: 'Completed', color: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' },
  };
  const status = statusConfig[book.status];
  const lastRead = book.lastReadAt ? new Date(book.lastReadAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : null;

  const totalAnnotations = annotationStats.highlights + annotationStats.notes + annotationStats.bookmarks;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 animate-fade-in">
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
            <img src={book.coverUrl} alt="" className="w-full h-full object-cover" />
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

      {/* Memory Book */}
      {book.progress > 10 && (
        <div className="bg-gradient-to-r from-amber-50 to-teal-50 dark:from-amber-900/10 dark:to-teal-900/10 rounded-2xl border border-amber-200/50 dark:border-amber-800/30 p-5 mb-6 animate-slide-up stagger-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">{'\uD83D\uDCD3'}</span>
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">Memory Book</h2>
              <p className="text-xs text-gray-500">Compile your reading journey into a beautiful summary</p>
            </div>
          </div>
          <Link
            href={`/memory-books`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Generate Memory Book
          </Link>
        </div>
      )}

      {/* Export annotations */}
      {totalAnnotations > 0 && (
        <div className="flex gap-2 mb-6 animate-slide-up stagger-4">
          <button
            onClick={async () => {
              try {
                const token = localStorage.getItem('auth_token');
                const res = await fetch(`/api/annotations/export?bookId=${bookId}&format=markdown`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                const text = await res.text();
                const blob = new Blob([text], { type: 'text/markdown' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `annotations-${book.title.replace(/\s+/g, '-')}.md`;
                a.click();
                URL.revokeObjectURL(url);
              } catch { /* silent */ }
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
                const token = localStorage.getItem('auth_token');
                const res = await fetch(`/api/annotations/export?bookId=${bookId}&format=json`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                const text = await res.text();
                const blob = new Blob([text], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `annotations-${book.title.replace(/\s+/g, '-')}.json`;
                a.click();
                URL.revokeObjectURL(url);
              } catch { /* silent */ }
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
    </div>
  );
}
