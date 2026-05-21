'use client';

import { useEffect, useRef } from 'react';
import { API_BASE_URL, api } from '@/lib/api';

interface UseReadingSessionOptions {
  bookId: string;
  loading: boolean;
  currentChapter: number;
  chaptersLength: number;
  isPaused?: boolean;
  scrollProgress?: number;
}

// Inline token helper — avoids webpack dev-mode tree-shaking bug on auth-fetch
const getAuthToken = typeof window !== 'undefined'
  ? () => localStorage.getItem('auth_token')
  : () => null as string | null;

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

  // Save progress via heartbeat (doesn't end session)
  const saveProgressNow = useRef(() => {});
  saveProgressNow.current = () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const token = typeof window !== 'undefined' ? getAuthToken() : null;
    const url = `${API_BASE_URL}/api/reading-sessions/${sid}/heartbeat`;
    const data = {
      pagesRead: currentChapterRef.current + 1,
      scrollProgress: scrollProgressRef.current,
    };
    try {
      fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(data),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // fetch itself threw (rare) — ignore
    }
  };

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

    // Save progress when tab becomes hidden or page is unloading
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveProgressNow.current();
      }
    };

    const handleBeforeUnload = () => {
      saveProgressNow.current();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (sessionIdRef.current) {
        const sid = sessionIdRef.current;
        const finalChapter = currentChapterRef.current;
        const token = typeof window !== 'undefined' ? getAuthToken() : null;
        // End session + save final progress
        try {
          fetch(`${API_BASE_URL}/api/reading-sessions/${sid}/end`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              pagesRead: finalChapter + 1,
              currentPage: finalChapter,
              totalPages: chaptersLengthRef.current,
              scrollProgress: scrollProgressRef.current,
            }),
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
