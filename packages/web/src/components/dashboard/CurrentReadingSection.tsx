'use client';

import Image from 'next/image';
import React, { useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { isDisplayableAuthor, getBookInitials, getBookCoverColors } from '@/lib/book-cover';
import { formatRelativeTime } from '@/lib/date';
import { SkeletonPulse } from './SkeletonPulse';
import type { RecentBook, DashboardStats } from './types';
import { DashboardStatIcon } from './DashboardIcons';
import { ReadingStreakCard, QuickActions, InsightCard } from './CurrentReadingSubComponents';

export interface InsightKey {
  agentKey: string;
  icon: string;
  key: string;
}

interface CurrentReadingSectionProps {
  recentBooks: RecentBook[];
  stats: DashboardStats | null;
  loading: boolean;
  insightOfDayKey: InsightKey | null;
}

const ActiveBookCard = React.memo(function ActiveBookCard({ book, isFirst, isMultiple, coverAlt, continueLabel, lastReadLabel }: {
  book: RecentBook;
  isFirst: boolean;
  isMultiple: boolean;
  coverAlt: string;
  continueLabel: string;
  lastReadLabel: string;
}) {
  const [coverBg, coverText] = getBookCoverColors(book.title);
  return (
    <Link
      href={`/read/${book.id}`}
      prefetch={false}
      className={`block card group hover:border-primary-200 dark:hover:border-primary-800 transition-all duration-200 ${isFirst && isMultiple ? 'ring-1 ring-primary-200 dark:ring-primary-800' : ''}`}
    >
      <div className="flex items-center gap-4">
        <div className={`w-14 h-20 rounded-lg bg-gradient-to-br ${book.coverUrl ? 'from-primary-400 to-primary-600' : coverBg} flex items-center justify-center flex-shrink-0 overflow-hidden shadow-sm`}>
          {book.coverUrl ? (
            <Image src={book.coverUrl} alt={coverAlt} width={56} height={80} className="w-full h-full object-cover rounded-lg" />
          ) : (
            <span className={`${coverText} text-sm font-bold`}>{getBookInitials(book.title)}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
              {book.title}
            </h3>
            {isFirst && isMultiple && (
              <span className="text-[10px] font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-1.5 py-0.5 rounded-full whitespace-nowrap">{continueLabel}</span>
            )}
          </div>
          {isDisplayableAuthor(book.author) && <p className="text-xs text-gray-500 mt-0.5">{book.author}</p>}
          <div className="flex items-center gap-3 mt-2">
            <div className="flex-1 max-w-[180px]">
              <div className="w-full bg-surface-1 rounded-full h-2" role="progressbar" aria-label={continueLabel} aria-valuenow={Math.round(book.progress)} aria-valuemin={0} aria-valuemax={100}>
                <div
                  className="bg-primary-500 rounded-full h-2 transition-all duration-500 ease-out"
                  style={{ width: `${Math.min(100, book.progress)}%` }}
                />
              </div>
            </div>
            <span className="text-xs text-gray-500 tabular-nums font-medium">{book.progress}%</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className="text-[10px] text-gray-500 whitespace-nowrap">{lastReadLabel}</span>
          <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary-500 text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-sm">
            {continueLabel}
            <svg aria-hidden="true" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
});

const StatItem = React.memo(function StatItem({ icon, value, label }: { icon: string; value: string | number; label: string }) {
  return (
    <div className="card py-3 px-3 flex items-center gap-2">
      <DashboardStatIcon type={icon} />
      <div>
        <div className="text-lg font-bold text-gray-900 tabular-nums">{value}</div>
        <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wide leading-tight">{label}</div>
      </div>
    </div>
  );
});

const ReadingSkeleton = React.memo(function ReadingSkeleton() {
  return (
    <div className="card">
      <div className="flex items-center gap-4">
        <SkeletonPulse className="w-12 h-16 rounded-lg flex-shrink-0" />
        <div className="flex-1">
          <SkeletonPulse className="h-4 w-48 mb-2" />
          <SkeletonPulse className="h-3 w-32" />
        </div>
      </div>
    </div>
  );
});

const CompletedBookCard = React.memo(function CompletedBookCard({ book, coverAlt, continueLabel, lastReadLabel }: {
  book: RecentBook;
  coverAlt: string;
  continueLabel: string;
  lastReadLabel: string;
}) {
  const [cBg, cText] = getBookCoverColors(book.title);
  return (
    <Link
      href={`/read/${book.id}`}
      className="block card group hover:border-primary-200 dark:hover:border-primary-800 transition-all duration-200"
    >
      <div className="flex items-center gap-4">
        <div className={`w-14 h-20 rounded-lg bg-gradient-to-br ${book.coverUrl ? 'from-primary-400 to-primary-600' : cBg} flex items-center justify-center flex-shrink-0 overflow-hidden shadow-sm`}>
          {book.coverUrl ? (
            <Image src={book.coverUrl} alt={coverAlt} width={56} height={80} className="w-full h-full object-cover rounded-lg" />
          ) : (
            <span className={`${cText} text-sm font-bold`}>{getBookInitials(book.title)}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
            {book.title}
          </h3>
          {isDisplayableAuthor(book.author) && <p className="text-xs text-gray-500 mt-0.5">{book.author}</p>}
          <div className="flex items-center gap-3 mt-2">
            <div className="flex-1 max-w-[180px]">
              <div className="w-full bg-surface-1 rounded-full h-2" role="progressbar" aria-label={continueLabel} aria-valuenow={Math.round(book.progress)} aria-valuemin={0} aria-valuemax={100}>
                <div
                  className="bg-primary-500 rounded-full h-2 transition-all duration-500 ease-out"
                  style={{ width: `${Math.min(100, book.progress)}%` }}
                />
              </div>
            </div>
            <span className="text-xs text-gray-500 tabular-nums font-medium">{book.progress}%</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className="text-[10px] text-gray-500 whitespace-nowrap">{lastReadLabel}</span>
          <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary-500 text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-sm">
            {continueLabel}
            <svg aria-hidden="true" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
});

const EmptyReadingState = React.memo(function EmptyReadingState({ noActiveLabel, pickBookLabel }: { noActiveLabel: string; pickBookLabel: string }) {
  return (
    <div className="card text-center py-10">
      <p className="text-sm text-gray-500 mb-4">{noActiveLabel}</p>
      <Link href="/library" prefetch={false} className="btn btn-primary hover:scale-105 active:scale-95 transition-transform duration-200">
        {pickBookLabel}
      </Link>
    </div>
  );
});

const StatsGrid = React.memo(function StatsGrid({ stats }: { stats: DashboardStats }) {
  const t = useTranslations('dashboard');
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {[
        { label: t('stat_books_read'), value: stats.booksRead, icon: 'books' },
        { label: t('stat_pages_read'), value: stats.pagesRead, icon: 'ruler' },
        { label: t('stat_total_time'), value: stats.totalTime, icon: 'clock' },
        { label: t('stat_concepts'), value: stats.conceptsLearned, icon: 'brain' },
        { label: t('stat_connections'), value: stats.connections, icon: 'link' },
      ].map((s) => (
        <StatItem key={s.label} icon={s.icon} value={s.value} label={s.label} />
      ))}
    </div>
  );
});

export const CurrentReadingSection = React.memo(function CurrentReadingSection({ recentBooks, stats, loading, insightOfDayKey }: CurrentReadingSectionProps) {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');
  const locale = useLocale();

  const fmtTime = (d: string) => formatRelativeTime(d, {
    just_now: tc('just_now'),
    minutes_ago: tc('minutes_ago'),
    hours_ago: tc('hours_ago'),
    days_ago: tc('days_ago'),
  } as const, locale);

  const currentBook = recentBooks.length > 0 ? recentBooks[0] : null;
  const activeBooks = useMemo(
    () => recentBooks.filter((b) => b.progress > 0 && b.progress < 100).slice(0, 3),
    [recentBooks],
  );
  const streak = stats?.readingStreak ?? 0;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Card 1: Current Reading */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          {activeBooks.length > 1 ? t('currently_reading') : t('current_reading')}
        </h2>
        {loading ? (
          <ReadingSkeleton />
        ) : activeBooks.length > 0 ? (
          <div className="space-y-3">
            {activeBooks.map((book, i) => (
              <ActiveBookCard
                key={book.id}
                book={book}
                isFirst={i === 0}
                isMultiple={activeBooks.length > 1}
                coverAlt={t('cover_of', { title: book.title })}
                continueLabel={t('continue_button')}
                lastReadLabel={fmtTime(book.lastRead)}
              />
            ))}
          </div>
        ) : currentBook ? (
          <CompletedBookCard
            book={currentBook}
            coverAlt={t('cover_of', { title: currentBook.title })}
            continueLabel={t('continue_button')}
            lastReadLabel={fmtTime(currentBook.lastRead)}
          />
        ) : (
          <EmptyReadingState
            noActiveLabel={t('no_active_reading')}
            pickBookLabel={t('pick_book')}
          />
        )}
      </div>

      {/* Stats summary row */}
      {stats && !loading && <StatsGrid stats={stats} />}

      {/* Card 2: Reading Streak */}
      <ReadingStreakCard streak={streak} loading={loading} />

      {/* Quick Actions */}
      <QuickActions />

      {/* Card 3: Quick Insight */}
      <InsightCard insightKey={insightOfDayKey} />
    </div>
  );
});

