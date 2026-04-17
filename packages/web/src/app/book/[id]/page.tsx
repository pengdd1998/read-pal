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
  const [allAnnotations, setAllAnnotations] = useState<AnnotationItem[]>([]);
  const [hasPersonalBook, setHasPersonalBook] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generatingFlashcards, setGeneratingFlashcards] = useState(false);
  const [exportSuccess, setExportSuccess] = useState('');
  const [readingLog, setReadingLog] = useState<Array<{ id: string; startedAt: string; duration: number; pagesRead: number; highlights: number; notes: number; summary?: string }>>([]);
  const [readingWpm, setReadingWpm] = useState<number>(0);
  const [flashcardCount, setFlashcardCount] = useState<number>(0);
  const [outlineExpanded, setOutlineExpanded] = useState<Set<number>>(new Set());
  const [outlineFilter, setOutlineFilter] = useState<'all' | 'highlight' | 'note' | 'bookmark'>('all');

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
          setAllAnnotations(annotations);
        }

        // Fetch flashcard count for study guide CTA
        api.get<Array<{ bookId: string; total: number }>>('/api/flashcards/decks')
          .then((res) => {
            if (res.success && Array.isArray(res.data)) {
              const deck = res.data.find((d) => d.bookId === bookId);
              if (deck) setFlashcardCount(deck.total);
            }
          })
          .catch(() => {});

        // Check if personal book exists
        api.get<{ format: string }>(`/api/memory-books/${bookId}`)
          .then((res) => { if (res.success && res.data?.format === 'personal_book') setHasPersonalBook(true); })
          .catch(() => { /* no personal book yet */ });

        // Fetch reading log
        api.get<Array<{ id: string; startedAt: string; duration: number; pagesRead: number; highlights: number; notes: number; summary?: string }>>(`/api/reading-sessions/book/${bookId}/log?limit=5`)
          .then((res) => { if (res.success && res.data) setReadingLog(Array.isArray(res.data) ? res.data : []); })
          .catch(() => {});

        // Fetch reading speed for completion prediction
        api.get<{ currentWpm: number }>('/api/stats/reading-speed')
          .then((res) => { if (res.success && res.data?.currentWpm) setReadingWpm(res.data.currentWpm); })
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
  const remainingChapters = Math.max(0, book.totalPages - book.currentPage);
  // Use actual reading speed (WPM) for prediction, fallback to ~8 min/chapter
  const WORDS_PER_CHAPTER = 250 * 25; // ~25 pages per chapter, 250 words/page
  const estimatedMinutesLeft = remainingChapters > 0
    ? readingWpm > 0
      ? Math.round((remainingChapters * WORDS_PER_CHAPTER) / readingWpm)
      : remainingChapters * 8
    : 0;
  const statusConfig = {
    unread: { label: 'Not Started', color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' },
    reading: { label: 'Reading', color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300' },
    completed: { label: 'Completed', color: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' },
  };
  const status = statusConfig[book.status];
  const lastRead = book.lastReadAt ? new Date(book.lastReadAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : null;

  const totalAnnotations = annotationStats.highlights + annotationStats.notes + annotationStats.bookmarks;
  const recentAnnotations = allAnnotations.slice(-5).reverse();

  // Outline: group annotations by chapter
  const outlineChapters = (() => {
    const filtered = allAnnotations.filter((a) => {
      if (outlineFilter !== 'all' && a.type !== outlineFilter) return false;
      return true;
    });
    const chapterMap = new Map<number, AnnotationItem[]>();
    const ungrouped: AnnotationItem[] = [];
    for (const a of filtered) {
      const ch = a.location?.chapterIndex;
      if (typeof ch === 'number' && ch >= 0) {
        const list = chapterMap.get(ch) || [];
        list.push(a);
        chapterMap.set(ch, list);
      } else {
        ungrouped.push(a);
      }
    }
    const groups = [...chapterMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([idx, items]) => ({
        chapterIndex: idx,
        label: `Chapter ${idx + 1}`,
        highlights: items.filter((a) => a.type === 'highlight'),
        notes: items.filter((a) => a.type === 'note'),
        bookmarks: items.filter((a) => a.type === 'bookmark'),
      }));
    if (ungrouped.length > 0) {
      groups.push({
        chapterIndex: -1,
        label: 'Other',
        highlights: ungrouped.filter((a) => a.type === 'highlight'),
        notes: ungrouped.filter((a) => a.type === 'note'),
        bookmarks: ungrouped.filter((a) => a.type === 'bookmark'),
      });
    }
    return groups;
  })();

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-12 animate-fade-in">
      {/* Error banner */}
      {error && (
        <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300 flex items-center justify-between animate-scale-in">
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-2 text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}
      {/* Success banner */}
      {exportSuccess && (
        <div className="mb-6 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-sm text-green-700 dark:text-green-300 flex items-center justify-between animate-scale-in">
          <span>{exportSuccess}</span>
          <button onClick={() => setExportSuccess('')} className="ml-2 text-green-400 hover:text-green-600">&times;</button>
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
        <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-3 overflow-hidden mb-3" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100} aria-label={`Reading progress: ${progressPct}%`}>
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-teal-500 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">{book.currentPage} of {book.totalPages} chapters</span>
          <span className="font-semibold text-amber-600 dark:text-amber-400">{progressPct}%</span>
        </div>
        {book.status === 'reading' && estimatedMinutesLeft > 0 && (() => {
          const hours = Math.floor(estimatedMinutesLeft / 60);
          const mins = estimatedMinutesLeft % 60;
          const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
          // Estimate finish date assuming 30 min/day reading
          const daysLeft = Math.ceil(estimatedMinutesLeft / 30);
          const finishDate = new Date();
          finishDate.setDate(finishDate.getDate() + daysLeft);
          const finishStr = finishDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          return (
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-gray-400">
                ~{timeStr} remaining
              </p>
              <p className="text-xs text-gray-400">
                Finish by {finishStr} {readingWpm > 0 && <span className="text-teal-500">({readingWpm} wpm)</span>}
              </p>
            </div>
          );
        })()}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3 mb-6 animate-slide-up stagger-3">
        {[
          { label: 'Highlights', value: annotationStats.highlights, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/10' },
          { label: 'Notes', value: annotationStats.notes, color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-900/10' },
          { label: 'Bookmarks', value: annotationStats.bookmarks, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/10' },
        ].map((item) => (
          <div key={item.label} className={`${item.bg} rounded-xl p-4 text-center`} aria-label={`${item.value} ${item.label.toLowerCase()}`}>
            <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
            <div className="text-xs text-gray-500 mt-1">{item.label}</div>
          </div>
        ))}
      </div>

      {/* Notes Outline */}
      {allAnnotations.length > 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 mb-6 animate-slide-up stagger-3 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-semibold">Notes Outline</h2>
                <p className="text-[10px] text-gray-400 mt-0.5">{allAnnotations.length} annotations across {outlineChapters.length} chapter{outlineChapters.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setOutlineExpanded(new Set(outlineChapters.map((c) => c.chapterIndex)))}
                  className="text-[10px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Expand all
                </button>
                <button
                  onClick={() => setOutlineExpanded(new Set())}
                  className="text-[10px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Collapse all
                </button>
              </div>
            </div>
            {/* Type filter */}
            <div className="flex gap-1">
              {[
                { key: 'all' as const, label: `All (${allAnnotations.length})` },
                { key: 'highlight' as const, label: `\u{1F58D} ${annotationStats.highlights}` },
                { key: 'note' as const, label: `\u{1F4DD} ${annotationStats.notes}` },
                { key: 'bookmark' as const, label: `\u{1F516} ${annotationStats.bookmarks}` },
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setOutlineFilter(opt.key)}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                    outlineFilter === opt.key
                      ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {/* Chapter tree */}
          <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-80 overflow-y-auto">
            {outlineChapters.map((chapter) => {
              const isExpanded = outlineExpanded.has(chapter.chapterIndex);
              const totalCount = chapter.highlights.length + chapter.notes.length + chapter.bookmarks.length;
              return (
                <div key={chapter.chapterIndex}>
                  <button
                    onClick={() => {
                      setOutlineExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(chapter.chapterIndex)) next.delete(chapter.chapterIndex);
                        else next.add(chapter.chapterIndex);
                        return next;
                      });
                    }}
                    className="w-full flex items-center gap-2 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                  >
                    <svg
                      className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1">{chapter.label}</span>
                    <div className="flex items-center gap-1.5">
                      {chapter.notes.length > 0 && (
                        <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full">
                          {chapter.notes.length} note{chapter.notes.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {chapter.highlights.length > 0 && (
                        <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full">
                          {chapter.highlights.length}
                        </span>
                      )}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="pb-2">
                      {chapter.notes.map((ann) => (
                        <div key={ann.id} className="px-7 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/5 transition-colors">
                          <div className="flex items-start gap-2">
                            <span className="text-[10px] mt-0.5 flex-shrink-0">{'\u{1F4DD}'}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-blue-700 dark:text-blue-300 line-clamp-3">{ann.content}</p>
                              {ann.note && <p className="text-[10px] text-gray-400 mt-0.5 italic line-clamp-1">{ann.note}</p>}
                              {ann.tags && ann.tags.length > 0 && (
                                <div className="flex gap-1 mt-1">
                                  {ann.tags.slice(0, 3).map((t) => (
                                    <span key={t} className="text-[9px] bg-gray-100 dark:bg-gray-800 text-gray-500 px-1 py-0.5 rounded">{t}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      {chapter.highlights.map((ann) => (
                        <div key={ann.id} className="px-7 py-2 hover:bg-amber-50 dark:hover:bg-amber-900/5 transition-colors">
                          <div className="flex items-start gap-2">
                            <span className="text-[10px] mt-0.5 flex-shrink-0">{'\u{1F58D}'}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{ann.content}</p>
                              {ann.note && <p className="text-[10px] text-gray-400 mt-0.5 italic line-clamp-1">{ann.note}</p>}
                            </div>
                          </div>
                        </div>
                      ))}
                      {chapter.bookmarks.map((ann) => (
                        <div key={ann.id} className="px-7 py-2 hover:bg-violet-50 dark:hover:bg-violet-900/5 transition-colors">
                          <div className="flex items-start gap-2">
                            <span className="text-[10px] mt-0.5 flex-shrink-0">{'\u{1F516}'}</span>
                            <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{ann.content || 'Bookmark'}</p>
                          </div>
                        </div>
                      ))}
                      {totalCount === 0 && <p className="text-[10px] text-gray-400 px-7 py-1">No matching items.</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 mb-6 animate-slide-up stagger-3 text-center">
          <p className="text-gray-400 text-sm">No annotations yet</p>
          <p className="text-gray-400 text-xs mt-1">Start reading to add highlights, notes, and bookmarks</p>
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
        <div className="flex flex-wrap gap-2 mb-6 animate-slide-up stagger-4">
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
                setExportSuccess('Markdown exported!');
                setTimeout(() => setExportSuccess(''), 3000);
              } catch { setError('Failed to export annotations.'); }
            }}
            className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
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
                setExportSuccess('JSON exported!');
                setTimeout(() => setExportSuccess(''), 3000);
              } catch { setError('Failed to export annotations.'); }
            }}
            className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export JSON
          </button>
        </div>
      )}

      {/* Study Guide Export */}
      {(flashcardCount > 0 || totalAnnotations > 5) && (
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/10 dark:to-blue-900/10 rounded-2xl border border-indigo-200/50 dark:border-indigo-800/30 p-5 mb-6 animate-slide-up stagger-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">{'\uD83D\uDCDA'}</span>
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">Study Guide</h2>
              <p className="text-xs text-gray-500">Printable guide with flashcards, notes, and chapter outlines</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                try {
                  const res = await authFetch(`/api/annotations/export?bookId=${bookId}&format=study_guide`);
                  if (!res.ok) throw new Error('Export failed');
                  const text = await res.text();
                  const blob = new Blob([text], { type: 'text/markdown; charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `study-guide-${book.title.replace(/\s+/g, '-')}.md`;
                  a.click();
                  URL.revokeObjectURL(url);
                  setExportSuccess('Study guide exported!');
                  setTimeout(() => setExportSuccess(''), 3000);
                } catch { setError('Failed to export study guide.'); }
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-indigo-500 hover:bg-indigo-600 text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Export Study Guide
            </button>
            {flashcardCount > 0 && (
              <span className="text-xs text-indigo-600 dark:text-indigo-400">
                {flashcardCount} flashcard{flashcardCount !== 1 ? 's' : ''} included
              </span>
            )}
          </div>
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

      {/* Reading Log */}
      {readingLog.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 mb-6 animate-slide-up stagger-4">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="font-semibold">Reading Log</h2>
          </div>
          <div className="space-y-3">
            {readingLog.map((entry) => {
              const date = new Date(entry.startedAt);
              const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
              const timeStr = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
              const mins = Math.round(entry.duration / 60);
              return (
                <div key={entry.id} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                  <div className="text-xs text-gray-400 min-w-[52px] pt-0.5">
                    <div>{dateStr}</div>
                    <div className="text-[10px]">{timeStr}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{mins}m</span>
                      <span>{entry.pagesRead} pages</span>
                      {entry.highlights > 0 && <span>{entry.highlights} highlights</span>}
                    </div>
                    {entry.summary && (
                      <p className="text-xs text-gray-700 dark:text-gray-300 mt-1.5 leading-relaxed">{entry.summary}</p>
                    )}
                  </div>
                </div>
              );
            })}
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
