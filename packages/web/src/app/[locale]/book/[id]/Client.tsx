'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { usePageTitle } from '@/hooks/usePageTitle';
import { getBookCoverColors, getBookInitials, isDisplayableAuthor } from '@/lib/book-cover';
import { useBookDetail } from '@/hooks/useBookDetail';
import { BookDetailLoading, BookDetailError } from '@/components/book/BookDetailSkeleton';
import { ShareQuoteSection } from '@/components/book/ShareQuoteSection';
import { NotesOutline } from '@/components/book/NotesOutline';
import { ExportActions } from '@/components/book/ExportActions';
import { ReadingInsights } from '@/components/book/ReadingInsights';
import { FlashcardCard } from '@/components/book/FlashcardCard';
import { StudyGuideCard } from '@/components/book/StudyGuideCard';

export default function BookDetailPage() {
 const t = useTranslations('book');
 const locale = useLocale();
 usePageTitle(t('pageTitle'));
 const params = useParams();
 const router = useRouter();
 const bookId = (params?.id ?? '') as string;

 const {
 book,
 annotationStats,
 allAnnotations,
 hasPersonalBook,
 loading,
 error,
 setError,
 readingLog,
 readingWpm,
 flashcardCount,
 tags,
 zoteroConnected,
 } = useBookDetail(bookId, t);

 const [exportSuccess, setExportSuccess] = useState('');
 const exportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

 useEffect(() => {
   return () => {
     if (exportTimerRef.current) {
       clearTimeout(exportTimerRef.current);
     }
   };
 }, []);

 const handleExportSuccess = (msg: string) => {
   if (exportTimerRef.current) {
     clearTimeout(exportTimerRef.current);
   }
   setExportSuccess(msg);
   exportTimerRef.current = setTimeout(() => setExportSuccess(''), 3000);
 };

 if (loading) return <BookDetailLoading />;
 if (!book) return <BookDetailError error={error} t={t} />;

 const progressPct = Math.round(book.progress);
 const remainingChapters = Math.max(0, book.totalPages - book.currentPage);
 const estimatedMinutesLeft = useMemo(() => {
 const WORDS_PER_CHAPTER = 250 * 25;
 return remainingChapters > 0
 ? readingWpm > 0
  ? Math.round((remainingChapters * WORDS_PER_CHAPTER) / readingWpm)
  : remainingChapters * 8
 : 0;
 }, [remainingChapters, readingWpm]);
 const statusConfig = useMemo(() => ({
 unread: { label: t('notStarted'), color: 'bg-surface-1 text-gray-600 dark:text-gray-400' },
 reading: { label: t('reading'), color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300' },
 completed: { label: t('completed'), color: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' },
 }), [t]);
 const status = statusConfig[book.status as keyof typeof statusConfig];
 const lastRead = book.lastReadAt
 ? new Date(book.lastReadAt).toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' })
 : null;
 const totalAnnotations = annotationStats.highlights + annotationStats.notes + annotationStats.bookmarks;
 const highlights = useMemo(() => allAnnotations.filter((a) => a.type === 'highlight'), [allAnnotations]);

 return (
 <main className="px-4 sm:px-6 lg:px-8 py-12 animate-fade-in">
  {/* Error banner */}
  {error && (
  <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300 flex items-center justify-between animate-scale-in">
   <span>{error}</span>
   <button onClick={() => setError('')} aria-label={t("dismiss", { defaultValue: "Dismiss" })} className="ml-2 text-red-400 hover:text-red-600 min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-amber-400">&times;</button>
  </div>
  )}
  {/* Success banner */}
  {exportSuccess && (
  <div className="mb-6 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-sm text-green-700 dark:text-green-300 flex items-center justify-between animate-scale-in">
   <span>{exportSuccess}</span>
   <button onClick={() => setExportSuccess('')} aria-label={t("dismiss", { defaultValue: "Dismiss" })} className="ml-2 text-green-400 hover:text-green-600 min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-amber-400">&times;</button>
  </div>
  )}
  {/* Back */}
  <div className="mb-8 animate-slide-up">
  <button
   onClick={() => router.back()}
   className="inline-flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors focus-visible:ring-2 focus-visible:ring-amber-400"
  >
   <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
   </svg>
   {t('library')}
  </button>
  </div>

  {/* Book header */}
  <div className="flex gap-6 mb-10 animate-slide-up stagger-1">
  <div className="w-28 h-40 rounded-xl bg-gradient-to-br from-primary-400/30 to-primary-600/70 flex-shrink-0 overflow-hidden shadow-md">
   {book.coverUrl ? (
   <Image src={book.coverUrl} alt={t('coverAlt', { title: book.title })} width={112} height={160} className="w-full h-full object-cover" />
   ) : (
   <div className={`w-full h-full flex flex-col items-center justify-center bg-gradient-to-br ${getBookCoverColors(book.title)[0]} ${getBookCoverColors(book.title)[1]}`}>
    <span className="text-2xl font-bold tracking-wide opacity-90">{getBookInitials(book.title)}</span>
    <span className="text-[8px] mt-1 opacity-60 px-2 text-center line-clamp-2 max-w-[80%]">{book.title}</span>
   </div>
   )}
  </div>
  <div className="flex-1 min-w-0">
   <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-tight">{book.title}</h1>
   {isDisplayableAuthor(book.author) && <p className="text-gray-500 dark:text-gray-400 mt-1">{t('by', { author: book.author })}</p>}
   <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold mt-3 ${status.color}`}>
   {status.label}
   </span>
   {lastRead && <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">{t('lastRead', { date: lastRead })}</p>}
  </div>
  </div>

  {/* Progress */}
  <div className="bg-surface-0 rounded-2xl border border-surface-3 p-6 mb-6 animate-slide-up stagger-2">
  <h2 className="font-semibold mb-4">{t('progress')}</h2>
  <div className="w-full bg-surface-1 rounded-full h-3 overflow-hidden mb-3" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100} aria-label={t('progressAriaLabel', { pct: progressPct })}>
   <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-teal-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
  </div>
  <div className="flex items-center justify-between text-sm">
   <span className="text-gray-500 dark:text-gray-400">{t('chaptersOf', { current: book.currentPage, total: book.totalPages })}</span>
   <span className="font-semibold text-amber-600 dark:text-amber-400">{progressPct}%</span>
  </div>
  {book.status === 'reading' && estimatedMinutesLeft > 0 && (() => {
   const hours = Math.floor(estimatedMinutesLeft / 60);
   const mins = estimatedMinutesLeft % 60;
   const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
   const daysLeft = Math.ceil(estimatedMinutesLeft / 30);
   const finishDate = new Date();
   finishDate.setDate(finishDate.getDate() + daysLeft);
   const finishStr = finishDate.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
   return (
   <div className="flex items-center justify-between mt-2">
    <p className="text-xs text-gray-400 dark:text-gray-500">{t('remaining', { time: timeStr })}</p>
    <p className="text-xs text-gray-400 dark:text-gray-500">
    {t('finishBy', { date: finishStr })} {readingWpm > 0 && <span className="text-teal-500">{t('wpm', { wpm: readingWpm })}</span>}
    </p>
   </div>
   );
  })()}
  </div>

  {/* Stats grid */}
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 animate-slide-up stagger-3">
  {[
   { label: t('highlights'), value: annotationStats.highlights, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/10' },
   { label: t('notes'), value: annotationStats.notes, color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-900/10' },
   { label: t('bookmarks'), value: annotationStats.bookmarks, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/10' },
  ].map((item) => (
   <div key={item.label} className={`${item.bg} rounded-xl p-4 text-center`} aria-label={`${item.value} ${item.label.toLowerCase()}`}>
   <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
   <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{item.label}</div>
   </div>
  ))}
  </div>

  {/* Tag Cloud */}
  {tags.length > 0 && (
  <div className="mb-6 animate-slide-up stagger-3">
   <div className="flex flex-wrap gap-1.5">
   {tags.slice(0, 15).map((tag) => (
    <span key={tag.name} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-surface-1 text-gray-600 dark:text-gray-400 hover:bg-amber-100 dark:hover:bg-amber-900/20 hover:text-amber-700 dark:hover:text-amber-300 transition-colors cursor-default">
    {tag.name}
    <span className="text-[9px] text-gray-500 dark:text-gray-400">{tag.count}</span>
    </span>
   ))}
   {tags.length > 15 && (
    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs text-gray-400 dark:text-gray-500">
    {t('moreTags', { count: tags.length - 15 })}
    </span>
   )}
   </div>
  </div>
  )}

  {/* Notes Outline */}
  <NotesOutline allAnnotations={allAnnotations} annotationStats={annotationStats} t={t} />

  {/* Personal Reading Book */}
  {book.progress > 10 && (
  <div className="bg-gradient-to-r from-amber-50 to-teal-50 dark:from-amber-900/10 dark:to-teal-900/10 rounded-2xl border border-amber-200/50 dark:border-amber-800/30 p-5 mb-6 animate-slide-up stagger-4">
   <div className="flex items-center gap-3 mb-3">
   <svg aria-hidden="true" className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
   <div>
    <h2 className="font-semibold text-gray-900 dark:text-gray-100">{t('personalReadingBook')}</h2>
    <p className="text-xs text-gray-500 dark:text-gray-400">{t('personalReadingBookDesc')}</p>
   </div>
   </div>
   <div className="flex items-center gap-3">
   <Link href={`/memory-books/${bookId}`} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors">
    <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
    {hasPersonalBook ? t('viewYourBook') : t('generateNow')}
   </Link>
   {hasPersonalBook && (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
    <svg aria-hidden="true" className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
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
   <span className="text-2xl" aria-hidden="true">{'🗣️'}</span>
   <div>
    <h2 className="font-semibold text-gray-900 dark:text-gray-100">{t('knowledgeGraph')}</h2>
    <p className="text-xs text-gray-500 dark:text-gray-400">{t('knowledgeGraphDesc')}</p>
   </div>
   </div>
   <Link href="/knowledge" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-violet-500 hover:bg-violet-600 text-white transition-colors">
   <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
   </svg>
   {t('explore')}
   </Link>
  </div>
  </div>

  {/* Export annotations */}
  <ExportActions
  bookId={bookId}
  book={book}
  totalAnnotations={totalAnnotations}
  zoteroConnected={zoteroConnected}
  t={t}
  onExportSuccess={handleExportSuccess}
  onExportError={setError}
  />

  {/* Share a Quote */}
  {highlights.length > 0 && (
  <ShareQuoteSection
   highlights={highlights.slice(0, 5)}
   bookTitle={book.title}
   bookAuthor={book.author}
   t={t}
  />
  )}

  {/* Study Guide Export */}
  <StudyGuideCard
  bookId={bookId}
  book={book}
  flashcardCount={flashcardCount}
  totalAnnotations={totalAnnotations}
  t={t}
  onExportSuccess={handleExportSuccess}
  onError={setError}
  />

  {/* Flashcard Review */}
  <FlashcardCard bookId={bookId} totalAnnotations={totalAnnotations} flashcardCount={flashcardCount} t={t} onError={setError} />

  {/* Reading Insights + Log */}
  <ReadingInsights readingLog={readingLog} t={t} locale={locale} />

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
   className="btn bg-surface-0 border border-surface-3 text-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
  >
   {t('library')}
  </Link>
  </div>
 </main>
 );
}
