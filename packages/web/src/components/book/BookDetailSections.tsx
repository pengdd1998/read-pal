'use client';

import { memo } from 'react';
import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { getBookCoverColors, getBookInitials, isDisplayableAuthor } from '@/lib/book-cover';
import type { BookData } from '@/types/book';

/* ---------- Error / Success banners ---------- */

interface ErrorBannerProps {
  error: string;
  onDismiss: () => void;
  dismissLabel: string;
}

export const ErrorBanner = memo(function ErrorBanner({ error, onDismiss, dismissLabel }: ErrorBannerProps) {
  return (
    <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300 flex items-center justify-between animate-scale-in">
      <span>{error}</span>
      <button type="button" onClick={onDismiss} aria-label={dismissLabel} className="ml-2 text-red-400 hover:text-red-600 min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-amber-400">&times;</button>
    </div>
  );
});

interface SuccessBannerProps {
  message: string;
  onDismiss: () => void;
  dismissLabel: string;
}

export const SuccessBanner = memo(function SuccessBanner({ message, onDismiss, dismissLabel }: SuccessBannerProps) {
  return (
    <div className="mb-6 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-sm text-green-700 dark:text-green-300 flex items-center justify-between animate-scale-in">
      <span>{message}</span>
      <button type="button" onClick={onDismiss} aria-label={dismissLabel} className="ml-2 text-green-400 hover:text-green-600 min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-amber-400">&times;</button>
    </div>
  );
});

/* ---------- Navigation ---------- */

export const BackButton = memo(function BackButton({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <div className="mb-8 animate-slide-up">
      <button type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-lg text-sm text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors focus-visible:ring-2 focus-visible:ring-amber-400"
      >
        <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        {label}
      </button>
    </div>
  );
});

/* ---------- Book header ---------- */

interface BookHeaderProps {
  book: BookData;
  status: { label: string; color: string };
  lastRead: string | null;
  coverAlt: string;
  byLabel: string;
  lastReadLabel: string;
}

