import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';

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
  const chaptersLengthRef = useRef(chaptersLength);
  const startedRef = useRef(false);

  useEffect(() => { currentChapterRef.current = currentChapter; }, [currentChapter]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { scrollProgressRef.current = scrollProgress; }, [scrollProgress]);
  useEffect(() => { chaptersLengthRef.current = chaptersLength; }, [chaptersLength]);

  useEffect(() => {
    if (!bookId || loading || startedRef.current) return;

    let cancelled = false;
    startedRef.current = true;

    const startSession = async () => {
      try {
        const result = await api.post<{ id: string }>('/api/reading-sessions/start', { bookId });
        if (result.success && result.data && !cancelled) {
          sessionIdRef.current = result.data.id;

          heartbeatRef.current = setInterval(async () => {
            if (!sessionIdRef.current || isPausedRef.current) return;
            try {
              await api.patch(`/api/reading-sessions/${sessionIdRef.current}/heartbeat`, {
                pagesRead: currentChapterRef.current + 1,
                scrollProgress: scrollProgressRef.current,
              });
            } catch { /* heartbeat failure non-critical */ }
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
          totalPages: chaptersLengthRef.current,
          scrollProgress: scrollProgressRef.current,
        }).catch(() => {});
        sessionIdRef.current = null;
      }
    };
  }, [bookId, loading]);

  return { sessionIdRef };
}
