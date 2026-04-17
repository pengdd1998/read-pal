'use client';

import { useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';

interface UseReadingSessionOptions {
  bookId: string;
  loading: boolean;
  currentChapter: number;
  chaptersLength: number;
  isPaused?: boolean;
}

export function useReadingSession({
  bookId,
  loading,
  currentChapter,
  chaptersLength,
  isPaused = false,
}: UseReadingSessionOptions) {
  const sessionIdRef = useRef<string | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentChapterRef = useRef(currentChapter);
  const isPausedRef = useRef(isPaused);

  // Keep refs in sync
  useEffect(() => {
    currentChapterRef.current = currentChapter;
  }, [currentChapter]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Start/end reading session lifecycle
  useEffect(() => {
    if (!bookId || loading) return;

    let cancelled = false;

    const startSession = async () => {
      try {
        const result = await api.post<{ id: string }>('/api/reading-sessions/start', { bookId });
        if (result.success && result.data && !cancelled) {
          const data = result.data;
          sessionIdRef.current = data.id;

          // Heartbeat every 30s to keep session alive and track progress
          // Skipped when paused (no user activity)
          heartbeatRef.current = setInterval(async () => {
            if (!sessionIdRef.current || isPausedRef.current) return;
            try {
              await api.patch(`/api/reading-sessions/${sessionIdRef.current}/heartbeat`, {
                pagesRead: currentChapterRef.current + 1,
              });
            } catch {
              // heartbeat failure is non-critical
            }
          }, 30_000);
        }
      } catch (err) {
        console.error('Failed to start reading session:', err);
      }
    };

    startSession();

    return () => {
      cancelled = true;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (sessionIdRef.current) {
        const sid = sessionIdRef.current;
        const finalChapter = currentChapterRef.current;
        api.post(`/api/reading-sessions/${sid}/end`, {
          pagesRead: finalChapter + 1,
          currentPage: finalChapter,
          totalPages: chaptersLength,
        }).catch((err) => {
          console.warn('Failed to end reading session:', err);
        });
        sessionIdRef.current = null;
      }
    };
  }, [bookId, loading, chaptersLength]);

  const getSessionDuration = useCallback(() => {
    return Date.now();
  }, []);

  return { sessionIdRef, getSessionDuration };
}