export const BookHeader = memo(function BookHeader({ book, status, lastRead, coverAlt, byLabel, lastReadLabel }: BookHeaderProps) {
  return (
    <div className="flex gap-6 mb-10 animate-slide-up stagger-1">
      <div className="w-28 h-40 rounded-xl bg-gradient-to-br from-primary-400/30 to-primary-600/70 flex-shrink-0 overflow-hidden shadow-md">
        {book.coverUrl ? (
          <Image src={book.coverUrl} alt={coverAlt} width={112} height={160} className="w-full h-full object-cover" />
        ) : (
          <div className={`w-full h-full flex flex-col items-center justify-center bg-gradient-to-br ${getBookCoverColors(book.title)[0]} ${getBookCoverColors(book.title)[1]}`}>
            <span className="text-2xl font-bold tracking-wide opacity-90">{getBookInitials(book.title)}</span>
            <span className="text-[8px] mt-1 opacity-60 px-2 text-center line-clamp-2 max-w-[80%]">{book.title}</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-bold text-gray-900 leading-tight">{book.title}</h1>
        {isDisplayableAuthor(book.author) && <p className="text-gray-500 mt-1">{byLabel}</p>}
        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold mt-3 ${status.color}`}>
          {status.label}
        </span>
        {lastRead && <p className="text-xs text-gray-500 mt-2">{lastReadLabel}</p>}
      </div>
    </div>
  );
});

/* ---------- Progress section ---------- */

interface ProgressSectionProps {
  progressPct: number;
  currentPage: number;
  totalPages: number;
  isReading: boolean;
  estimatedMinutesLeft: number;
  readingWpm: number;
  locale: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export const ProgressSection = memo(function ProgressSection({
  progressPct, currentPage, totalPages, isReading, estimatedMinutesLeft, readingWpm, locale, t,
}: ProgressSectionProps) {
  return (
    <div className="bg-surface-0 rounded-2xl border border-surface-3 p-6 mb-6 animate-slide-up stagger-2">
      <h2 className="font-semibold mb-4">{t('progress')}</h2>
      <div className="w-full bg-surface-1 rounded-full h-3 overflow-hidden mb-3" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100} aria-label={t('progressAriaLabel', { pct: progressPct })}>
        <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-teal-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">{t('chaptersOf', { current: currentPage, total: totalPages })}</span>
        <span className="font-semibold text-amber-600 dark:text-amber-400">{progressPct}%</span>
      </div>
      {isReading && estimatedMinutesLeft > 0 && (() => {
        const hours = Math.floor(estimatedMinutesLeft / 60);
        const mins = estimatedMinutesLeft % 60;
        const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
        const daysLeft = Math.ceil(estimatedMinutesLeft / 30);
        const finishDate = new Date();
        finishDate.setDate(finishDate.getDate() + daysLeft);
        const finishStr = finishDate.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
        return (
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-gray-500">{t('remaining', { time: timeStr })}</p>
            <p className="text-xs text-gray-500">
              {t('finishBy', { date: finishStr })} {readingWpm > 0 && <span className="text-teal-500">{t('wpm', { wpm: readingWpm })}</span>}
            </p>
          </div>
        );
      })()}
    </div>
  );
});

/* ---------- Stats grid ---------- */

export const StatsGrid = memo(function StatsGrid({ items }: {
  items: Array<{ label: string; value: number; color: string; bg: string }>;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 animate-slide-up stagger-3">
      {items.map((item) => (
        <div key={item.label} className={`${item.bg} rounded-xl p-4 text-center`} aria-label={`${item.value} ${item.label.toLowerCase()}`}>
          <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
          <div className="text-xs text-gray-500 mt-1">{item.label}</div>
        </div>
      ))}
    </div>
  );
});

/* ---------- Tag cloud ---------- */

export const TagCloud = memo(function TagCloud({ tags, moreLabel }: {
  tags: Array<{ name: string; count: number }>;
  moreLabel: string;
}) {
  if (tags.length === 0) return null;
  return (
    <div className="mb-6 animate-slide-up stagger-3">
      <div className="flex flex-wrap gap-1.5">
        {tags.slice(0, 15).map((tag) => (
          <span key={tag.name} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-surface-1 text-gray-600 hover:bg-amber-100 dark:hover:bg-amber-900/20 hover:text-amber-700 dark:hover:text-amber-300 transition-colors cursor-default">
            {tag.name}
            <span className="text-[9px] text-gray-500">{tag.count}</span>
          </span>
        ))}
        {tags.length > 15 && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs text-gray-500">
            {moreLabel}
          </span>
        )}
      </div>
    </div>
  );
});

/* ---------- Personal reading book section ---------- */

export const PersonalReadingBookSection = memo(function PersonalReadingBookSection({ bookId, hasPersonalBook, t }: {
  bookId: string;
  hasPersonalBook: boolean;
  t: (key: string) => string;
}) {
  return (
    <div className="bg-gradient-to-r from-amber-50 to-teal-50 dark:from-amber-900/10 dark:to-teal-900/10 rounded-2xl border border-amber-200/50 dark:border-amber-800/30 p-5 mb-6 animate-slide-up stagger-4">
      <div className="flex items-center gap-3 mb-3">
        <svg aria-hidden="true" className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <div>
          <h2 className="font-semibold text-gray-900">{t('personalReadingBook')}</h2>
          <p className="text-xs text-gray-500">{t('personalReadingBookDesc')}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Link href={`/memory-books/${bookId}`} prefetch={false} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors">
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
  );
});

/* ---------- Knowledge graph card ---------- */

export const KnowledgeGraphCard = memo(function KnowledgeGraphCard({ t }: {
  t: (key: string) => string;
}) {
  return (
    <div className="bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/10 dark:to-purple-900/10 rounded-2xl border border-violet-200/50 dark:border-violet-800/30 p-5 mb-6 animate-slide-up stagger-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">{'🗣️'}</span>
          <div>
            <h2 className="font-semibold text-gray-900">{t('knowledgeGraph')}</h2>
            <p className="text-xs text-gray-500">{t('knowledgeGraphDesc')}</p>
          </div>
        </div>
        <Link href="/knowledge" prefetch={false} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-violet-500 hover:bg-violet-600 text-white transition-colors">
          <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          {t('explore')}
        </Link>
      </div>
    </div>
  );
});

/* ---------- Action buttons ---------- */

export const ActionButtons = memo(function ActionButtons({ bookId, bookStatus, startLabel, readAgainLabel, continueLabel, libraryLabel }: {
  bookId: string;
  bookStatus: string;
  startLabel: string;
  readAgainLabel: string;
  continueLabel: string;
  libraryLabel: string;
}) {
  const actionLabel = bookStatus === 'unread' ? startLabel : bookStatus === 'completed' ? readAgainLabel : continueLabel;
  return (
    <div className="flex gap-3 animate-slide-up stagger-4">
      <Link
        href={`/read/${bookId}`}
        className="flex-1 btn btn-primary text-center hover:scale-[1.02] active:scale-[0.98] transition-transform duration-200"
      >
        {actionLabel}
      </Link>
      <Link
        href="/library" prefetch={false}
        className="btn bg-surface-0 border border-surface-3 text-gray-700"
      >
        {libraryLabel}
      </Link>
    </div>
  );
});
