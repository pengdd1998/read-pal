'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

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
  color: string;
}

const GETTING_STARTED_TIPS: AgentInsight[] = [
  { agent: 'Companion', icon: '\uD83D\uDCD6', message: 'Start reading to unlock personalized insights from your AI companions.', color: 'text-teal-500' },
  { agent: 'Research', icon: '\uD83D\uDD2C', message: 'As you read, I\'ll find connections across your library.', color: 'text-violet-500' },
  { agent: 'Coach', icon: '\uD83C\uDFAF', message: 'Begin your reading journey and I\'ll help track your progress.', color: 'text-emerald-500' },
  { agent: 'Synthesis', icon: '\uD83E\uDDE0', message: 'I\'ll discover patterns and build your knowledge graph as you read.', color: 'text-amber-500' },
];

const TIP_BORDER_COLORS: Record<string, string> = {
  'Companion': 'border-l-teal-500 dark:border-l-teal-400',
  'Research': 'border-l-violet-500 dark:border-l-violet-400',
  'Coach': 'border-l-emerald-500 dark:border-l-emerald-400',
  'Synthesis': 'border-l-amber-500 dark:border-l-amber-400',
};

function SkeletonPulse({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`bg-gray-100 dark:bg-gray-800 rounded animate-pulse ${className}`} />;
}

interface StatConfig {
  icon: string;
  gradient: string;
  iconBg: string;
}

