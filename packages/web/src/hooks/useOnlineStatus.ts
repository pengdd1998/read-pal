'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseOnlineStatusReturn {
  isOnline: boolean;
  /** True when the browser just came back online (resets after 3s) */
  justCameBackOnline: boolean;
}

/**
 * Tracks browser online/offline state and exposes a transient
 * "justCameBackOnline" flag useful for triggering queued actions.
 */
export function useOnlineStatus(): UseOnlineStatusReturn {
  const [isOnline, setIsOnline] = useState(
    typeof window !== 'undefined' ? navigator.onLine : true,
  );
  const [justCameBackOnline, setJustCameBackOnline] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleOnline = useCallback(() => {
    setIsOnline(true);
    setJustCameBackOnline(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setJustCameBackOnline(false), 3000);
  }, []);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
    setJustCameBackOnline(false);
  }, []);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [handleOnline, handleOffline]);

  return { isOnline, justCameBackOnline };
}
