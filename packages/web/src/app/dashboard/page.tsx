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

const DEFAULT_INSIGHTS: AgentInsight[] = [
  { agent: 'Companion', icon: '\uD83D\uDCD6', message: 'Start reading to unlock personalized insights from your AI companions.', color: 'text-teal-500' },
  { agent: 'Research', icon: '\uD83D\uDD2C', message: 'As you read, I\'ll find connections across your library.', color: 'text-violet-500' },
  { agent: 'Coach', icon: '\uD83C\uDFAF', message: 'Begin your reading journey and I\'ll help track your progress.', color: 'text-emerald-500' },
  { agent: 'Synthesis', icon: '\uD83E\uDDE0', message: 'I\'ll discover patterns and build your knowledge graph as you read.', color: 'text-amber-500' },
];

function SkeletonPulse({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`bg-gray-100 dark:bg-gray-800 rounded animate-pulse ${className}`} />;
}

function AnimatedCounter({ value, label, accent = 'text-primary-600', delay }: {
  value: number | string;
  label: string;
  accent?: string;
  delay: number;
}) {
  const [displayed, setDisplayed] = useState(0);
  const numValue = typeof value === 'number' ? value : 0;

  useEffect(() => {
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
  }, [numValue]);

  if (typeof value === 'string') {
    return (
      <div className={`card text-center animate-slide-up stagger-${delay}`}>
        <div className={`text-2xl font-bold ${accent} tabular-nums`}>{value}</div>
        <div className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">{label}</div>
      </div>
    );
  }

  return (
    <div className={`card text-center animate-slide-up stagger-${delay}`}>
      <div className={`text-2xl font-bold ${accent} tabular-nums animate-count-up`}>
        {typeof value === 'number' ? displayed.toLocaleString() : value}
      </div>
      <div className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">{label}</div>
    </div>
  );
}

export default function DashboardPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentInsights] = useState<AgentInsight[]>(DEFAULT_INSIGHTS);

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
  const isEmpty = !loading && stats !== null && stats.booksRead === 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Welcome */}
      <div className="mb-10 animate-fade-in">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
          Welcome back, Reader
        </h1>
        <p className="text-gray-500 mt-2 text-base">
          {loading ? (
            <SkeletonPulse className="w-64 h-5 inline-block" />
          ) : stats && stats.readingStreak > 0 ? (
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse animate-streak-glow" />
              You&apos;re on a <strong className="text-amber-600 dark:text-amber-400">{stats.readingStreak}-day</strong> reading streak 🔥 Keep it up!
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

      {/* Stats */}
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
                    <SkeletonPulse className="w-10 h-14 rounded-lg flex-shrink-0" />
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
              <h3 className="font-bold text-gray-900 dark:text-white text-xl mb-2">No books yet</h3>
              <p className="text-sm text-gray-500 mb-1">Your next adventure awaits</p>
              <p className="text-xs text-gray-400 mb-6">Add a book to your library to get started.</p>
              <Link href="/library" className="btn btn-primary hover:scale-105 active:scale-95 transition-transform duration-200">
                Browse Library
              </Link>
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
                    {/* Mini cover */}
                    <div className="w-10 h-14 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center flex-shrink-0 overflow-hidden">
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
                    </div>

                    <div className="flex items-center gap-4 flex-shrink-0">
                      <span className="text-xs text-gray-400 hidden sm:inline">{book.lastRead}</span>
                      <div className="w-20 hidden sm:block">
                        <div className="flex justify-between text-[10px] text-gray-400 mb-1 tabular-nums">
                          <span>{book.progress}%</span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
                          <div
                            className="bg-primary-500 rounded-full h-1.5 transition-all duration-500 ease-out"
                            style={{ width: `${Math.min(100, book.progress)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Agent Insights */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-5">Agent Insights</h2>
          <div className="space-y-3">
            {agentInsights.map((insight, i) => (
              <div key={i} className={`card stagger-${i + 1} animate-slide-up transition-transform duration-200 hover:scale-[1.02] hover:shadow-soft`}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none mt-0.5">{insight.icon}</span>
                  <div>
                    <div className="text-[10px] font-bold text-primary-600 dark:text-primary-400 uppercase tracking-widest">
                      {insight.agent} Agent
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