const STAT_STYLES: Record<string, StatConfig> = {
  'Library': { icon: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z', gradient: 'from-teal-50/80 to-teal-100/40 dark:from-teal-950/30 dark:to-teal-900/10', iconBg: 'bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400' },
  'Pages': { icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', gradient: 'from-amber-50/80 to-amber-100/40 dark:from-amber-950/30 dark:to-amber-900/10', iconBg: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400' },
  'Day Streak': { icon: 'M13 10V3L4 14h7v7l9-11h-7z', gradient: 'from-orange-50/80 to-orange-100/40 dark:from-orange-950/30 dark:to-orange-900/10', iconBg: 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400' },
  'In Progress': { icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', gradient: 'from-blue-50/80 to-blue-100/40 dark:from-blue-950/30 dark:to-blue-900/10', iconBg: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' },
  'Concepts': { icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z', gradient: 'from-violet-50/80 to-violet-100/40 dark:from-violet-950/30 dark:to-violet-900/10', iconBg: 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400' },
  'Completed': { icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', gradient: 'from-emerald-50/80 to-emerald-100/40 dark:from-emerald-950/30 dark:to-emerald-900/10', iconBg: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400' },
};

function AnimatedCounter({ value, label, accent = 'text-primary-600', delay }: {
  value: number | string;
  label: string;
  accent?: string;
  delay: number;
}) {
  const [displayed, setDisplayed] = useState(0);
  const numValue = typeof value === 'number' ? value : 0;
  const style = STAT_STYLES[label] ?? STAT_STYLES['Library'];

  useEffect(() => {
    if (typeof value === 'string') return;
    const duration = 600;
    const steps = 20;
    const increment = numValue / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= numValue) {
        setDisplayed(numValue);
        clearInterval(timer);
      } else {
        setDisplayed(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [numValue, value]);

  if (typeof value === 'string') {
    return (
      <div className={`bg-gradient-to-br ${style.gradient} rounded-2xl border border-gray-100 dark:border-gray-800 p-4 animate-slide-up stagger-${delay}`}>
        <div className={`w-8 h-8 rounded-lg ${style.iconBg} flex items-center justify-center mb-2`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={style.icon} /></svg>
        </div>
        <div className={`text-2xl font-bold ${accent} tabular-nums`}>{value}</div>
        <div className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">{label}</div>
      </div>
    );
  }

  return (
    <div className={`bg-gradient-to-br ${style.gradient} rounded-2xl border border-gray-100 dark:border-gray-800 p-4 animate-slide-up stagger-${delay}`}>
      <div className={`w-8 h-8 rounded-lg ${style.iconBg} flex items-center justify-center mb-2`}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={style.icon} /></svg>
      </div>
      <div className={`text-2xl font-bold ${accent} tabular-nums animate-count-up`}>
        {displayed.toLocaleString()}
      </div>
      <div className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">{label}</div>
    </div>
  );
}

/** Formats a date/string into a human-readable "last read X ago" label */
function formatLastRead(lastRead: string): string {
  try {
    const date = new Date(lastRead);
    if (isNaN(date.getTime())) return lastRead;
    const now = Date.now();
    const diffMs = now - date.getTime();
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
  const [agentInsights] = useState<AgentInsight[]>(GETTING_STARTED_TIPS);
  const [seeding, setSeeding] = useState(false);

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
  const weeklyActivity = dashboardData?.weeklyActivity ?? [];
  const booksByStatus = dashboardData?.booksByStatus;
  const isEmpty = !loading && stats !== null && stats.booksRead === 0 && stats.pagesRead === 0;

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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Welcome */}
      <div className="mb-10 animate-fade-in">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
          {isEmpty ? 'Welcome to read-pal' : 'Welcome back, Reader'}
        </h1>
        <p className="text-gray-500 mt-2 text-base">
          {loading ? (
            <SkeletonPulse className="w-64 h-5 inline-block" />
          ) : isEmpty ? (
            'Your AI-powered reading companion is ready. Let\'s get started.'
          ) : stats && stats.readingStreak > 0 ? (
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse animate-streak-glow" />
              You&apos;re on a <strong className="text-amber-600 dark:text-amber-400">{stats.readingStreak}-day</strong> reading streak Keep it up!
            </span>
          ) : (
            'Start your reading journey today.'
          )}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-8 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm animate-slide-up">
          {error}
        </div>
      )}

      {/* Stats — hidden for new users, replaced by Getting Started section */}
      {isEmpty ? (
        /* Getting Started cards for new users */
        <div className="mb-12 animate-fade-in">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Getting Started</h2>
          <div className="grid sm:grid-cols-3 gap-5">
            {/* Card 1: Upload a book */}
            <Link
              href="/library"
              className="group card hover:border-primary-200 dark:hover:border-primary-800 hover:shadow-lg transition-all duration-200"
            >
              <div className="flex flex-col items-center text-center py-6">
                <div className="w-14 h-14 rounded-2xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200">
                  <span className="text-3xl">{'\uD83D\uDCD6'}</span>
                </div>
                <h3 className="font-bold text-gray-900 dark:text-white mb-1">Upload your first book</h3>
                <p className="text-sm text-gray-500">Add an EPUB or PDF to start reading with your AI companion.</p>
              </div>
            </Link>

            {/* Card 2: Try the AI companion */}
            <Link
              href="/library"
              className="group card hover:border-teal-200 dark:hover:border-teal-800 hover:shadow-lg transition-all duration-200"
            >
              <div className="flex flex-col items-center text-center py-6">
                <div className="w-14 h-14 rounded-2xl bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200">
                  <span className="text-3xl">{'\uD83E\uDD16'}</span>
                </div>
                <h3 className="font-bold text-gray-900 dark:text-white mb-1">Try the AI companion</h3>
                <p className="text-sm text-gray-500">Chat with intelligent agents that help you understand and remember what you read.</p>
              </div>
            </Link>

            {/* Card 3: Customize your reading */}
            <Link
              href="/settings"
              className="group card hover:border-violet-200 dark:hover:border-violet-800 hover:shadow-lg transition-all duration-200"
            >
              <div className="flex flex-col items-center text-center py-6">
                <div className="w-14 h-14 rounded-2xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200">
                  <span className="text-3xl">{'\u2728'}</span>
                </div>
                <h3 className="font-bold text-gray-900 dark:text-white mb-1">Customize your reading</h3>
                <p className="text-sm text-gray-500">Choose themes, fonts, and reading friend personalities that match your style.</p>
              </div>
            </Link>
          </div>

          {/* Quick-start: try a sample book */}
          <div className="mt-6 card bg-gradient-to-r from-primary-50/60 to-teal-50/60 dark:from-primary-950/20 dark:to-teal-950/20 border-primary-100 dark:border-primary-900">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{'\uD83C\uDF31'}</span>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Want to explore right away?</h3>
                  <p className="text-sm text-gray-500">Load a sample book and try all the features instantly.</p>
                </div>
              </div>
              <button
                onClick={handleSeedSample}
                disabled={seeding}
                className="btn btn-primary whitespace-nowrap hover:scale-105 active:scale-95 transition-transform duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {seeding ? 'Loading sample...' : 'Try a sample book'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-12">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card text-center">
                <SkeletonPulse className="h-8 w-16 mx-auto" />
                <SkeletonPulse className="h-3 w-12 mx-auto mt-2" />
              </div>
            ))
          ) : (
            <>
              <AnimatedCounter value={stats?.booksRead ?? 0} label="Library" delay={1} />
              <AnimatedCounter value={(stats?.pagesRead ?? 0).toLocaleString()} label="Pages" delay={2} />
              <AnimatedCounter value={stats?.readingStreak ?? 0} label="Day Streak" accent="text-amber-600" delay={3} />
              <AnimatedCounter value={booksByStatus?.reading ?? 0} label="In Progress" delay={4} />
              <AnimatedCounter value={stats?.conceptsLearned ?? 0} label="Concepts" accent="text-violet-600" delay={5} />
              <AnimatedCounter value={booksByStatus?.completed ?? 0} label="Completed" accent="text-emerald-600" delay={6} />
            </>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-10">
        {/* Continue Reading */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Continue Reading</h2>
            {recentBooks.length > 0 && (
              <Link href="/library" className="text-sm text-primary-600 dark:text-primary-400 font-medium hover:underline">
                View all
              </Link>
            )}
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="card">
                  <div className="flex items-center gap-4">
                    <SkeletonPulse className="w-12 h-16 rounded-lg flex-shrink-0" />
                    <div className="flex-1">
                      <SkeletonPulse className="h-4 w-48 mb-2" />
                      <SkeletonPulse className="h-3 w-32" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : isEmpty || recentBooks.length === 0 ? (
            <div className="card text-center py-16 animate-scale-in">
              <div className="text-6xl mb-4 opacity-50">{'\uD83D\uDCDA'}</div>
              <h3 className="font-bold text-gray-900 dark:text-white text-xl mb-2">
                {isEmpty ? 'No books yet' : 'No recent reading'}
              </h3>
              <p className="text-sm text-gray-500 mb-1">
                {isEmpty ? 'Your next adventure awaits' : 'Pick up where you left off'}
              </p>
              <p className="text-xs text-gray-400 mb-6">
                {isEmpty ? 'Add a book to your library to get started.' : 'Open a book from your library to continue reading.'}
              </p>
              <div className="flex items-center justify-center gap-3">
                <Link href="/library" className="btn btn-primary hover:scale-105 active:scale-95 transition-transform duration-200">
                  {isEmpty ? 'Browse Library' : 'Go to Library'}
                </Link>
                {isEmpty && (
                  <button
                    onClick={handleSeedSample}
                    disabled={seeding}
                    className="btn hover:scale-105 active:scale-95 transition-transform duration-200 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {seeding ? 'Loading...' : 'Try a sample book'}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {recentBooks.map((book, i) => (
                <Link
                  key={book.id}
                  href={`/read/${book.id}`}
                  className={`block card group hover:border-primary-200 dark:hover:border-primary-800 transition-all duration-200 ease-out stagger-${i + 1} animate-slide-up`}
                >
                  <div className="flex items-center gap-4">
                    {/* Book cover thumbnail */}
                    <div className="w-12 h-16 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-sm">
                      {book.coverUrl ? (
                        <img src={book.coverUrl} alt="" className="w-full h-full object-cover rounded-lg" />
                      ) : (
                        <span className="text-white text-lg">{'\uD83D\uDCD6'}</span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate text-sm group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                        {book.title}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">{book.author}</p>
                      {/* Inline progress bar */}
                      <div className="flex items-center gap-3 mt-1.5">
                        <div className="flex-1 max-w-[120px]">
                          <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
                            <div
                              className="bg-primary-500 rounded-full h-1.5 transition-all duration-500 ease-out"
                              style={{ width: `${Math.min(100, book.progress)}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-[10px] text-gray-400 tabular-nums">{book.progress}%</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      {/* "Last read X ago" timestamp */}
                      <span className="text-[10px] text-gray-400 whitespace-nowrap">{formatLastRead(book.lastRead)}</span>
                      {/* Prominent Continue button on hover */}
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary-500 text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-sm">
                        Continue
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Agent Insights */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-5">Getting Started Tips</h2>
          <div className="space-y-3">
            {agentInsights.map((insight, i) => (
              <div key={i} className={`card stagger-${i + 1} animate-slide-up transition-transform duration-200 hover:scale-[1.02] hover:shadow-soft border-l-4 ${TIP_BORDER_COLORS[insight.agent] ?? 'border-l-gray-400'}`}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none mt-0.5">{insight.icon}</span>
                  <div>
                    <div className="text-[10px] font-bold text-primary-600 dark:text-primary-400 uppercase tracking-widest">
                      {insight.agent}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
                      {insight.message}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Knowledge Graph Card */}
          <Link
            href="/knowledge"
            className="block card mt-4 bg-gradient-to-br from-violet-50/50 to-primary-50/50 dark:from-violet-950/20 dark:to-primary-950/20 hover:border-violet-200 dark:hover:border-violet-800 transition-all duration-200 ease-out group animate-slide-up stagger-5"
          >
            <div className="text-center">
              <div className="text-4xl mb-2 group-hover:scale-110 transition-transform duration-300 ease-out">{'\uD83D\uDD78'}</div>
              <h3 className="font-bold text-gray-900 dark:text-white">Knowledge Graph</h3>
              <p className="text-sm text-gray-500 mt-1 tabular-nums">
                {loading ? 'Loading...' : `${stats?.conceptsLearned ?? 0} concepts discovered`}
              </p>
            </div>
          </Link>
        </div>
      </div>

      {/* Reading Activity */}
      <div className="mt-12 card animate-slide-up">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-6">Reading Activity</h2>
        {loading ? (
          <div className="h-48 flex items-end justify-around gap-3 px-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <SkeletonPulse key={i} className="w-full rounded-t" style={{ height: `${30 + (i * 8.5) % 60}%` }} />
            ))}
          </div>
        ) : weeklyActivity.length === 0 ? (
          <div className="h-48 flex items-center justify-center">
            <p className="text-sm text-gray-400">No activity this week. Start reading to see your progress!</p>
          </div>
        ) : (
          <div className="h-48 flex items-end gap-2 px-4">
            {(() => {
              const maxPages = Math.max(...weeklyActivity.map((e) => e.pages), 1);
              return weeklyActivity.map((entry, i) => {
              const heightPct = Math.max((entry.pages / maxPages) * 100, 6);
              return (
                <div key={entry.day} className={`flex flex-col items-center gap-2 flex-1 stagger-${i + 1} animate-slide-up`}>
                  <span className="text-[10px] text-gray-400 tabular-nums font-medium">{entry.pages}</span>
                  <div
                    className="w-full bg-gradient-to-t from-primary-400/80 to-teal-600/60 dark:from-primary-600/60 dark:to-teal-400/60 rounded-t-md transition-all duration-500 ease-out hover:from-primary-500 dark:hover:from-primary-400 cursor-default"
                    style={{ height: `${heightPct}%` }}
                    title={`${entry.pages} pages`}
                  />
                  <span className="text-[10px] text-gray-400 font-medium">{entry.day}</span>
                </div>
              );
            });
            })()}
          </div>
        )}
        <p className="mt-4 text-center text-xs text-gray-400">Pages read per day this week</p>
      </div>
    </div>
  );
}
