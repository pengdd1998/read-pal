'use client';

import { useEffect, useState, useCallback } from 'react';

export function ServiceWorkerRegistrar() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  const handleUpdate = useCallback(() => {
    if (registration?.waiting) {
      // Tell the waiting service worker to activate immediately
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    // Reload the page to activate the new service worker
    window.location.reload();
  }, [registration]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        setRegistration(reg);

        // If there's already a waiting worker, an update is available right away
        if (reg.waiting) {
          setUpdateAvailable(true);
          return;
        }

        // Listen for new service workers being installed
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version installed and an old SW is controlling the page
              setUpdateAvailable(true);
            }
          });
        });

        // Check for updates when the tab gains focus
        const onFocus = () => {
          reg.update().catch(() => {
            // Update check failed — non-critical
          });
        };
        window.addEventListener('focus', onFocus);

        return () => {
          window.removeEventListener('focus', onFocus);
        };
      })
      .catch(() => {
        // SW registration failed — non-critical
      });

    // Listen for the controlling service worker changing (after SKIP_WAITING)
    const onControllerChange = () => {
      // The new SW has taken control — reload to use fresh assets
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 max-w-xs animate-fade-in">
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
        A new version of read-pal is available.
      </p>
      <button
        onClick={handleUpdate}
        className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors"
      >
        Update now
      </button>
    </div>
  );
}
