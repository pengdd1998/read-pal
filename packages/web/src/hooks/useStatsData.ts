'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import type {
  DashboardData,
  SessionData,
  FlashcardStats,
  SpeedData,
  BookSpeed,
} from '@/components/stats/types';

interface StatsDataResult {
  data: DashboardData | null;
  sessions: SessionData[];
  flashcardStats: FlashcardStats | null;
  speedData: SpeedData | null;
  bookSpeeds: BookSpeed[] | null;
  loading: boolean;
  error: string | null;
}

export function useStatsData(): StatsDataResult & { refetch: () => void } {
  const t = useTranslations('stats');
  const [data, setData] = useState<DashboardData | null>(null);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [flashcardStats, setFlashcardStats] = useState<FlashcardStats | null>(null);
  const [speedData, setSpeedData] = useState<SpeedData | null>(null);
  const [bookSpeeds, setBookSpeeds] = useState<BookSpeed[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let stale = false;
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<DashboardData>('/api/stats/dashboard'),
      api.get<SessionData[]>('/api/reading-sessions'),
      api.get<FlashcardStats>('/api/stats/flashcards'),
      api.get<SpeedData>('/api/stats/reading-speed'),
      api.get<BookSpeed[]>('/api/stats/reading-speed/by-book'),
    ])
      .then(([dashRes, sessRes, fcRes, speedRes, bookSpeedRes]) => {
        if (stale) return;
        if (dashRes.success && dashRes.data) {
          setData(dashRes.data);
        }
        if (sessRes.success && sessRes.data) {
          const raw = sessRes.data;
          const sessData = (Array.isArray(raw) ? raw : []).map((s: SessionData) => ({
            startedAt: s.startedAt || '',
            duration: s.duration || 0,
            pagesRead: s.pagesRead || 0,
            bookTitle: s.bookTitle || '',
          }));
          setSessions(sessData.slice(0, 30));
        }
        if (fcRes.success && fcRes.data) {
          setFlashcardStats(fcRes.data);
        }
        if (speedRes.success && speedRes.data) {
          setSpeedData(speedRes.data);
        }
        if (bookSpeedRes.success && bookSpeedRes.data) {
          setBookSpeeds(Array.isArray(bookSpeedRes.data) ? bookSpeedRes.data : []);
        }
      })
      .catch((err) => { console.warn('useStatsData: fetch failed', err); if (!stale) setError(t('error_load')); })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [t, retryCount]);

  const refetch = () => setRetryCount((c) => c + 1);

  return { data, sessions, flashcardStats, speedData, bookSpeeds, loading, error, refetch };
}
