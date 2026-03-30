'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

/** Shape of the stats object inside the API response */
interface DashboardStats {
  booksRead: number;
  totalPages: number;
  pagesRead: number;
  readingStreak: number;
  totalTime: string;
  conceptsLearned: number;
  connections: number;
}

/** Shape of the full API response data for /stats/dashboard */
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

const DEFAULT_INSIGHTS: AgentInsight[] = [
  { agent: 'Companion', icon: '\u{1F4D6}', message: 'Start reading to unlock personalized insights from your AI companions.' },
  { agent: 'Research', icon: '\u{1F52C}', message: 'As you read, I\'ll find connections across your library.' },
  { agent: 'Coach', icon: '\u{1F3AF}', message: 'Begin your reading journey and I\'ll help track your progress.' },
  { agent: 'Synthesis', icon: '\u{1F9E0}', message: 'I\'ll discover patterns and build your knowledge graph as you read.' },
];

function SkeletonCard() {
  return (
    <div className="card animate-pulse">
      <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-12 mx-auto" />
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16 mx-auto mt-2" />
    </div>
  );
}

function SkeletonBar() {
  return (
    <div className="flex flex-col items-center gap-2 flex-1">
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-t animate-pulse" style={{ height: '60%' }} />
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-6 animate-pulse" />
    </div>
  );
}

export default function DashboardPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentInsights] = useState<AgentInsight[]>(DEFAULT_INSIGHTS);

  useEffect(() => {
    api.get<DashboardData>('/api/stats/dashboard')
      .then((res) => {
        setDashboardData(res.data ?? null);
      })
      .catch(() => {
        setError('Failed to load dashboard data. Please try again later.');
      })
      .finally(() => setLoading(false));
  }, []);

  const stats = dashboardData?.stats ?? null;
  const recentBooks = dashboardData?.recentBooks ?? [];
  const weeklyActivity = dashboardData?.weeklyActivity ?? [];
  const booksByStatus = dashboardData?.booksByStatus;
  const isEmpty = !loading && stats && stats.booksRead === 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Welcome back, Reader
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          {loading ? (
            <span className="inline-block w-48 h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          ) : stats && stats.readingStreak > 0 ? (
            <>You&apos;re on a {stats.readingStreak}-day reading streak. Keep it up!</>
          ) : (
            <>Start your reading journey today.</>
          )}
        </p>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <div className="card text-center">
              <div className="text-2xl font-bold text-primary-600">{stats?.totalPages ?? 0}</div>
              <div className="text-sm text-gray-500">Books Read</div>
            </div>
            <div className="card text-center">
              <div className="text-2xl font-bold text-primary-600">{(stats?.pagesRead ?? 0).toLocaleString()}</div>
              <div className="text-sm text-gray-500">Pages</div>
            </div>
            <div className="card text-center">
              <div className="text-2xl font-bold text-primary-600">{stats?.readingStreak ?? 0}</div>
              <div className="text-sm text-gray-500">Day Streak</div>
            </div>
            <div className="card text-center">
              <div className="text-2xl font-bold text-primary-600">{booksByStatus?.reading ?? 0}</div>
              <div className="text-sm text-gray-500">In Progress</div>
            </div>
            <div className="card text-center">
              <div className="text-2xl font-bold text-purple-600">{stats?.conceptsLearned ?? 0}</div>
              <div className="text-sm text-gray-500">Concepts</div>
            </div>
            <div className="card text-center">
              <div className="text-2xl font-bold text-purple-600">{booksByStatus?.completed ?? 0}</div>
              <div className="text-sm text-gray-500">Completed</div>
            </div>
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Continue Reading */}
        <div className="lg:col-span-2">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Continue Reading</h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="card animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48" />
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-32 mt-2" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : isEmpty || recentBooks.length === 0 ? (
            <div className="card text-center py-12">
              <div className="text-4xl mb-3">📚</div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">No books yet</h3>
              <p className="text-sm text-gray-500 mb-4">Add a book to your library to get started.</p>
              <Link href="/library" className="btn btn-primary">
                Browse Library
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentBooks.map((book) => (
                <Link
                  key={book.id}
                  href={`/read/${book.id}`}
                  className="block card hover:border-primary-300 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 dark:text-white truncate">
                        {book.title}
                      </h3>
                      <p className="text-sm text-gray-500">{book.author}</p>
                    </div>
                    <div className="ml-4 flex items-center gap-4">
                      <span className="text-sm text-gray-400">{book.lastRead}</span>
                      <div className="w-24">
                        <div className="flex justify-between text-xs mb-1">
                          <span>{book.progress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div
                            className="bg-primary-600 rounded-full h-2 transition-all"
                            style={{ width: `${book.progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div className="mt-6">
            <Link href="/library" className="btn btn-secondary">
              View Full Library
            </Link>
          </div>
        </div>

        {/* Agent Insights */}
        <div>
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Agent Insights</h2>
          <div className="space-y-3">
            {agentInsights.map((insight, i) => (
              <div key={i} className="card">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{insight.icon}</span>
                  <div>
                    <div className="text-xs font-semibold text-primary-600 uppercase tracking-wide">
                      {insight.agent} Agent
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                      {insight.message}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Knowledge Graph Preview */}
          <div className="mt-6">
            <Link href="/knowledge" className="block card bg-gradient-to-br from-purple-50 to-primary-50 dark:from-purple-900/20 dark:to-primary-900/20 hover:border-purple-300 transition-colors">
              <div className="text-center">
                <div className="text-3xl mb-2">🕸️</div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Knowledge Graph</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {loading ? 'Loading...' : `${stats?.conceptsLearned ?? 0} concepts discovered`}
                </p>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Reading Activity Chart */}
      <div className="mt-8 card">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Reading Activity</h2>
        {loading ? (
          <div className="h-48 flex items-end justify-around gap-2 px-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <SkeletonBar key={i} />
            ))}
          </div>
        ) : weeklyActivity.length === 0 ? (
          <div className="h-48 flex items-center justify-center">
            <p className="text-sm text-gray-500">No activity this week. Start reading to see your progress!</p>
          </div>
        ) : (
          <div className="h-48 flex items-end justify-around gap-2 px-4">
            {weeklyActivity.map((entry) => {
              const maxPages = Math.max(...weeklyActivity.map((e) => e.pages), 1);
              const heightPct = Math.max((entry.pages / maxPages) * 100, 4);
              return (
                <div key={entry.day} className="flex flex-col items-center gap-2 flex-1">
                  <span className="text-xs text-gray-500">{entry.pages}</span>
                  <div
                    className="w-full bg-primary-500 rounded-t transition-all hover:bg-primary-600"
                    style={{ height: `${heightPct}%` }}
                  />
                  <span className="text-xs text-gray-500">{entry.day}</span>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-4 text-center text-sm text-gray-500">
          Pages read per day this week
        </div>
      </div>
    </div>
  );
}
