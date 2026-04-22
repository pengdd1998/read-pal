'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { formatRelativeTime } from '@/lib/date';
import { SkeletonPulse } from './SkeletonPulse';
import type { RecentBook, DashboardStats } from './types';

const formatLastRead = formatRelativeTime;

export interface InsightKey {
  agent: string;
  icon: string;
  key: string;
}

interface CurrentReadingSectionProps {
  recentBooks: RecentBook[];
  stats: DashboardStats | null;
  loading: boolean;
  insightOfDayKey: InsightKey | null;
}

export function CurrentReadingSection({ recentBooks, stats, loading, insightOfDayKey }: CurrentReadingSectionProps) {
  const t = useTranslations('dashboard');

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
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-wide mb-3">
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
              <Link
                key={book.id}
                href={`/read/${book.id}`}
                className={`block card group hover:border-primary-200 dark:hover:border-primary-800 transition-all duration-200 ${i === 0 && activeBooks.length > 1 ? 'ring-1 ring-primary-200 dark:ring-primary-800' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-20 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-sm">
                    {book.coverUrl ? (
                      <img src={book.coverUrl} alt={`Cover of ${book.title}`} className="w-full h-full object-cover rounded-lg" />
                    ) : (
                      <span className="text-white text-xl">{'\uD83D\uDCD6'}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                        {book.title}
                      </h3>
                      {i === 0 && activeBooks.length > 1 && (
                        <span className="text-[10px] font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-1.5 py-0.5 rounded-full whitespace-nowrap">{t('latest_badge')}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{book.author}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex-1 max-w-[180px]">
                        <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                          <div
                            className="bg-primary-500 rounded-full h-2 transition-all duration-500 ease-out"
                            style={{ width: `${Math.min(100, book.progress)}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 tabular-nums font-medium">{book.progress}%</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className="text-[10px] text-gray-400 whitespace-nowrap">{formatLastRead(book.lastRead)}</span>
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary-500 text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-sm">
                      {t('continue_button')}
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : currentBook ? (
          <Link
            href={`/read/${currentBook.id}`}
            className="block card group hover:border-primary-200 dark:hover:border-primary-800 transition-all duration-200"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-20 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-sm">
                {currentBook.coverUrl ? (
                  <img src={currentBook.coverUrl} alt={`Cover of ${currentBook.title}`} className="w-full h-full object-cover rounded-lg" />
                ) : (
                  <span className="text-white text-xl">{'\uD83D\uDCD6'}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                  {currentBook.title}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">{currentBook.author}</p>
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex-1 max-w-[180px]">
                    <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                      <div
                        className="bg-primary-500 rounded-full h-2 transition-all duration-500 ease-out"
                        style={{ width: `${Math.min(100, currentBook.progress)}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 tabular-nums font-medium">{currentBook.progress}%</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <span className="text-[10px] text-gray-400 whitespace-nowrap">{formatLastRead(currentBook.lastRead)}</span>
                <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary-500 text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-sm">
                  Continue
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </div>
            </div>
          </Link>
        ) : (
          <div className="card text-center py-10">
            <p className="text-sm text-gray-500 mb-4">{t('no_active_reading')}</p>
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
            { label: t('stat_books_read'), value: stats.booksRead, icon: '\u{1F4DA}' },
            { label: t('stat_pages_read'), value: stats.pagesRead, icon: '\u{1F4D0}' },
            { label: t('stat_total_time'), value: stats.totalTime, icon: '\u{23F1}\u{FE0F}' },
            { label: t('stat_concepts'), value: stats.conceptsLearned, icon: '\u{1F9E0}' },
            { label: t('stat_connections'), value: stats.connections, icon: '\u{1F517}' },
          ].map((s) => (
            <div key={s.label} className="card py-3 px-3 flex items-center gap-2">
              <span className="text-lg">{s.icon}</span>
              <div>
                <div className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{s.value}</div>
                <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wide leading-tight">{s.label}</div>
              </div>
            </div>
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
}

// Reading Streak sub-component
function ReadingStreakCard({ streak, loading }: { streak: number; loading: boolean }) {
  const t = useTranslations('dashboard');

  return (
    <div className="card flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 flex items-center justify-center flex-shrink-0">
        {streak >= 7 ? (
          <span className="text-2xl">{'\uD83D\uDD25'}</span>
        ) : streak >= 3 ? (
          <span className="text-2xl">{'\u2B50'}</span>
        ) : (
          <svg className="w-6 h-6 text-orange-500 dark:text-orange-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
          </svg>
        )}
      </div>
      <div className="flex-1">
        <div className="text-2xl font-bold text-orange-600 dark:text-orange-400 tabular-nums">
          {loading ? <SkeletonPulse className="h-8 w-10 inline-block" /> : streak}
        </div>
        <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">{t('day_streak')}</div>
      </div>
      {streak === 0 && !loading && (
        <p className="text-xs text-gray-400">{t('start_streak')}</p>
      )}
      {streak >= 3 && !loading && (
        <div className="text-right">
          <p className="text-xs text-orange-500 dark:text-orange-400 font-medium">{t('keep_going')}</p>
          <p className="text-[10px] text-gray-400">{t('next_milestone', { days: streak < 7 ? 7 : streak < 14 ? 14 : streak < 30 ? 30 : 60 })}</p>
        </div>
      )}
    </div>
  );
}

// Quick Actions sub-component
function QuickActions() {
  const t = useTranslations('dashboard');

  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
      {[
        { label: t('quick_upload'), href: '/library', icon: '\u{1F4C2}', color: 'from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20' },
        { label: t('quick_memory_books'), href: '/memory-books', icon: '\u{1F4D5}', color: 'from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20' },
        { label: t('quick_flashcards'), href: '/flashcards', icon: '\u{1F4C7}', color: 'from-teal-50 to-emerald-50 dark:from-teal-950/20 dark:to-emerald-950/20' },
        { label: t('quick_stats'), href: '/stats', icon: '\u{1F4CA}', color: 'from-purple-50 to-violet-50 dark:from-purple-950/20 dark:to-violet-950/20' },
        { label: t('quick_book_clubs'), href: '/book-clubs', icon: '\u{1F4DA}', color: 'from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20' },
      ].map((action) => (
        <Link
          key={action.label}
          href={action.href}
          className={`card flex flex-col items-center gap-2 py-4 hover:scale-[1.02] active:scale-[0.98] transition-transform duration-200 bg-gradient-to-br ${action.color}`}
        >
          <span className="text-xl">{action.icon}</span>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{action.label}</span>
        </Link>
      ))}
    </div>
  );
}

// Insight Card sub-component
function InsightCard({ insightKey }: { insightKey: InsightKey | null }) {
  const t = useTranslations('dashboard');

  return (
    <div className="card border-l-4 border-l-primary-400 dark:border-l-primary-600">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none mt-0.5">{insightKey?.icon}</span>
        <div>
          <div className="text-[10px] font-bold text-primary-600 dark:text-primary-400 uppercase tracking-widest">
            {insightKey?.agent}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
            {insightKey ? t(insightKey.key) : ''}
          </p>
        </div>
      </div>
    </div>
  );
}
