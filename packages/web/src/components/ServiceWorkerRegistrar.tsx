'use client';

import { useEffect, useState, useCallback } from 'react';
import { isCapacitor } from '@/lib/capacitor';

export function ServiceWorkerRegistrar() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  const handleUpdate = useCallback(() => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  }, [registration]);

  useEffect(() => {
    // Skip service worker in Capacitor — native handles caching
    if (isCapacitor()) return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        setRegistration(reg);

        if (reg.waiting) {
          setUpdateAvailable(true);
          return;
        }

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setUpdateAvailable(true);
            }
          });
        });

        // Check for updates when the tab gains focus
        const onFocus = () => {
          reg.update().catch(() => {});
        };
        window.addEventListener('focus', onFocus);

        return () => {
          window.removeEventListener('focus', onFocus);
        };
      })
      .catch(() => {});

    const onControllerChange = () => {
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    // Listen for SW messages (book cached, sync results)
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'BOOK_CACHED') {
        // Dispatch for any interested components
        window.dispatchEvent(new CustomEvent('book-cached', {
          detail: event.data,
        }));
      }
      if (event.data?.type === 'SYNC_COMPLETE') {
        window.dispatchEvent(new CustomEvent('offline-sync-complete', {
          detail: event.data,
        }));
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      navigator.serviceWorker.removeEventListener('message', onMessage);
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
