'use client';

import { useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';

interface UseReadingSessionOptions {
  bookId: string;
  loading: boolean;
  currentChapter: number;
  chaptersLength: number;
}

export function useReadingSession({
  bookId,
  loading,
  currentChapter,
  chaptersLength,
}: UseReadingSessionOptions) {
  const sessionIdRef = useRef<string | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentChapterRef = useRef(currentChapter);

  // Keep ref in sync so heartbeat always sends the latest chapter
  useEffect(() => {
    currentChapterRef.current = currentChapter;
  }, [currentChapter]);

  // Start/end reading session lifecycle
  useEffect(() => {
    if (!bookId || loading) return;

    let cancelled = false;

    const startSession = async () => {
      try {
        const result = await api.post<{ id: string }>('/api/reading-sessions/start', { bookId });
        if (result.success && result.data && !cancelled) {
          const data = result.data as unknown as { id: string };
          sessionIdRef.current = data.id;

          // Heartbeat every 30s to keep session alive and track progress
          heartbeatRef.current = setInterval(async () => {
            if (!sessionIdRef.current) return;
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
        }).catch(() => {});
        sessionIdRef.current = null;
      }
    };
  }, [bookId, loading, chaptersLength]);

  const getSessionDuration = useCallback(() => {
    return Date.now();
  }, []);

  return { sessionIdRef, getSessionDuration };
}
