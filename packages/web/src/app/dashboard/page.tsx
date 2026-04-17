'use client';

import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';
import { formatRelativeTime } from '@/lib/date';
import { useToast } from '@/components/Toast';

// Lazy-load heavy dashboard components
const OnboardingWalkthrough = dynamic(() => import('@/components/onboarding/OnboardingWalkthrough').then((m) => ({ default: m.OnboardingWalkthrough })), { ssr: false });
const ShareReadingCard = dynamic(() => import('@/components/share/ReadingShareCard').then((m) => ({ default: m.ShareReadingCard })), { ssr: false });
const StreakCalendar = dynamic(() => import('@/components/dashboard/StreakCalendar'), { ssr: false });
const BookClubsWidget = dynamic(() => import('@/components/dashboard/BookClubsWidget'), { ssr: false });

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

interface ChallengeItem {
  id: string;
  title: string;
  description: string;
  type: 'daily' | 'weekly' | 'monthly';
  target: number;
  unit: string;
  icon: string;
  progress: number;
  completed: boolean;
  percentage: number;
}

interface RecommendationItem {
  title: string;
  author: string;
  genre: string;
  reason: string;
  relevance: number;
}

interface FlashcardStats {
  total: number;
  due: number;
  reviewed: number;
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

// Alias for readability in this context
const formatLastRead = formatRelativeTime;

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'Happy late-night reading';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Happy night reading';
}

// Static milestones map — never changes, hoisted to module scope
const STREAK_MILESTONES: Record<number, string> = {
  3: '3-day reading streak! You\'re building a habit.',
  7: 'One week of reading! Amazing consistency.',
  14: 'Two weeks strong! Reading is part of your routine now.',
  30: 'One month of reading! You\'re a true reader.',
};

// Static feature preview data — hoisted to avoid re-creation per render
const FEATURE_PREVIEW = [
  { icon: '\uD83D\uDCD6', title: 'Read', desc: 'Beautiful reader with themes and fonts', href: '/library' },
  { icon: '\uD83D\uDCDA', title: 'Memory Books', desc: 'Your reading journey captured forever', href: '/memory-books' },
  { icon: '\uD83D\uDCCA', title: 'Stats', desc: 'Track your reading progress', href: '/stats' },
] as const;

