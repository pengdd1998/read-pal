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
  activeSeconds?: number;
}

export function useReadingSession({
  bookId,
  loading,
  currentChapter,
  chaptersLength,
  isPaused = false,
  scrollProgress = 0,
  activeSeconds = 0,
}: UseReadingSessionOptions) {
  const sessionIdRef = useRef<string | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentChapterRef = useRef(currentChapter);
  const isPausedRef = useRef(isPaused);
  const scrollProgressRef = useRef(scrollProgress);
  const lastHeartbeatRef = useRef<{ chapter: number; scroll: number } | null>(null);
  const chaptersLengthRef = useRef(chaptersLength);
  const activeSecondsRef = useRef(activeSeconds);
  // Guard against double end-session on concurrent unmount / StrictMode
  const endingRef = useRef(false);
  // AbortController to cancel in-flight API requests on cleanup
  const abortRef = useRef<AbortController | null>(null);

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

  useEffect(() => {
    activeSecondsRef.current = activeSeconds;
  }, [activeSeconds]);

  // Start/end reading session lifecycle
  useEffect(() => {
    if (!bookId || loading) return;

    let cancelled = false;
    const controller = new AbortController();
    abortRef.current = controller;

    const startSession = async () => {
      try {
        const result = await api.post<{ id: string }>(
          '/api/reading-sessions/start',
          { bookId },
          { signal: controller.signal },
        );
        if (result.success && result.data && !cancelled) {
          const data = result.data;
          sessionIdRef.current = data.id;

          // Heartbeat every 30s to keep session alive and track progress
          // Skipped when paused or when nothing changed since last heartbeat
          heartbeatRef.current = setInterval(async () => {
            if (!sessionIdRef.current || isPausedRef.current || endingRef.current) return;
            if (controller.signal.aborted) return;
            const chapter = currentChapterRef.current;
            const scroll = scrollProgressRef.current;
            const last = lastHeartbeatRef.current;
            if (last && last.chapter === chapter && Math.abs(last.scroll - scroll) < 0.001) return;
            lastHeartbeatRef.current = { chapter, scroll };
            try {
              await api.patch(
                `/api/reading-sessions/${sessionIdRef.current}/heartbeat`,
                {
                  pagesRead: chapter + 1,
                  scrollProgress: scroll,
                },
                { signal: controller.signal },
              );
            } catch (err) {
              if ((err as Error)?.name !== 'AbortError' && !controller.signal.aborted) {
                console.warn('ReadingSession: heartbeat failed', err);
              }
            }
          }, 30_000);
        }
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError' && !controller.signal.aborted) {
          console.warn('ReadingSession: failed to start session', err);
        }
      }
    };

    startSession();

    return () => {
      cancelled = true;

      // Abort in-flight API calls (start-session, heartbeats)
      controller.abort();
      abortRef.current = null;

      // Clear heartbeat timer
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }

      // End session — guarded against double-invocation
      if (sessionIdRef.current && !endingRef.current) {
        const sid = sessionIdRef.current;
        endingRef.current = true;
        sessionIdRef.current = null;

        const token = getAuthToken();
        try {
          fetch(`${API_BASE_URL}/api/reading-sessions/${sid}/end`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ pagesRead: currentChapterRef.current + 1, currentPage: currentChapterRef.current + 1, duration: activeSecondsRef.current }),
            keepalive: true,
          }).catch((err) => {
            console.warn('ReadingSession: keepalive end failed', err);
          }).finally(() => {
            endingRef.current = false;
          });
        } catch (err) {
          console.warn('ReadingSession: keepalive end failed', err);
          endingRef.current = false;
        }
      }
    };
  }, [bookId, loading]);

  return { sessionIdRef };
}
