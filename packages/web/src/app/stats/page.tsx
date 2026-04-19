'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { usePageTitle } from '@/hooks/usePageTitle';

interface ReadingStats {
  booksRead: number;
  totalPages: number;
  pagesRead: number;
  readingStreak: number;
  totalTime: string;
  conceptsLearned: number;
  connections: number;
  chatMessageCount?: number;
  memoryBookCount?: number;
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
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { weekday: 'short' });
}

export default function StatsPage() {
  usePageTitle('Reading Stats');
  const { toast } = useToast();
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
          setData(dashRes.data);
        }
        if (sessRes.success && sessRes.data) {
          const sessData = sessRes.data;
          setSessions(Array.isArray(sessData) ? sessData.slice(0, 30) : []);
        }
      })
      .catch(() => { setError('Failed to load stats'); toast('Failed to load stats', 'error'); })
      .finally(() => setLoading(false));
  }, []);

  const stats = data?.stats;
  const weekly = data?.weeklyActivity || [];
  const statusCounts = data?.booksByStatus || { unread: 0, reading: 0, completed: 0 };

  // Compute monthly totals from sessions
  const totalMinutes = sessions.reduce((acc, s) => acc + (s.duration || 0), 0);
  const totalPages = sessions.reduce((acc, s) => acc + (s.pagesRead || 0), 0);

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 animate-fade-in">
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
      ) : (!data && !error) ? (
        <div className="text-center py-16 animate-fade-in">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 flex items-center justify-center text-3xl">
            📊
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No stats yet</h2>
          <p className="text-sm text-gray-500 mb-6 max-w-xs mx-auto">
            Start reading to see your stats, streaks, and activity heatmap.
          </p>
          <Link
            href="/library"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-xl transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            Browse Library
          </Link>
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
            ].map((item, i) => (
              <div key={item.label} className={`stagger-${i + 1} animate-slide-up ${item.bg} rounded-xl p-4 text-center`}>
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
              <div className="flex items-end gap-2 h-32" role="img" aria-label="Weekly reading activity bar chart">
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

          {/* Reading Velocity Trend — last 14 sessions */}
          {sessions.length > 2 && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900 dark:text-white">Reading Velocity</h2>
                <span className="text-xs text-gray-400">
                  {sessions.length > 0
                    ? `${(sessions.reduce((a, s) => a + s.pagesRead, 0) / sessions.length).toFixed(1)} avg pages/session`
                    : ''}
                </span>
              </div>
              <svg viewBox="0 0 300 80" className="w-full h-24" preserveAspectRatio="none" role="img" aria-label="Reading velocity trend chart">
                {(() => {
                  const data = sessions.slice(0, 14).reverse();
                  const maxPages = Math.max(...data.map((s) => s.pagesRead), 1);
                  const maxDuration = Math.max(...data.map((s) => s.duration || 1), 1);
                  const w = 300;
                  const h = 70;
                  const padY = 5;

                  // Area fill for pages
                  const points = data.map((s, i) => {
                    const x = (i / Math.max(data.length - 1, 1)) * w;
                    const y = h - padY - ((s.pagesRead / maxPages) * (h - padY * 2));
                    return { x, y };
                  });
                  const areaPath = `M${points[0].x},${h} ${points.map((p) => `L${p.x},${p.y}`).join(' ')} L${points[points.length - 1].x},${h} Z`;

                  // Line for duration (minutes)
                  const durPoints = data.map((s, i) => {
                    const x = (i / Math.max(data.length - 1, 1)) * w;
                    const y = h - padY - (((s.duration || 0) / maxDuration) * (h - padY * 2));
                    return { x, y };
                  });
                  const durLine = durPoints.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(' ');

                  return (
                    <>
                      {/* Pages area */}
                      <path d={areaPath} fill="url(#pagesGrad)" opacity={0.3} />
                      <polyline
                        points={points.map((p) => `${p.x},${p.y}`).join(' ')}
                        fill="none" stroke="#f59e0b" strokeWidth={2} strokeLinejoin="round"
                      />
                      {/* Duration line */}
                      <path d={durLine} fill="none" stroke="#14b8a6" strokeWidth={1.5} strokeDasharray="4 2" />
                      {/* Data points */}
                      {points.map((p, i) => (
                        <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="#f59e0b" />
                      ))}
                      <defs>
                        <linearGradient id="pagesGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                    </>
                  );
                })()}
              </svg>
              <div className="flex items-center gap-4 mt-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-amber-500 rounded" />
                  <span className="text-gray-500">Pages</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-teal-500 rounded" style={{ borderTop: '1px dashed #14b8a6' }} />
                  <span className="text-gray-500">Duration</span>
                </div>
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
                      {session.date ? new Date(session.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
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
                  <Link key={book.id} href={`/read/${book.id}`} className="flex items-center gap-3 group">
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

          {/* Activity Heatmap */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Activity</h2>
            <div className="flex flex-wrap gap-1">
              {(() => {
                const days = 84; // 12 weeks
                const cells = [];
                for (let i = 0; i < days; i++) {
                  const dayActivity = sessions.find((s) => {
                    const sessionDate = new Date(s.date);
                    const targetDate = new Date();
                    targetDate.setDate(targetDate.getDate() - (days - 1 - i));
                    return sessionDate.toDateString() === targetDate.toDateString();
                  });
                  const level = dayActivity
                    ? dayActivity.pagesRead > 10 ? 3
                      : dayActivity.pagesRead > 5 ? 2
                        : 1
                    : 0;
                  const colors = [
                    'bg-gray-100 dark:bg-gray-800',
                    'bg-amber-200 dark:bg-amber-800',
                    'bg-amber-400 dark:bg-amber-600',
                    'bg-amber-600 dark:bg-amber-400',
                  ];
                  const date = new Date();
                  date.setDate(date.getDate() - (days - 1 - i));
                  cells.push(
                    <div
                      key={i}
                      className={`w-3 h-3 rounded-sm ${colors[level]}`}
                      title={`${date.toLocaleDateString()} - ${dayActivity ? `${dayActivity.pagesRead} pages` : 'No activity'}`}
                    />,
                  );
                }
                return cells;
              })()}
            </div>
            <div className="flex items-center gap-2 mt-3 text-xs text-gray-400">
              <span>Less</span>
              <div className="w-3 h-3 rounded-sm bg-gray-100 dark:bg-gray-800" />
              <div className="w-3 h-3 rounded-sm bg-amber-200 dark:bg-amber-800" />
              <div className="w-3 h-3 rounded-sm bg-amber-400 dark:bg-amber-600" />
              <div className="w-3 h-3 rounded-sm bg-amber-600 dark:bg-amber-400" />
              <span>More</span>
            </div>
          </div>

          {/* Achievements */}
          {stats && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Achievements</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { icon: '\uD83D\uDCD6', title: 'First Book', desc: 'Complete your first book', unlocked: (stats.booksRead || 0) >= 1 },
                  { icon: '\uD83D\uDD25', title: 'On Fire', desc: '7-day reading streak', unlocked: (stats.readingStreak || 0) >= 7 },
                  { icon: '\uD83D\uDCA1', title: 'Curious Mind', desc: 'Make 10 highlights', unlocked: (stats.conceptsLearned || 0) >= 10 },
                  { icon: '\uD83C\uDFAF', title: 'Bookworm', desc: 'Read 5 books', unlocked: (stats.booksRead || 0) >= 5 },
                  { icon: '\u23F1\uFE0F', title: 'Deep Reader', desc: '10 hours of reading', unlocked: (() => { const h = stats.totalTime?.match(/(\d+)h/); return h ? parseInt(h[1]) >= 10 : false; })() },
                  { icon: '\uD83E\uDD1D', title: 'Social Reader', desc: 'Chat with your Friend', unlocked: (stats.chatMessageCount || 0) >= 1 },
                  { icon: '\uD83D\uDCD3', title: 'Memory Keeper', desc: 'Generate a memory book', unlocked: (stats.memoryBookCount || 0) >= 1 },
                  { icon: '\uD83C\uDFC6', title: 'Champion', desc: 'Complete 10 books', unlocked: (stats.booksRead || 0) >= 10 },
                ].map((badge) => (
                  <div
                    key={badge.title}
                    className={`rounded-xl p-3 text-center transition-all ${
                      badge.unlocked
                        ? 'bg-gradient-to-br from-amber-50 to-teal-50 dark:from-amber-900/10 dark:to-teal-900/10 border border-amber-200 dark:border-amber-800'
                        : 'bg-gray-50 dark:bg-gray-800/50 opacity-50'
                    }`}
                  >
                    <div className={`text-2xl mb-1 ${badge.unlocked ? '' : 'grayscale'}`}>{badge.icon}</div>
                    <div className="text-xs font-semibold text-gray-900 dark:text-white">{badge.title}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{badge.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
