'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { authFetch } from '@/lib/auth-fetch';
import { api } from '@/lib/api';
import { useBackgroundApi } from '@/hooks/useApi';
import { usePageTitle } from '@/hooks/usePageTitle';

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
  const t = useTranslations('book');
  usePageTitle(t('pageTitle'));
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
  const [zoteroExporting, setZoteroExporting] = useState(false);
  const [zoteroConnected, setZoteroConnected] = useState(false);
  const [readingLog, setReadingLog] = useState<Array<{ id: string; startedAt: string; duration: number; pagesRead: number; highlights: number; notes: number; summary?: string }>>([]);
  const [readingWpm, setReadingWpm] = useState<number>(0);
  const [flashcardCount, setFlashcardCount] = useState<number>(0);
  const [outlineExpanded, setOutlineExpanded] = useState<Set<number>>(new Set());
  const [outlineFilter, setOutlineFilter] = useState<'all' | 'highlight' | 'note' | 'bookmark'>('all');
  const [tags, setTags] = useState<Array<{ name: string; count: number }>>([]);

  const { fetch: bgFetch } = useBackgroundApi();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await api.get<BookData>(`/api/books/${bookId}`);
        if (cancelled) return;
        if (res.success && res.data) {
          setBook(res.data);
        } else {
          setError(t('bookNotFound'));
        }

        const annRes = await api.get<AnnotationItem[]>('/api/annotations', { book_id: bookId, per_page: 200 });
        if (cancelled) return;
        if (annRes.success && annRes.data) {
          const annotations = Array.isArray(annRes.data) ? annRes.data : [];
          setAnnotationStats({
            highlights: annotations.filter((a) => a.type === 'highlight').length,
            notes: annotations.filter((a) => a.type === 'note').length,
            bookmarks: annotations.filter((a) => a.type === 'bookmark').length,
          });
          setAllAnnotations(annotations);
        }
      } catch {
        if (!cancelled) setError(t('failedToLoad'));
      }
      if (!cancelled) setLoading(false);
    })();

    // Background fetches — non-critical, silenced errors
    bgFetch<Array<{ bookId: string; total: number }>>('/api/flashcards/decks', (data) => {
      const deck = data.find((d) => d.bookId === bookId);
      if (deck) setFlashcardCount(deck.total);
    });
    bgFetch<Array<{ name: string; count: number }>>(`/api/annotations/tags?bookId=${bookId}`, (data) => {
      if (Array.isArray(data)) setTags(data);
    });
    bgFetch<{ format: string }>(`/api/memory-books/${bookId}`, (data) => {
      if (data.format === 'personal_book') setHasPersonalBook(true);
    });
    bgFetch<Array<{ id: string; startedAt: string; duration: number; pagesRead: number; highlights: number; notes: number; summary?: string }>>(`/api/reading-sessions/book/${bookId}/log?limit=5`, (data) => {
      if (Array.isArray(data)) setReadingLog(data);
    });
    bgFetch<{ currentWpm: number }>('/api/stats/reading-speed', (data) => {
      if (data.currentWpm) setReadingWpm(data.currentWpm);
    });
    bgFetch<{ connected: boolean }>('/api/zotero/status', (data) => {
      if (data.connected) setZoteroConnected(true);
    });

    return () => { cancelled = true; };
  }, [bookId, bgFetch, t]);

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
          <p className="text-lg font-semibold mb-2">{error || t('errorBookNotFound')}</p>
          <div className="flex gap-3 justify-center mt-4">
            <button onClick={() => window.location.reload()} className="btn btn-secondary">{t('retry')}</button>
            <Link href="/library" className="btn btn-primary">{t('backToLibrary')}</Link>
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
    unread: { label: t('notStarted'), color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' },
    reading: { label: t('reading'), color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300' },
    completed: { label: t('completed'), color: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' },
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
        label: t('chapter', { number: idx + 1 }),
        highlights: items.filter((a) => a.type === 'highlight'),
        notes: items.filter((a) => a.type === 'note'),
        bookmarks: items.filter((a) => a.type === 'bookmark'),
      }));
    if (ungrouped.length > 0) {
      groups.push({
        chapterIndex: -1,
        label: t('other'),
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
          {t('library')}
        </button>
      </div>

      {/* Book header */}
      <div className="flex gap-6 mb-10 animate-slide-up stagger-1">
        {/* Cover */}
        <div className="w-28 h-40 rounded-xl bg-gradient-to-br from-primary-400/30 to-primary-600/70 flex-shrink-0 overflow-hidden shadow-md">
          {book.coverUrl ? (
            <img src={book.coverUrl} alt={t('coverAlt', { title: book.title })} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-4xl opacity-60">{'\uD83D\uDCD6'}</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">{book.title}</h1>
          <p className="text-gray-500 mt-1">{t('by', { author: book.author })}</p>
          <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold mt-3 ${status.color}`}>
            {status.label}
          </span>
          {lastRead && (
            <p className="text-xs text-gray-400 mt-2">{t('lastRead', { date: lastRead })}</p>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-6 animate-slide-up stagger-2">
        <h2 className="font-semibold mb-4">{t('progress')}</h2>
        <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-3 overflow-hidden mb-3" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100} aria-label={`Reading progress: ${progressPct}%`}>
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-teal-500 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">{t('chaptersOf', { current: book.currentPage, total: book.totalPages })}</span>
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
                {t('remaining', { time: timeStr })}
              </p>
              <p className="text-xs text-gray-400">
                {t('finishBy', { date: finishStr })} {readingWpm > 0 && <span className="text-teal-500">{t('wpm', { wpm: readingWpm })}</span>}
              </p>
            </div>
          );
        })()}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3 mb-6 animate-slide-up stagger-3">
        {[
          { label: t('highlights'), value: annotationStats.highlights, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/10' },
          { label: t('notes'), value: annotationStats.notes, color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-900/10' },
          { label: t('bookmarks'), value: annotationStats.bookmarks, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/10' },
        ].map((item) => (
          <div key={item.label} className={`${item.bg} rounded-xl p-4 text-center`} aria-label={`${item.value} ${item.label.toLowerCase()}`}>
            <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
            <div className="text-xs text-gray-500 mt-1">{item.label}</div>
          </div>
        ))}
      </div>

      {/* Tag Cloud */}
      {tags.length > 0 && (
        <div className="mb-6 animate-slide-up stagger-3">
          <div className="flex flex-wrap gap-1.5">
            {tags.slice(0, 15).map((tag) => (
              <span
                key={tag.name}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-amber-100 dark:hover:bg-amber-900/20 hover:text-amber-700 dark:hover:text-amber-300 transition-colors cursor-default"
              >
                {tag.name}
                <span className="text-[9px] text-gray-400">{tag.count}</span>
              </span>
            ))}
            {tags.length > 15 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs text-gray-400">
                {t('moreTags', { count: tags.length - 15 })}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Notes Outline */}
      {allAnnotations.length > 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 mb-6 animate-slide-up stagger-3 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-semibold">{t('notesOutline')}</h2>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {outlineChapters.length === 1
                    ? t('annotationsAcrossChapters', { count: allAnnotations.length, chapters: outlineChapters.length })
                    : t('annotationsAcrossChaptersPlural', { count: allAnnotations.length, chapters: outlineChapters.length })}
                </p>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setOutlineExpanded(new Set(outlineChapters.map((c) => c.chapterIndex)))}
                  className="text-[10px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  {t('expandAll')}
                </button>
                <button
                  onClick={() => setOutlineExpanded(new Set())}
                  className="text-[10px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  {t('collapseAll')}
                </button>
              </div>
            </div>
            {/* Type filter */}
            <div className="flex gap-1">
              {[
                { key: 'all' as const, label: t('all', { count: allAnnotations.length }) },
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
                          {chapter.notes.length === 1 ? t('noteCount', { count: chapter.notes.length }) : t('noteCountPlural', { count: chapter.notes.length })}
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
                                  {ann.tags.slice(0, 3).map((tag) => (
                                    <span key={tag} className="text-[9px] bg-gray-100 dark:bg-gray-800 text-gray-500 px-1 py-0.5 rounded">{tag}</span>
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
                            <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{ann.content || t('bookmark')}</p>
                          </div>
                        </div>
                      ))}
                      {totalCount === 0 && <p className="text-[10px] text-gray-400 px-7 py-1">{t('noMatchingItems')}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 mb-6 animate-slide-up stagger-3 text-center">
          <p className="text-gray-400 text-sm">{t('noAnnotationsYet')}</p>
          <p className="text-gray-400 text-xs mt-1">{t('startReadingHint')}</p>
        </div>
      )}

      {/* Personal Reading Book */}
      {book.progress > 10 && (
        <div className="bg-gradient-to-r from-amber-50 to-teal-50 dark:from-amber-900/10 dark:to-teal-900/10 rounded-2xl border border-amber-200/50 dark:border-amber-800/30 p-5 mb-6 animate-slide-up stagger-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">{'\uD83D\uDCD5'}</span>
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">{t('personalReadingBook')}</h2>
              <p className="text-xs text-gray-500">{t('personalReadingBookDesc')}</p>
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
              {hasPersonalBook ? t('viewYourBook') : t('generateNow')}
            </Link>
            {hasPersonalBook && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {t('generated')}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Knowledge Graph */}
      <div className="bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/10 dark:to-purple-900/10 rounded-2xl border border-violet-200/50 dark:border-violet-800/30 p-5 mb-6 animate-slide-up stagger-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{'\uD83D\uDDE3\uFE0F'}</span>
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">{t('knowledgeGraph')}</h2>
              <p className="text-xs text-gray-500">{t('knowledgeGraphDesc')}</p>
            </div>
          </div>
          <Link
            href="/knowledge"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-violet-500 hover:bg-violet-600 text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            {t('explore')}
          </Link>
        </div>
      </div>

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
                setExportSuccess(t('markdownExported'));
                setTimeout(() => setExportSuccess(''), 3000);
              } catch { setError(t('failedToExport')); }
            }}
            className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {t('exportMarkdown')}
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
                setExportSuccess(t('jsonExported'));
                setTimeout(() => setExportSuccess(''), 3000);
              } catch { setError(t('failedToExport')); }
            }}
            className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {t('exportJSON')}
          </button>
          {zoteroConnected && (
            <button
              onClick={async () => {
                setZoteroExporting(true);
                try {
                  const res = await api.post<{ message: string }>(`/api/zotero/export/${bookId}`);
                  if (res.success && res.data) {
                    setExportSuccess(res.data.message || t('exportedToZotero'));
                    setTimeout(() => setExportSuccess(''), 4000);
                  } else {
                    setError(res.error?.message || t('failedToExportZotero'));
                  }
                } catch {
                  setError(t('failedToExportZotero'));
                } finally {
                  setZoteroExporting(false);
                }
              }}
              disabled={zoteroExporting}
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
            >
              <span className="font-bold text-sm">Z</span>
              {zoteroExporting ? t('exporting') : t('exportToZotero')}
            </button>
          )}
        </div>
      )}

      {/* Share a Quote */}
      {allAnnotations.filter((a) => a.type === 'highlight').length > 0 && (() => {
        const highlights = allAnnotations.filter((a) => a.type === 'highlight').slice(0, 5);
        const [sharingIdx, setSharingIdx] = useState<number | null>(null);

        const handleShareQuote = async (text: string, idx: number) => {
          setSharingIdx(idx);
          try {
            const canvas = document.createElement('canvas');
            const { renderCardToCanvas } = await import('@/components/reading/QuoteCard');
            renderCardToCanvas(canvas, text, book?.title || 'Unknown Book', book?.author || 'Unknown Author', 'warm');

            canvas.toBlob(async (blob) => {
              if (!blob) { setSharingIdx(null); return; }
              const file = new File([blob], 'read-pal-quote.png', { type: 'image/png' });
              if (navigator.share && navigator.canShare?.({ files: [file] })) {
                try {
                  await navigator.share({ files: [file], title: `${book?.title} — read-pal`, text: `"${text}" — ${book?.author || ''}` });
                } catch (err) { if ((err as DOMException).name !== 'AbortError') { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'read-pal-quote.png'; a.click(); URL.revokeObjectURL(url); } }
              } else {
                try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); } catch { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'read-pal-quote.png'; a.click(); URL.revokeObjectURL(url); }
              }
              setSharingIdx(null);
            }, 'image/png');
          } catch { setSharingIdx(null); }
        };

        return (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/10 dark:to-orange-900/10 rounded-2xl border border-amber-200/50 dark:border-amber-800/30 p-5 mb-6 animate-slide-up stagger-4">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">{'\u2728'}</span>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('shareAQuote')}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('shareAQuoteDesc')}</p>
              </div>
            </div>
            <div className="space-y-2">
              {highlights.map((h, i) => (
                <div key={h.id} className="flex items-start gap-3 group p-2.5 rounded-xl hover:bg-amber-100/50 dark:hover:bg-amber-900/20 transition-colors">
                  <p className="flex-1 text-sm text-gray-700 dark:text-gray-300 italic line-clamp-2 leading-relaxed">
                    &ldquo;{h.content}&rdquo;
                  </p>
                  <button
                    onClick={() => handleShareQuote(h.content, i)}
                    disabled={sharingIdx === i}
                    className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors disabled:opacity-50"
                  >
                    {sharingIdx === i ? (
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                    )}
                    {t('share')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Study Guide Export */}
      {(flashcardCount > 0 || totalAnnotations > 5) && (
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/10 dark:to-blue-900/10 rounded-2xl border border-indigo-200/50 dark:border-indigo-800/30 p-5 mb-6 animate-slide-up stagger-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">{'\uD83D\uDCDA'}</span>
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">{t('studyGuide')}</h2>
              <p className="text-xs text-gray-500">{t('studyGuideDesc')}</p>
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
                  setExportSuccess(t('studyGuideExported'));
                  setTimeout(() => setExportSuccess(''), 3000);
                } catch { setError(t('failedToExportStudyGuide')); }
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-indigo-500 hover:bg-indigo-600 text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              {t('exportStudyGuide')}
            </button>
            {flashcardCount > 0 && (
              <span className="text-xs text-indigo-600 dark:text-indigo-400">
                {flashcardCount === 1 ? t('flashcardIncluded', { count: flashcardCount }) : t('flashcardsIncluded', { count: flashcardCount })}
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
              <h2 className="font-semibold text-gray-900 dark:text-white">{t('flashcardReview')}</h2>
              <p className="text-xs text-gray-500">{t('flashcardReviewDesc')}</p>
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
                  setError(t('failedToGenerateFlashcards'));
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
                  {t('generating')}
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  {t('generateFlashcards')}
                </>
              )}
            </button>
            <Link
              href="/flashcards"
              className="inline-flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 hover:underline"
            >
              {t('reviewDueCards')}
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      )}

      {/* Reading Insights + Log */}
      {readingLog.length > 0 && (() => {
        const totalDuration = readingLog.reduce((sum, e) => sum + e.duration, 0);
        const totalPagesRead = readingLog.reduce((sum, e) => sum + e.pagesRead, 0);
        const totalHighlightsMade = readingLog.reduce((sum, e) => sum + e.highlights, 0);
        const avgSessionMins = Math.round(totalDuration / readingLog.length / 60);
        const totalMins = Math.round(totalDuration / 60);
        const bestSession = readingLog.reduce((best, e) => (e.pagesRead > best.pagesRead ? e : best), readingLog[0]);
        const avgWpm = totalPagesRead > 0 && totalMins > 0 ? Math.round((totalPagesRead * 250) / totalMins) : 0;

        return (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 mb-6 animate-slide-up stagger-4 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <h2 className="font-semibold">{t('readingInsights')}</h2>
              </div>
            </div>

            {/* Insight cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 dark:bg-gray-800">
              {[
                { label: t('sessions'), value: readingLog.length, sub: t('avgSession', { count: avgSessionMins }) },
                { label: t('time'), value: totalMins >= 60 ? `${Math.floor(totalMins / 60)}h ${totalMins % 60}m` : `${totalMins}m`, sub: t('pages', { count: totalPagesRead }) },
                { label: t('speed'), value: avgWpm > 0 ? `${avgWpm}` : '--', sub: avgWpm > 0 ? t('wordsMin') : t('needMoreData') },
                { label: t('best'), value: bestSession.pagesRead, sub: t('pagesInOneSession') },
              ].map((item) => (
                <div key={item.label} className="bg-white dark:bg-gray-900 p-3 text-center">
                  <div className="text-lg font-bold text-gray-900 dark:text-white">{item.value}</div>
                  <div className="text-[10px] text-gray-500">{item.label}</div>
                  <div className="text-[9px] text-gray-400 mt-0.5">{item.sub}</div>
                </div>
              ))}
            </div>

            {/* Session list */}
            <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-64 overflow-y-auto">
              {readingLog.map((entry) => {
                const date = new Date(entry.startedAt);
                const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                const timeStr = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
                const mins = Math.round(entry.duration / 60);
                return (
                  <div key={entry.id} className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <div className="text-xs text-gray-400 min-w-[52px] pt-0.5">
                      <div>{dateStr}</div>
                      <div className="text-[10px]">{timeStr}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="font-medium text-gray-700 dark:text-gray-300">{mins}m</span>
                        {entry.pagesRead > 0 && <span>{entry.pagesRead} pg</span>}
                        {entry.highlights > 0 && <span className="text-amber-500">{entry.highlights}h</span>}
                        {entry.notes > 0 && <span className="text-teal-500">{entry.notes}n</span>}
                      </div>
                      {entry.summary && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed line-clamp-2">{entry.summary}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Actions */}
      <div className="flex gap-3 animate-slide-up stagger-4">
        <Link
          href={`/read/${bookId}`}
          className="flex-1 btn btn-primary text-center hover:scale-[1.02] active:scale-[0.98] transition-transform duration-200"
        >
          {book.status === 'unread' ? t('startReading') : book.status === 'completed' ? t('readAgain') : t('continueReading')}
        </Link>
        <Link
          href="/library"
          className="btn bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          {t('library')}
        </Link>
      </div>
    </main>
  );
}
