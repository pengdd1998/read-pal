'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface MemoryBookMoment {
  type: string;
  content: string;
  timestamp: string;
  chapterIndex: number;
}

interface MemoryBookInsight {
  theme: string;
  description: string;
  relatedConcepts: string[];
}

interface MemoryBookStats {
  pagesRead: number;
  totalHighlights: number;
  totalNotes: number;
  readingDuration: number;
  conceptsDiscovered: number;
  connectionsMade: number;
}

interface MemoryBook {
  id: string;
  bookId: string;
  bookTitle?: string;
  format: string;
  moments: MemoryBookMoment[];
  insights: MemoryBookInsight[];
  stats: MemoryBookStats;
  createdAt: string;
  updatedAt: string;
}

interface Book {
  id: string;
  title: string;
  author: string;
  progress: number;
  status: string;
}

const MOMENT_ICONS: Record<string, string> = {
  realization: '\uD83D\uDCA1',
  highlight: '\uD83D\uDDF3\uFE0F',
  note: '\uD83D\uDCDD',
  conversation: '\uD83D\uDCAC',
  milestone: '\uD83C\uDFAF',
  breakthrough: '\uD83C\uDF1F',
  connection: '\uD83D\uDD17',
};

export default function MemoryBooksPage() {
  const [memoryBooks, setMemoryBooks] = useState<MemoryBook[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<MemoryBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<MemoryBook[]>('/api/memory-books'),
      api.get<Book[]>('/api/books'),
    ])
      .then(([mbRes, booksRes]) => {
        if (mbRes.success && mbRes.data) {
          setMemoryBooks(mbRes.data);
        }
        if (booksRes.success && booksRes.data) {
          setBooks((booksRes.data).filter((b) => b.progress > 10));
        }
      })
      .catch(() => setError('Failed to load data'))
      .finally(() => setLoading(false));
  }, []);

  const handleGenerate = async (bookId: string) => {
    setGenerating(bookId);
    try {
      const res = await api.post<MemoryBook>(`/api/memory-books/${bookId}/generate`, {
        format: 'scrapbook',
      });
      if (res.success && res.data) {
        const newBook = res.data;
        setMemoryBooks((prev) => {
          const idx = prev.findIndex((mb) => mb.bookId === bookId);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = newBook;
            return next;
          }
          return [newBook, ...prev];
        });
        setSelectedBook(newBook);
      }
    } catch {
      setError('Failed to generate memory book');
    } finally {
      setGenerating(null);
    }
  };

  const handleView = async (bookId: string) => {
    try {
      const res = await api.get<MemoryBook>(`/api/memory-books/${bookId}`);
      if (res.success && res.data) {
        setSelectedBook(res.data);
      }
    } catch {
      setError('Failed to load memory book');
    }
  };

  const existingBookIds = new Set(memoryBooks.map((mb) => mb.bookId));
  const eligibleBooks = books.filter((b) => !existingBookIds.has(b.id));

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  };

  if (selectedBook) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12 animate-fade-in">
        <button
          onClick={() => setSelectedBook(null)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors mb-6"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          All Memory Books
        </button>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">{'\uD83D\uDCD3'}</span>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {selectedBook.bookTitle || 'Memory Book'}
              </h1>
              <p className="text-sm text-gray-500">
                Created {new Date(selectedBook.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-8">
          {[
            { label: 'Pages', value: selectedBook.stats.pagesRead, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/10' },
            { label: 'Highlights', value: selectedBook.stats.totalHighlights, color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-900/10' },
            { label: 'Notes', value: selectedBook.stats.totalNotes, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/10' },
            { label: 'Duration', value: formatDuration(selectedBook.stats.readingDuration), color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/10' },
          ].map((item) => (
            <div key={item.label} className={`${item.bg} rounded-xl p-3 text-center`}>
              <div className={`text-lg font-bold ${item.color}`}>{item.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{item.label}</div>
            </div>
          ))}
        </div>

        {/* Insights */}
        {selectedBook.insights.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Key Insights</h2>
            <div className="space-y-3">
              {selectedBook.insights.map((insight, i) => (
                <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-lg mt-0.5">{'\uD83E\uDDE0'}</span>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{insight.theme}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">{insight.description}</p>
                      {insight.relatedConcepts.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {insight.relatedConcepts.map((c) => (
                            <span key={c} className="text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">{c}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Moments Timeline */}
        {selectedBook.moments.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Reading Journey</h2>
            <div className="relative pl-6 border-l-2 border-amber-200 dark:border-amber-800 space-y-4">
              {selectedBook.moments.map((moment, i) => (
                <div key={i} className="relative">
                  <div className="absolute -left-[1.6rem] top-1 w-3 h-3 rounded-full bg-amber-400 border-2 border-white dark:border-gray-900" />
                  <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">{MOMENT_ICONS[moment.type] || '\uD83D\uDCD6'}</span>
                      <span className="text-xs text-gray-400 uppercase tracking-wide">{moment.type.replace(/_/g, ' ')}</span>
                      <span className="text-xs text-gray-300 dark:text-gray-600 ml-auto">Ch. {moment.chapterIndex + 1}</span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{moment.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12 animate-fade-in">
      {/* Back */}
      <div className="mb-6">
        <Link href="/dashboard" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Dashboard
        </Link>
      </div>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{'\uD83D\uDCD3'}</span>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Memory Books</h1>
            <p className="text-sm text-gray-500 mt-1">Beautiful compilations of your reading journeys</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-12 h-16 bg-gray-100 dark:bg-gray-800 rounded-lg" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-40 mb-2" />
                  <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-24" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Existing memory books */}
      {!loading && memoryBooks.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Your Memory Books</h2>
          <div className="space-y-3">
            {memoryBooks.map((mb) => (
              <button
                key={mb.id}
                onClick={() => handleView(mb.bookId)}
                className="w-full text-left bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:shadow-md hover:border-amber-300 dark:hover:border-amber-700 transition-all duration-200"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-16 rounded-lg bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/30 dark:to-teal-900/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl">{'\uD83D\uDCD3'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                      {mb.bookTitle || `Book ${mb.bookId}`}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {mb.moments.length} moments &middot; {mb.insights.length} insights &middot; {new Date(mb.createdAt).toLocaleDateString()}
                    </p>
                    {mb.stats && (
                      <div className="flex gap-3 mt-2">
                        <span className="text-xs text-amber-600 dark:text-amber-400">{mb.stats.totalHighlights} highlights</span>
                        <span className="text-xs text-teal-600 dark:text-teal-400">{mb.stats.totalNotes} notes</span>
                      </div>
                    )}
                  </div>
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Generate new */}
      {!loading && eligibleBooks.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Generate New</h2>
          <div className="space-y-2">
            {eligibleBooks.map((book) => (
              <div key={book.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-4">
                <div className="w-10 h-14 rounded-lg bg-gradient-to-br from-amber-400/30 to-amber-600/50 flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">{'\uD83D\uDCD6'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm text-gray-900 dark:text-white truncate">{book.title}</h3>
                  <p className="text-xs text-gray-500">{book.author} &middot; {Math.round(book.progress)}% complete</p>
                </div>
                <button
                  onClick={() => handleGenerate(book.id)}
                  disabled={generating === book.id}
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50"
                >
                  {generating === book.id ? 'Generating...' : 'Generate'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && memoryBooks.length === 0 && eligibleBooks.length === 0 && (
        <div className="text-center py-16">
          <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/30 dark:to-teal-900/30 flex items-center justify-center">
            <span className="text-3xl">{'\uD83D\uDCD3'}</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No Memory Books Yet</h2>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            Start reading and making highlights to build your first memory book. Memory books compile your journey through each book.
          </p>
          <Link href="/library" className="btn btn-primary hover:scale-105 active:scale-95 transition-transform duration-200">
            Start Reading
          </Link>
        </div>
      )}
    </div>
  );
}
