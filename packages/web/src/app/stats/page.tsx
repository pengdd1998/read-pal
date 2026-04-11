'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface ReadingStats {
  booksRead: number;
  totalPages: number;
  pagesRead: number;
  readingStreak: number;
  totalTime: string;
  conceptsLearned: number;
  connections: number;
}

interface BookProgress {
  id: string;
  title: string;
  author: string;
  progress: number;
  status: string;
  lastReadAt?: string;
}

interface SessionData {
  date: string;
  duration: number;
  pagesRead: number;
}

interface DashboardData {
  stats: ReadingStats;
  recentBooks: BookProgress[];
  weeklyActivity: { day: string; pages: number }[];
  booksByStatus: { unread: number; reading: number; completed: number };
}

function formatTime(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getDayName(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

export default function StatsPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<DashboardData>('/api/stats/dashboard'),
      api.get<SessionData[]>('/api/reading-sessions'),
    ])
      .then(([dashRes, sessRes]) => {
        if (dashRes.success && dashRes.data) {
          setData(dashRes.data as unknown as DashboardData);
        }
        if (sessRes.success && sessRes.data) {
          const sessData = sessRes.data as unknown as SessionData[];
          setSessions(Array.isArray(sessData) ? sessData.slice(0, 30) : []);
        }
      })
      .catch(() => setError('Failed to load stats'))
      .finally(() => setLoading(false));
  }, []);

  const stats = data?.stats;
  const weekly = data?.weeklyActivity || [];
  const statusCounts = data?.booksByStatus || { unread: 0, reading: 0, completed: 0 };

  // Compute monthly totals from sessions
  const totalMinutes = sessions.reduce((acc, s) => acc + (s.duration || 0), 0);
  const totalPages = sessions.reduce((acc, s) => acc + (s.pagesRead || 0), 0);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 animate-fade-in">
      {/* Back */}
      <div className="mb-6">
        <Link href="/dashboard" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Dashboard
        </Link>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Reading Stats</h1>
        <p className="text-sm text-gray-500 mt-1">Your reading journey, by the numbers</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 animate-pulse">
              <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-24 mb-4" />
              <div className="grid grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j}>
                    <div className="h-8 bg-gray-100 dark:bg-gray-800 rounded w-16 mx-auto mb-2" />
                    <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-12 mx-auto" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Overview Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Books', value: stats?.booksRead || 0, icon: '\uD83D\uDCDA', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/10' },
              { label: 'Pages', value: stats?.pagesRead || totalPages || 0, icon: '\uD83D\uDCC4', color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-900/10' },
              { label: 'Streak', value: `${stats?.readingStreak || 0}d`, icon: '\uD83D\uDD25', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/10' },
              { label: 'Time', value: stats?.totalTime || formatTime(Math.round(totalMinutes / 60)), icon: '\u23F1\uFE0F', color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/10' },
            ].map((item) => (
              <div key={item.label} className={`${item.bg} rounded-xl p-4 text-center`}>
                <span className="text-2xl">{item.icon}</span>
                <div className={`text-2xl font-bold ${item.color} mt-1`}>{item.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{item.label}</div>
              </div>
            ))}
          </div>

          {/* Library Status */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Library Status</h2>
            <div className="space-y-3">
              {[
                { label: 'Reading', count: statusCounts.reading, color: 'bg-amber-500', pct: stats?.booksRead ? (statusCounts.reading / (statusCounts.reading + statusCounts.unread + statusCounts.completed)) * 100 : 0 },
                { label: 'Completed', count: statusCounts.completed, color: 'bg-emerald-500', pct: stats?.booksRead ? (statusCounts.completed / (statusCounts.reading + statusCounts.unread + statusCounts.completed)) * 100 : 0 },
                { label: 'Unread', count: statusCounts.unread, color: 'bg-gray-300 dark:bg-gray-600', pct: stats?.booksRead ? (statusCounts.unread / (statusCounts.reading + statusCounts.unread + statusCounts.completed)) * 100 : 0 },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 dark:text-gray-400 w-24">{item.label}</span>
                  <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full ${item.color} rounded-full transition-all duration-500`} style={{ width: `${Math.max(2, item.pct)}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white w-8 text-right">{item.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Weekly Activity */}
          {weekly.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Weekly Activity</h2>
              <div className="flex items-end gap-2 h-32">
                {weekly.map((day, i) => {
                  const maxPages = Math.max(...weekly.map((d) => d.pages), 1);
                  const height = Math.max(4, (day.pages / maxPages) * 100);
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] font-medium text-gray-500">{day.pages}</span>
                      <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-t-sm relative" style={{ height: '100%' }}>
                        <div
                          className="absolute bottom-0 w-full bg-gradient-to-t from-amber-500 to-amber-400 rounded-t-sm transition-all duration-500"
                          style={{ height: `${height}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-400">{getDayName(day.day)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent Reading Sessions */}
          {sessions.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Recent Sessions</h2>
              <div className="space-y-2">
                {sessions.slice(0, 10).map((session, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 dark:border-gray-800 last:border-0">
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-sm text-gray-600 dark:text-gray-400 flex-1">
                      {new Date(session.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="text-xs text-gray-500">
                      {session.pagesRead} pages
                    </span>
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                      {formatTime(Math.round(session.duration / 60))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Book Breakdown */}
          {data?.recentBooks && data.recentBooks.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Books Progress</h2>
              <div className="space-y-3">
                {data.recentBooks.slice(0, 6).map((book) => (
                  <Link key={book.id} href={`/book/${book.id}`} className="flex items-center gap-3 group">
                    <div className="w-10 h-14 rounded-lg bg-gradient-to-br from-amber-400/30 to-amber-600/50 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm">{'\uD83D\uDCD6'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                        {book.title}
                      </h3>
                      <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 mt-1">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            book.progress >= 100 ? 'bg-emerald-500' : 'bg-amber-500'
                          }`}
                          style={{ width: `${Math.min(100, book.progress)}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-xs font-medium text-gray-500 tabular-nums">{Math.round(book.progress)}%</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
