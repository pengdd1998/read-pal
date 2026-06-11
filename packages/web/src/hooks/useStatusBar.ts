'use client';

import { useEffect } from 'react';
import { isCapacitor } from '@/lib/capacitor';
import { warn } from '@/lib/logger';

type StatusBarStyle = 'LIGHT' | 'DARK';

/**
 * Configures the native status bar when running inside Capacitor.
 * Lazy-loads `@capacitor/status-bar` to avoid bundling in web mode.
 *
 * @param style  - 'LIGHT' (dark text) or 'DARK' (light text)
 * @param backgroundColor - hex color for the status bar background (e.g. '#fefdfb')
 */
export function useStatusBar(
  style: StatusBarStyle = 'LIGHT',
  backgroundColor: string = '#fefdfb',
) {
  useEffect(() => {
    if (!isCapacitor()) return;

    let cancelled = false;

    (async () => {
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        if (cancelled) return;

        await StatusBar.setStyle({
          style: style === 'LIGHT' ? Style.Light : Style.Dark,
        });

        await StatusBar.setBackgroundColor({ color: backgroundColor });

        // Make the status bar visible (overlay content) so safe-area padding works
        await StatusBar.setOverlaysWebView({ overlay: true });
      } catch (err) {
        warn('useStatusBar: failed to set status bar style', err);
      }
    })();

    return () => { cancelled = true; };
  }, [style, backgroundColor]);
}
