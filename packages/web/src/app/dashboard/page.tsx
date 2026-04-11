'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { OnboardingWalkthrough } from '@/components/onboarding/OnboardingWalkthrough';
import { ShareReadingCard } from '@/components/share/ReadingShareCard';
import StreakCalendar from '@/components/dashboard/StreakCalendar';

interface DashboardStats {
  booksRead: number;
  totalPages: number;
  pagesRead: number;
  readingStreak: number;
  totalTime: string;
  conceptsLearned: number;
  connections: number;
}

interface DashboardData {
  stats: DashboardStats;
  recentBooks: RecentBook[];
  weeklyActivity: { day: string; pages: number }[];
  booksByStatus: { unread: number; reading: number; completed: number };
}

interface RecentBook {
  id: string;
  title: string;
  author: string;
  progress: number;
  lastRead: string;
  coverUrl?: string;
}

interface AgentInsight {
  agent: string;
  icon: string;
  message: string;
}

const INSIGHTS_POOL: AgentInsight[] = [
  { agent: 'Companion', icon: '\uD83D\uDCD6', message: 'What surprised you most in your last reading session?' },
  { agent: 'Research', icon: '\uD83D\uDD2C', message: 'Try connecting what you just read to something you already know.' },
  { agent: 'Coach', icon: '\uD83C\uDFAF', message: 'Consistency beats intensity. Even 10 minutes today counts.' },
  { agent: 'Synthesis', icon: '\uD83E\uDDE0', message: 'Revisit your highlights from last week — patterns emerge on review.' },
  { agent: 'Friend', icon: '\uD83E\uDD1D', message: 'Reading is better together. Share a thought with your Reading Friend.' },
];

function SkeletonPulse({ className = '' }: { className?: string }) {
  return <div className={`bg-gray-100 dark:bg-gray-800 rounded animate-pulse ${className}`} />;
}

function formatLastRead(lastRead: string): string {
  try {
    const date = new Date(lastRead);
    if (isNaN(date.getTime())) return lastRead;
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return lastRead;
  }
}

export default function DashboardPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const insightOfDay = INSIGHTS_POOL[new Date().getDate() % INSIGHTS_POOL.length];

  useEffect(() => {
    let cancelled = false;
    api.get<DashboardData>('/api/stats/dashboard')
      .then((res) => {
        if (!cancelled) setDashboardData((res.data as unknown as DashboardData) ?? null);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load dashboard data. Please try again later.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const stats = dashboardData?.stats ?? null;
  const recentBooks = dashboardData?.recentBooks ?? [];
  const currentBook = recentBooks.length > 0 ? recentBooks[0] : null;
  const activeBooks = recentBooks.filter((b) => b.progress > 0 && b.progress < 100).slice(0, 3);
  const streak = stats?.readingStreak ?? 0;
  const hasData = !loading && stats !== null && (stats.booksRead > 0 || stats.pagesRead > 0);

  const handleSeedSample = async () => {
    try {
      setSeeding(true);
      const res = await api.post<{ book: { id: string } }>('/api/books/seed-sample');
      if (res.success) {
        window.location.href = '/library';
      }
    } catch {
      // Silently fail — user can still upload manually
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-6 py-6 sm:py-10">
      {/* Welcome */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
          {!hasData && !loading ? 'Welcome to read-pal' : 'Welcome back'}
        </h1>
        <p className="text-gray-500 mt-2 text-sm sm:text-base">
          {loading ? (
            <SkeletonPulse className="w-48 h-5 inline-block" />
          ) : hasData && streak > 0 ? (
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse animate-streak-glow" />
              You&apos;re on a <strong className="text-amber-600 dark:text-amber-400">{streak}-day</strong> reading streak
            </span>
          ) : (
            'What will you read today?'
          )}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-8 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm animate-slide-up">
          {error}
        </div>
      )}

      {/* ── NO ACTIVE READING: Warm welcome state ── */}
      {!hasData && !loading ? (
        <div className="animate-fade-in">
          <div className="card text-center py-12 sm:py-16 mb-6">
            <div className="text-6xl mb-4 opacity-60">{'\uD83D\uDCDA'}</div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              Your next adventure awaits
            </h2>
            <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
              Add a book to your library and start reading with your AI companion.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link
                href="/library"
                className="btn btn-primary hover:scale-105 active:scale-95 transition-transform duration-200"
              >
                Start reading
              </Link>
              <button
                onClick={handleSeedSample}
                disabled={seeding}
                className="btn hover:scale-105 active:scale-95 transition-transform duration-200 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {seeding ? 'Loading...' : 'Try a sample book'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ── ACTIVE USER: 3 primary cards ── */
        <div className="space-y-5 animate-fade-in">
          {/* Card 1: Current Reading — supports multiple active books */}
          <div>
            <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">
              {activeBooks.length > 1 ? 'Currently Reading' : 'Current Reading'}
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
                          <img src={book.coverUrl} alt="" className="w-full h-full object-cover rounded-lg" />
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
                            <span className="text-[10px] font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-1.5 py-0.5 rounded-full whitespace-nowrap">Latest</span>
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
                          Continue
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
                      <img src={currentBook.coverUrl} alt="" className="w-full h-full object-cover rounded-lg" />
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
                <p className="text-sm text-gray-500 mb-4">No active reading right now.</p>
                <Link href="/library" className="btn btn-primary hover:scale-105 active:scale-95 transition-transform duration-200">
                  Pick a book
                </Link>
              </div>
            )}
          </div>

          {/* Card 2: Reading Streak */}
          <div className="card flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-orange-500 dark:text-orange-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400 tabular-nums">
                {loading ? <SkeletonPulse className="h-8 w-10 inline-block" /> : streak}
              </div>
              <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">Day Streak</div>
            </div>
            {streak === 0 && !loading && (
              <p className="text-xs text-gray-400">Read today to start your streak</p>
            )}
          </div>

          {/* Card 3: Quick Insight */}
          <div className="card border-l-4 border-l-primary-400 dark:border-l-primary-600">
            <div className="flex items-start gap-3">
              <span className="text-2xl leading-none mt-0.5">{insightOfDay.icon}</span>
              <div>
                <div className="text-[10px] font-bold text-primary-600 dark:text-primary-400 uppercase tracking-widest">
                  {insightOfDay.agent}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
                  {insightOfDay.message}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Streak Calendar ── */}
      {hasData && !loading && (
        <div className="mt-5 animate-fade-in">
          <StreakCalendar />
        </div>
      )}

      {/* ── Explore More: subtle links to advanced features ── */}
      {hasData && !loading && (
        <div className="mt-10 pt-6 border-t border-gray-100 dark:border-gray-800 animate-fade-in">
          <p className="text-xs text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wide mb-3">Explore more</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link
              href="/library"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
              </svg>
              Library
            </Link>
            <Link
              href="/knowledge"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Knowledge Graph
            </Link>
            <Link
              href="/friend"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Reading Friend
            </Link>
            <Link
              href="/memory-books"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              Memory Books
            </Link>
            <Link
              href="/stats"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
              Reading Stats
            </Link>
            <Link
              href="/settings"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </Link>
          </div>

          {/* Share reading progress */}
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
            <ShareReadingCard />
          </div>
        </div>
      )}

      {/* Onboarding walkthrough for new users */}
      <OnboardingWalkthrough />
    </div>
  );
}
