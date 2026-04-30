'use client';

import { useEffect, useRef } from 'react';
import { isCapacitor } from '@/lib/capacitor';
import { useOnlineStatus } from './useOnlineStatus';

interface AppResumeOptions {
  /** Called when the app resumes from background. */
  onResume?: () => void;
}

/**
 * Listens for Capacitor App resume events and triggers
 * network sync + offline queue flush when the app comes
 * back to the foreground.
 *
 * Only active when running inside a Capacitor native shell.
 * Capacitor plugins are lazy-loaded to avoid bundle bloat on web.
 */
export function useAppResume(options?: AppResumeOptions): void {
  const { justCameBackOnline } = useOnlineStatus();
  const onResumeRef = useRef(options?.onResume);
  const handleRef = useRef<{ remove: () => void } | null>(null);

  // Keep callback ref fresh without re-registering the listener
  useEffect(() => {
    onResumeRef.current = options?.onResume;
  }, [options?.onResume]);

  useEffect(() => {
    if (!isCapacitor()) return;

    let cancelled = false;

    const setup = async () => {
      try {
        const { App } = await import('@capacitor/app');
        if (cancelled) return;

        // Use the 'resume' event — fires when app returns to foreground
        const handle = await App.addListener('resume', () => {
          onResumeRef.current?.();

          // Dispatch event so other hooks (e.g., useOfflineQueue) can react
          if (navigator.onLine) {
            window.dispatchEvent(new CustomEvent('app-resumed-online'));
          }
        });

        handleRef.current = handle;
      } catch {
        // Capacitor plugin not available
      }
    };

    setup();

    return () => {
      cancelled = true;
      handleRef.current?.remove();
      handleRef.current = null;
    };
  }, []);

  // Also trigger when the device just came back online (e.g., briefly
  // lost connectivity in background, then regained it)
  useEffect(() => {
    if (isCapacitor() && justCameBackOnline) {
      onResumeRef.current?.();
    }
  }, [justCameBackOnline]);
}
