'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { usePageTitle } from '@/hooks/usePageTitle';
import { parseUTCDate } from '@/lib/date';
import { useBookDetail } from '@/hooks/useBookDetail';
import { BookDetailLoading, BookDetailError } from '@/components/book/BookDetailSkeleton';
import {
  ErrorBanner,
  SuccessBanner,
  BackButton,
  BookHeader,
  ProgressSection,
  StatsGrid,
  TagCloud,
  PersonalReadingBookSection,
  KnowledgeGraphCard,
  ActionButtons,
} from '@/components/book/BookDetailSections';

const ShareQuoteSection = dynamic(
  () => import('@/components/book/ShareQuoteSection').then((m) => m.ShareQuoteSection),
);
const NotesOutline = dynamic(
  () => import('@/components/book/NotesOutline').then((m) => m.NotesOutline),
);
const ExportActions = dynamic(
  () => import('@/components/book/ExportActions').then((m) => m.ExportActions),
);
const ReadingInsights = dynamic(
  () => import('@/components/book/ReadingInsights').then((m) => m.ReadingInsights),
);
const FlashcardCard = dynamic(
  () => import('@/components/book/FlashcardCard').then((m) => m.FlashcardCard),
);
const StudyGuideCard = dynamic(
  () => import('@/components/book/StudyGuideCard').then((m) => m.StudyGuideCard),
);

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
    refetch: refetchBook,
  } = useBookDetail(bookId, t);

  // Refetch on tab focus
  useEffect(() => {
    const onFocus = () => refetchBook();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refetchBook]);

  const [exportSuccess, setExportSuccess] = useState('');
  const exportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (exportTimerRef.current) {
        clearTimeout(exportTimerRef.current);
      }
    };
  }, []);

  const handleExportSuccess = useCallback((msg: string) => {
    if (exportTimerRef.current) {
      clearTimeout(exportTimerRef.current);
    }
    setExportSuccess(msg);
    exportTimerRef.current = setTimeout(() => setExportSuccess(''), 3000);
  }, []);

  if (loading) return <BookDetailLoading />;
  if (!book) return <BookDetailError error={error} t={t} />;

  const progressPct = Math.round(book.progress);
  const remainingChapters = Math.max(0, book.totalPages - book.currentPage);
  const estimatedMinutesLeft = remainingChapters > 0
    ? readingWpm > 0
      ? Math.round((remainingChapters * 250 * 25) / readingWpm)
      : remainingChapters * 8
    : 0;
  const statusConfig = {
    unread: { label: t('notStarted'), color: 'bg-surface-1 text-gray-600 dark:text-gray-400' },
    reading: { label: t('reading'), color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300' },
    completed: { label: t('completed'), color: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' },
  };
  const status = statusConfig[book.status];
  const lastRead = book.lastReadAt
    ? parseUTCDate(book.lastReadAt).toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' })
    : null;
  const totalAnnotations = annotationStats.highlights + annotationStats.notes + annotationStats.bookmarks;
  const highlights = allAnnotations.filter((a) => a.type === 'highlight');

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-12 animate-fade-in">
      {error && <ErrorBanner error={error} onDismiss={() => setError('')} dismissLabel={t('dismiss')} />}
      {exportSuccess && <SuccessBanner message={exportSuccess} onDismiss={() => setExportSuccess('')} dismissLabel={t('dismiss')} />}

      <BackButton onBack={() => router.back()} label={t('library')} />

      <BookHeader
        book={book}
        status={status}
        lastRead={lastRead}
        coverAlt={t('coverAlt', { title: book.title })}
        byLabel={t('by', { author: book.author })}
        lastReadLabel={lastRead ? t('lastRead', { date: lastRead }) : ''}
      />

      <ProgressSection
        progressPct={progressPct}
        currentPage={book.currentPage}
        totalPages={book.totalPages}
        isReading={book.status === 'reading'}
        estimatedMinutesLeft={estimatedMinutesLeft}
        readingWpm={readingWpm}
        locale={locale}
        t={t}
      />

      <StatsGrid items={[
        { label: t('highlights'), value: annotationStats.highlights, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/10' },
        { label: t('notes'), value: annotationStats.notes, color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-900/10' },
        { label: t('bookmarks'), value: annotationStats.bookmarks, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/10' },
      ]} />

      <TagCloud tags={tags} moreLabel={t('moreTags', { count: tags.length - 15 })} />

      <NotesOutline allAnnotations={allAnnotations} annotationStats={annotationStats} t={t} />

      {book.progress > 10 && (
        <PersonalReadingBookSection bookId={bookId} hasPersonalBook={hasPersonalBook} t={t} />
      )}

      <KnowledgeGraphCard t={t} />

      <ExportActions
        bookId={bookId}
        book={book}
        totalAnnotations={totalAnnotations}
        zoteroConnected={zoteroConnected}
        t={t}
        onExportSuccess={handleExportSuccess}
        onExportError={setError}
      />

      {highlights.length > 0 && (
        <ShareQuoteSection
          highlights={highlights.slice(0, 5)}
          bookTitle={book.title}
          bookAuthor={book.author}
          t={t}
        />
      )}

      <StudyGuideCard
        bookId={bookId}
        book={book}
        flashcardCount={flashcardCount}
        totalAnnotations={totalAnnotations}
        t={t}
        onExportSuccess={handleExportSuccess}
        onError={setError}
      />

      <FlashcardCard bookId={bookId} totalAnnotations={totalAnnotations} t={t} onError={setError} />

      <ReadingInsights readingLog={readingLog} t={t} locale={locale} />

      <ActionButtons
        bookId={bookId}
        bookStatus={book.status}
        startLabel={t('startReading')}
        readAgainLabel={t('readAgain')}
        continueLabel={t('continueReading')}
        libraryLabel={t('library')}
      />
    </div>
  );
}
