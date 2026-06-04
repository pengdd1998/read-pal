'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';
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

export function useStatsData(): StatsDataResult {
  const t = useTranslations('stats');
  const { toast } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [flashcardStats, setFlashcardStats] = useState<FlashcardStats | null>(null);
  const [speedData, setSpeedData] = useState<SpeedData | null>(null);
  const [bookSpeeds, setBookSpeeds] = useState<BookSpeed[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<DashboardData>('/api/stats/dashboard'),
      api.get<SessionData[]>('/api/reading-sessions'),
      api.get<FlashcardStats>('/api/stats/flashcards'),
      api.get<SpeedData>('/api/stats/reading-speed'),
      api.get<BookSpeed[]>('/api/stats/reading-speed/by-book'),
    ])
      .then(([dashRes, sessRes, fcRes, speedRes, bookSpeedRes]) => {
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
      .catch(() => { setError(t('error_load')); toast(t('error_load'), 'error'); })
      .finally(() => setLoading(false));
  }, [t]);

  return { data, sessions, flashcardStats, speedData, bookSpeeds, loading, error };
}
