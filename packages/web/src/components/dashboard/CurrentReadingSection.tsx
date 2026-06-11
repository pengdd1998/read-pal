'use client';

import Image from 'next/image';
import React, { useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { isDisplayableAuthor, getBookInitials, getBookCoverColors } from '@/lib/book-cover';
import { formatRelativeTime } from '@/lib/date';
import { SkeletonPulse } from './SkeletonPulse';
import type { RecentBook, DashboardStats } from './types';

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


function DashboardStatIcon({ type }: { type: string }) {
  const cls = 'w-5 h-5 text-gray-500 dark:text-gray-400';
  switch (type) {
    case 'books':
      return (
        <svg aria-hidden="true" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
      );
    case 'ruler':
      return (
        <svg aria-hidden="true" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
        </svg>
      );
    case 'clock':
      return (
        <svg aria-hidden="true" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'brain':
      return (
        <svg aria-hidden="true" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
        </svg>
      );
    case 'link':
      return (
        <svg aria-hidden="true" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
        </svg>
      );
    default:
      return null;
  }
}

function DashboardActionIcon({ type }: { type: string }) {
  const cls = 'w-5 h-5';
  switch (type) {
    case 'upload':
      return (
        <svg aria-hidden="true" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
      );
    case 'book':
      return (
        <svg aria-hidden="true" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
      );
    case 'cards':
      return (
        <svg aria-hidden="true" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75 6.429 9.75m11.142 0l4.179 2.25L12 17.25 2.25 12l4.179-2.25m11.142 0l4.179 2.25L12 22.5l-9.75-5.25 4.179-2.25" />
        </svg>
      );
    case 'chart':
      return (
        <svg aria-hidden="true" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      );
    case 'books':
      return (
        <svg aria-hidden="true" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
      );
    default:
      return null;
  }
}

function InsightIcon({ type }: { type: string }) {
  const cls = 'w-7 h-7 text-primary-500 dark:text-primary-400';
  switch (type) {
    case 'book-open':
      return (
        <svg aria-hidden="true" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
      );
    case 'microscope':
      return (
        <svg aria-hidden="true" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
        </svg>
      );
    case 'target':
      return (
        <svg aria-hidden="true" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
        </svg>
      );
    case 'brain':
      return (
        <svg aria-hidden="true" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
        </svg>
      );
    case 'handshake':
      return (
        <svg aria-hidden="true" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.052.148.591 1.2.924 2.55.924 3.977a9.836 9.836 0 01-1.302 4.89l.078.079a4.5 4.5 0 01-6.364 6.364l-.079-.078a9.836 9.836 0 01-4.89 1.302c-1.427 0-2.777-.333-3.977-.924a1.5 1.5 0 01-.148-.052m8.024-9.75a9.836 9.836 0 01-1.302 4.89l-.078.079m0 0a4.5 4.5 0 01-6.364 6.364m0 0l-.079-.078a9.836 9.836 0 01-4.89-1.302m0 0a1.5 1.5 0 01-.052-.148" />
        </svg>
      );
    default:
      return null;
  }
}

const ActiveBookCard = React.memo(function ActiveBookCard({ book, isFirst, isMultiple, coverAlt, continueLabel, lastReadLabel }: {
  book: RecentBook;
  isFirst: boolean;
  isMultiple: boolean;
  coverAlt: string;
  continueLabel: string;
  lastReadLabel: string;
}) {
  return (
    <Link
      href={`/read/${book.id}`}
      className={`block card group hover:border-primary-200 dark:hover:border-primary-800 transition-all duration-200 ${isFirst && isMultiple ? 'ring-1 ring-primary-200 dark:ring-primary-800' : ''}`}
    >
      <div className="flex items-center gap-4">
        <div className={`w-14 h-20 rounded-lg bg-gradient-to-br ${book.coverUrl ? 'from-primary-400 to-primary-600' : getBookCoverColors(book.title)[0]} flex items-center justify-center flex-shrink-0 overflow-hidden shadow-sm`}>
          {book.coverUrl ? (
            <Image src={book.coverUrl} alt={coverAlt} width={56} height={80} className="w-full h-full object-cover rounded-lg" />
          ) : (
            <span className={`${getBookCoverColors(book.title)[1]} text-sm font-bold`}>{getBookInitials(book.title)}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
              {book.title}
            </h3>
            {isFirst && isMultiple && (
              <span className="text-[10px] font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-1.5 py-0.5 rounded-full whitespace-nowrap">{continueLabel}</span>
            )}
          </div>
          {isDisplayableAuthor(book.author) && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{book.author}</p>}
          <div className="flex items-center gap-3 mt-2">
            <div className="flex-1 max-w-[180px]">
              <div className="w-full bg-surface-1 rounded-full h-2" role="progressbar" aria-label={continueLabel} aria-valuenow={Math.round(book.progress)} aria-valuemin={0} aria-valuemax={100}>
                <div
                  className="bg-primary-500 rounded-full h-2 transition-all duration-500 ease-out"
                  style={{ width: `${Math.min(100, book.progress)}%` }}
                />
              </div>
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums font-medium">{book.progress}%</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">{lastReadLabel}</span>
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
        <div className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums">{value}</div>
        <div className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide leading-tight">{label}</div>
      </div>
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
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          {activeBooks.length > 1 ? t('currently_reading') : t('current_reading')}
        </h2>
        {loading ? (
          <div className="card">
            <div className="flex items-center gap-4">
              <SkeletonPulse className="w-12 h-16 rounded-lg flex-shrink-0" />
              <div className="flex-1">
                <SkeletonPulse className="h-4 w-48 mb-2" />
                <SkeletonPulse className="h-3 w-32" />
              </div>
            </div>
          </div>
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
          <Link
            href={`/read/${currentBook.id}`}
            className="block card group hover:border-primary-200 dark:hover:border-primary-800 transition-all duration-200"
          >
            <div className="flex items-center gap-4">
              <div className={`w-14 h-20 rounded-lg bg-gradient-to-br ${currentBook.coverUrl ? 'from-primary-400 to-primary-600' : getBookCoverColors(currentBook.title)[0]} flex items-center justify-center flex-shrink-0 overflow-hidden shadow-sm`}>
                {currentBook.coverUrl ? (
                  <Image src={currentBook.coverUrl} alt={t('cover_of', { title: currentBook.title })} width={56} height={80} className="w-full h-full object-cover rounded-lg" />
                ) : (
                  <span className={`${getBookCoverColors(currentBook.title)[1]} text-sm font-bold`}>{getBookInitials(currentBook.title)}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                  {currentBook.title}
                </h3>
                {isDisplayableAuthor(currentBook.author) && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{currentBook.author}</p>}
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex-1 max-w-[180px]">
                    <div className="w-full bg-surface-1 rounded-full h-2" role="progressbar" aria-label={t('reading_progress')} aria-valuenow={Math.round(currentBook.progress)} aria-valuemin={0} aria-valuemax={100}>
                      <div
                        className="bg-primary-500 rounded-full h-2 transition-all duration-500 ease-out"
                        style={{ width: `${Math.min(100, currentBook.progress)}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums font-medium">{currentBook.progress}%</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">{fmtTime(currentBook.lastRead)}</span>
                <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary-500 text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-sm">
                  {t('continue_button')}
                  <svg aria-hidden="true" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </div>
            </div>
          </Link>
        ) : (
          <div className="card text-center py-10">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('no_active_reading')}</p>
            <Link href="/library" className="btn btn-primary hover:scale-105 active:scale-95 transition-transform duration-200">
              {t('pick_book')}
            </Link>
          </div>
        )}
      </div>

      {/* Stats summary row */}
      {stats && !loading && (
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
      )}

      {/* Card 2: Reading Streak */}
      <ReadingStreakCard streak={streak} loading={loading} />

      {/* Quick Actions */}
      <QuickActions />

      {/* Card 3: Quick Insight */}
      <InsightCard insightKey={insightOfDayKey} />
    </div>
  );
});

// Reading Streak sub-component
const ReadingStreakCard = React.memo(function ReadingStreakCard({ streak, loading }: { streak: number; loading: boolean }) {
  const t = useTranslations('dashboard');

  return (
    <div className="card flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 flex items-center justify-center flex-shrink-0">
        {streak >= 7 ? (
          <svg aria-hidden="true" className="w-6 h-6 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
     </svg>
        ) : streak >= 3 ? (
          <svg aria-hidden="true" className="w-6 h-6 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
     </svg>
        ) : (
          <svg aria-hidden="true" className="w-6 h-6 text-orange-500 dark:text-orange-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
          </svg>
        )}
      </div>
      <div className="flex-1">
        <div className="text-2xl font-bold text-orange-600 dark:text-orange-400 tabular-nums">
          {loading ? <SkeletonPulse className="h-8 w-10 inline-block" /> : streak}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">{t('day_streak')}</div>
      </div>
      {streak === 0 && !loading && (
        <p className="text-xs text-gray-400 dark:text-gray-500">{t('start_streak')}</p>
      )}
      {streak >= 3 && !loading && (
        <div className="text-right">
          <p className="text-xs text-orange-500 dark:text-orange-400 font-medium">{t('keep_going')}</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">{t('next_milestone', { days: streak < 7 ? 7 : streak < 14 ? 14 : streak < 30 ? 30 : 60 })}</p>
        </div>
      )}
    </div>
  );
});

// Quick Actions sub-component
function QuickActions() {
  const t = useTranslations('dashboard');

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {[
        { label: t('quick_upload'), href: '/library', icon: 'upload', color: 'from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20' },
        { label: t('quick_memory_books'), href: '/memory-books', icon: 'book', color: 'from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20' },
        { label: t('quick_flashcards'), href: '/flashcards', icon: 'cards', color: 'from-teal-50 to-emerald-50 dark:from-teal-950/20 dark:to-emerald-950/20' },
        { label: t('quick_stats'), href: '/stats', icon: 'chart', color: 'from-purple-50 to-violet-50 dark:from-purple-950/20 dark:to-violet-950/20' },
        { label: t('quick_book_clubs'), href: '/book-clubs', icon: 'books', color: 'from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20' },
      ].map((action) => (
        <Link
          key={action.label}
          href={action.href}
          className={`card flex flex-col items-center gap-2 py-4 hover:scale-[1.02] active:scale-[0.98] transition-transform duration-200 bg-gradient-to-br ${action.color}`}
        >
          <DashboardActionIcon type={action.icon} />
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{action.label}</span>
        </Link>
      ))}
    </div>
  );
}

// Insight Card sub-component
const InsightCard = React.memo(function InsightCard({ insightKey }: { insightKey: InsightKey | null }) {
  const t = useTranslations('dashboard');

  return (
    <div className="card border-l-4 border-l-primary-400 dark:border-l-primary-600">
      <div className="flex items-start gap-3">
        <InsightIcon type={insightKey?.icon ?? ''} />
        <div>
          <div className="text-[10px] font-bold text-primary-600 dark:text-primary-400 uppercase tracking-widest">
            {insightKey ? t(insightKey.agentKey) : ''}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
            {insightKey ? t(insightKey.key) : ''}
          </p>
        </div>
      </div>
    </div>
  );
});
