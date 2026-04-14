'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // Check for updates on focus
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated') {
                // New SW activated — could notify user to refresh
              }
            });
          }
        });
      })
      .catch(() => {
        // SW registration failed — non-critical
      });
  }, []);

  return null;
}