const DashboardChallenges = memo(function DashboardChallenges() {
  const [challenges, setChallenges] = useState<ChallengeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchChallenges = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    api.get<{ challenges: ChallengeItem[] }>('/api/challenges')
      .then((res) => {
        if (!cancelled && res.data) {
          setChallenges(res.data.challenges ?? []);
        }
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { return fetchChallenges(); }, [fetchChallenges]);

  if (loading) {
    return (
      <div className="card">
        <SkeletonPulse className="h-4 w-32 mb-3" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <SkeletonPulse key={i} className="h-8 w-full" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card text-center py-4">
        <p className="text-xs text-gray-400 mb-2">Failed to load challenges</p>
        <button onClick={fetchChallenges} className="text-xs text-amber-600 dark:text-amber-400 hover:underline">Retry</button>
      </div>
    );
  }

  const active = useMemo(() => challenges.filter((c) => !c.completed).slice(0, 4), [challenges]);
  const completedCount = useMemo(() => challenges.filter((c) => c.completed).length, [challenges]);
  if (active.length === 0) return null;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Challenges</h3>
        <span className="text-[10px] text-gray-400">{completedCount}/{challenges.length} done</span>
      </div>
      <div className="space-y-3">
        {active.map((c) => (
          <div key={c.id}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <span>{c.icon}</span>
                <span className="font-medium">{c.title}</span>
              </span>
              <span className="text-[10px] text-gray-400 tabular-nums">{c.progress}/{c.target} {c.unit}</span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
              <div
                className={`rounded-full h-1.5 transition-all duration-500 ${c.completed ? 'bg-green-500' : 'bg-primary-500'}`}
                style={{ width: `${Math.min(100, c.percentage)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

const DashboardRecommendations = memo(function DashboardRecommendations() {
  const [recs, setRecs] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const topRecs = useMemo(() => recs.slice(0, 3), [recs]);

  const fetchRecs = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    api.get<{ recommendations: RecommendationItem[] }>('/api/recommendations')
      .then((res) => {
        if (!cancelled && res.data) {
          setRecs(res.data.recommendations ?? []);
        }
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { return fetchRecs(); }, [fetchRecs]);

  if (loading) {
    return (
      <div className="card">
        <SkeletonPulse className="h-4 w-36 mb-3" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <SkeletonPulse key={i} className="h-10 w-full" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card text-center py-4">
        <p className="text-xs text-gray-400 mb-2">Failed to load recommendations</p>
        <button onClick={fetchRecs} className="text-xs text-amber-600 dark:text-amber-400 hover:underline">Retry</button>
      </div>
    );
  }

  if (recs.length === 0) return null;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Recommended</h3>
        <Link href="/search" className="text-[10px] text-primary-600 dark:text-primary-400 hover:underline">See all</Link>
      </div>
      <div className="space-y-2">
        {topRecs.map((r, i) => (
          <div key={i} className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
            <div className="w-8 h-10 rounded bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 flex items-center justify-center flex-shrink-0">
              <span className="text-xs">{'\uD83D\uDCD6'}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{r.title}</p>
              <p className="text-[10px] text-gray-400 truncate">{r.author}</p>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 whitespace-nowrap">{r.genre}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

const ReadingGoalsWidget = memo(function ReadingGoalsWidget() {
  const [goals, setGoals] = useState<{ goal: number; completed: number; onTrack: boolean; dailyGoalMinutes: number; todayMinutes: number; dailyOnTrack: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchGoals = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    api.get<typeof goals>('/api/settings/reading-goals')
      .then((res) => {
        if (!cancelled && res.data) setGoals(res.data);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { return fetchGoals(); }, [fetchGoals]);

  if (loading) {
    return (
      <div className="card">
        <SkeletonPulse className="h-4 w-28 mb-3" />
        <div className="grid grid-cols-2 gap-3">
          <SkeletonPulse className="h-16 w-full" />
          <SkeletonPulse className="h-16 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card text-center py-4">
        <p className="text-xs text-gray-400 mb-2">Failed to load reading goals</p>
        <button onClick={fetchGoals} className="text-xs text-amber-600 dark:text-amber-400 hover:underline">Retry</button>
      </div>
    );
  }

  if (!goals) return null;

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Reading Goals</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center justify-center gap-1">
            {goals.onTrack ? (
              <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
            ) : (
              <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
            )}
            <span className="text-lg font-bold text-gray-900 dark:text-white">{goals.completed}/{goals.goal}</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-1">Books this week</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center justify-center gap-1">
            {goals.dailyOnTrack ? (
              <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
            ) : (
              <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
            )}
            <span className="text-lg font-bold text-gray-900 dark:text-white">{goals.todayMinutes}/{goals.dailyGoalMinutes}m</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-1">Reading today</p>
        </div>
      </div>
    </div>
  );
});

const FlashcardReviewWidget = memo(function FlashcardReviewWidget() {
  const [stats, setStats] = useState<FlashcardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchStats = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    api.get<{ stats: FlashcardStats }>('/api/flashcards/review?limit=1')
      .then((res) => {
        if (!cancelled && res.data) setStats(res.data.stats);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { return fetchStats(); }, [fetchStats]);

  if (loading) {
    return (
      <div className="card">
        <div className="flex items-center gap-4">
          <SkeletonPulse className="w-12 h-12 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <SkeletonPulse className="h-4 w-32" />
            <SkeletonPulse className="h-3 w-24" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card text-center py-4">
        <p className="text-xs text-gray-400 mb-2">Failed to load flashcard stats</p>
        <button onClick={fetchStats} className="text-xs text-amber-600 dark:text-amber-400 hover:underline">Retry</button>
      </div>
    );
  }

  if (!stats || stats.total === 0) return null;

  return (
    <Link
      href="/flashcards"
      className="block card group hover:border-teal-200 dark:hover:border-teal-800 transition-all duration-200"
    >
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-50 to-emerald-50 dark:from-teal-950/30 dark:to-emerald-950/30 flex items-center justify-center flex-shrink-0">
          <span className="text-2xl">{'\uD83D\uDCC7'}</span>
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
            Flashcard Review
          </h3>
          <div className="flex items-center gap-3 mt-1">
            {stats.due > 0 ? (
              <>
                <span className="text-xs font-medium text-teal-600 dark:text-teal-400">{stats.due} due now</span>
                <span className="text-xs text-gray-400">{stats.reviewed} reviewed</span>
              </>
            ) : (
              <span className="text-xs text-gray-500">All caught up! Come back tomorrow.</span>
            )}
          </div>
        </div>
        {stats.due > 0 && (
          <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-500 text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            Review
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </span>
        )}
      </div>
    </Link>
  );
});

const ReadingSpeedWidget = memo(function ReadingSpeedWidget() {
  const [books, setBooks] = useState<Array<{ bookId: string; title: string; author: string; wpm: number; totalMinutes: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get<{ bookId: string; title: string; author: string; wpm: number; totalMinutes: number }[]>('/api/stats/reading-speed/by-book')
      .then((res) => { if (!cancelled && res.success && Array.isArray(res.data)) setBooks(res.data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="card">
        <SkeletonPulse className="h-4 w-36 mb-3" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <SkeletonPulse key={i} className="h-8 w-full" />)}
        </div>
      </div>
    );
  }

  if (books.length === 0) return null;

  const maxWpm = Math.max(...books.map((b) => b.wpm), 1);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Reading Speed</h3>
        <span className="text-[10px] text-gray-400">words/min</span>
      </div>
      <div className="space-y-2.5">
        {books.slice(0, 6).map((b) => (
          <div key={b.bookId}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-700 dark:text-gray-300 font-medium truncate max-w-[60%]">{b.title}</span>
              <span className="text-xs tabular-nums text-gray-500">{b.wpm} wpm</span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
              <div
                className="rounded-full h-2 transition-all duration-500 bg-gradient-to-r from-amber-400 to-orange-400 dark:from-amber-500 dark:to-orange-500"
                style={{ width: `${Math.min(100, Math.max(5, (b.wpm / maxWpm) * 100))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export default function DashboardPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const { toast } = useToast();
  const celebratedMilestones = useRef<Set<number>>(new Set());

  const insightOfDay = INSIGHTS_POOL[new Date().getDate() % INSIGHTS_POOL.length];

  useEffect(() => {
    let cancelled = false;
    api.get<DashboardData>('/api/stats/dashboard')
      .then((res) => {
        if (!cancelled) setDashboardData((res.data) ?? null);
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
  const activeBooks = useMemo(
    () => recentBooks.filter((b) => b.progress > 0 && b.progress < 100).slice(0, 3),
    [recentBooks],
  );
  const streak = stats?.readingStreak ?? 0;
  const hasData = useMemo(
    () => !loading && (recentBooks.length > 0 || (stats !== null && (stats.booksRead > 0 || stats.pagesRead > 0))),
    [loading, recentBooks, stats],
  );

  // Streak milestone celebrations — uses hoisted STREAK_MILESTONES
  useEffect(() => {
    if (loading || streak === 0) return;
    const msg = STREAK_MILESTONES[streak];
    if (msg && !celebratedMilestones.current.has(streak)) {
      celebratedMilestones.current.add(streak);
      toast(msg, 'success', 5000);
    }
  }, [streak, loading, toast]);

  const handleSeedSample = async () => {
    try {
      setSeeding(true);
      const res = await api.post<{ book: { id: string } }>('/api/books/seed-sample');
      if (res.success) {
        window.location.href = '/library';
      }
    } catch {
      toast('Failed to load sample book. You can upload one manually.', 'error');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-3 sm:px-6 py-6 sm:py-10">
      {/* Welcome */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
          {!hasData && !loading ? `${getTimeGreeting()}` : 'Welcome back'}
        </h1>
        <p className="text-gray-500 mt-2 text-sm sm:text-base">
          {loading ? (
            <SkeletonPulse className="w-48 h-5 inline-block" />
          ) : hasData && streak > 0 ? (
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse animate-streak-glow" />
              You&apos;re on a <strong className="text-amber-600 dark:text-amber-400">{streak}-day</strong> reading streak
            </span>
          ) : !hasData ? (
            'Upload a book to get started with your reading companion.'
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
            <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/20 dark:to-teal-900/20 flex items-center justify-center">
              <span className="text-4xl">{'\uD83D\uDCDA'}</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              Ready for your first book?
            </h2>
            <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
              Upload an EPUB or try a sample book. Your AI companion will be there to discuss, explain, and celebrate insights with you.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link
                href="/library"
                className="btn btn-primary hover:scale-105 active:scale-95 transition-transform duration-200"
              >
                Upload a book
              </Link>
              <button
                onClick={handleSeedSample}
                disabled={seeding}
                className="btn hover:scale-105 active:scale-95 transition-transform duration-200 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {seeding ? 'Adding...' : 'Try a sample book'}
              </button>
            </div>
          </div>

          {/* Quick feature preview for new users */}
          <div className="grid grid-cols-3 gap-3 mt-6">
            {FEATURE_PREVIEW.map((f, fi) => (
              <Link
                key={f.title}
                href={f.href}
                className={`stagger-${fi + 1} animate-slide-up card text-center group hover:border-primary-200 dark:hover:border-primary-800 transition-all duration-200 py-5`}
              >
                <span className="text-2xl block mb-2">{f.icon}</span>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{f.title}</h3>
                <p className="text-xs text-gray-400 mt-1">{f.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        /* ── ACTIVE USER: 3 primary cards ── */
        <div className="space-y-5 animate-fade-in">
          {/* Card 1: Current Reading — supports multiple active books */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-wide mb-3">
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
              <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">Day Streak</div>
            </div>
            {streak === 0 && !loading && (
              <p className="text-xs text-gray-400">Read today to start your streak</p>
            )}
            {streak >= 3 && !loading && (
              <div className="text-right">
                <p className="text-xs text-orange-500 dark:text-orange-400 font-medium">Keep going!</p>
                <p className="text-[10px] text-gray-400">Next: {streak < 7 ? '7' : streak < 14 ? '14' : streak < 30 ? '30' : '60'} days</p>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-5 gap-2">
            {[
              { label: 'Upload Book', href: '/library', icon: '\u{1F4C2}', color: 'from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20' },
              { label: 'Memory Books', href: '/memory-books', icon: '\u{1F4D5}', color: 'from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20' },
              { label: 'Flashcards', href: '/flashcards', icon: '\u{1F4C7}', color: 'from-teal-50 to-emerald-50 dark:from-teal-950/20 dark:to-emerald-950/20' },
              { label: 'Reading Stats', href: '/stats', icon: '\u{1F4CA}', color: 'from-purple-50 to-violet-50 dark:from-purple-950/20 dark:to-violet-950/20' },
              { label: 'Book Clubs', href: '/book-clubs', icon: '\u{1F4DA}', color: 'from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20' },
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

      {/* ── Reading Goals ── */}
      {hasData && !loading && (
        <div className="mt-5 animate-fade-in">
          <ReadingGoalsWidget />
        </div>
      )}

      {/* ── Reading Speed Comparison ── */}
      {hasData && !loading && (
        <div className="mt-5 animate-fade-in">
          <ReadingSpeedWidget />
        </div>
      )}

      {/* ── Challenges & Recommendations ── */}
      {hasData && !loading && (
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in">
          <DashboardChallenges />
          <DashboardRecommendations />
        </div>
      )}

      {/* ── Streak Calendar ── */}
      {hasData && !loading && (
        <div className="mt-5 animate-fade-in">
          <StreakCalendar />
        </div>
      )}

      {/* ── Book Clubs ── */}
      {hasData && !loading && (
        <div className="mt-5 animate-fade-in">
          <BookClubsWidget />
        </div>
      )}

      {/* ── Flashcard Review ── */}
      {hasData && !loading && (
        <div className="mt-5 animate-fade-in">
          <FlashcardReviewWidget />
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
              href="/memory-books"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
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
              href="/flashcards"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-1.243 1.007-2.25 2.25-2.25h13.5" />
              </svg>
              Flashcards
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
    </main>
  );
}
