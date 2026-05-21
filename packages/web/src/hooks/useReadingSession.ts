'use client';

import { useEffect, useRef } from 'react';
import { API_BASE_URL, api } from '@/lib/api';
import { getAuthToken } from '@/lib/auth-fetch';

interface UseReadingSessionOptions {
  bookId: string;
  loading: boolean;
  currentChapter: number;
  chaptersLength: number;
  isPaused?: boolean;
  scrollProgress?: number;
}

export function useReadingSession({
  bookId,
  loading,
  currentChapter,
  chaptersLength,
  isPaused = false,
  scrollProgress = 0,
}: UseReadingSessionOptions) {
  const sessionIdRef = useRef<string | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentChapterRef = useRef(currentChapter);
  const isPausedRef = useRef(isPaused);
  const scrollProgressRef = useRef(scrollProgress);
  const lastHeartbeatRef = useRef<{ chapter: number; scroll: number } | null>(null);
  const chaptersLengthRef = useRef(chaptersLength);

  // Keep refs in sync
  useEffect(() => {
    currentChapterRef.current = currentChapter;
  }, [currentChapter]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    scrollProgressRef.current = scrollProgress;
  }, [scrollProgress]);

  useEffect(() => {
    chaptersLengthRef.current = chaptersLength;
  }, [chaptersLength]);

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
          // Skipped when paused or when nothing changed since last heartbeat
          heartbeatRef.current = setInterval(async () => {
            if (!sessionIdRef.current || isPausedRef.current) return;
            const chapter = currentChapterRef.current;
            const scroll = scrollProgressRef.current;
            const last = lastHeartbeatRef.current;
            if (last && last.chapter === chapter && Math.abs(last.scroll - scroll) < 0.001) return;
            lastHeartbeatRef.current = { chapter, scroll };
            try {
              await api.patch(`/api/reading-sessions/${sessionIdRef.current}/heartbeat`, {
                pagesRead: chapter + 1,
                scrollProgress: scroll,
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
        const token = getAuthToken();
        // End session (duration tracking only — do NOT send progress data here
        // to avoid racing with the Client.tsx unload save that writes the
        // correct progress via PATCH /api/books/{id}).
        try {
          fetch(`${API_BASE_URL}/api/reading-sessions/${sid}/end`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ pagesRead: 0 }),
            keepalive: true,
          }).catch(() => {});
        } catch {
          // ignore
        }
        sessionIdRef.current = null;
      }
    };
  }, [bookId, loading, chaptersLength]);

  return { sessionIdRef };
}
