'use client';

import { useState, useEffect } from 'react';

export function NetworkStatus() {
  const [offline, setOffline] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Initial state
    setOffline(!navigator.onLine);

    const goOffline = () => {
      setOffline(true);
      setShowBanner(true);
    };
    const goOnline = () => {
      setOffline(false);
      setShowBanner(true);
      // Auto-hide "back online" after 3s
      setTimeout(() => setShowBanner(false), 3000);
    };

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!showBanner) return null;

  return (
    <div
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-sm font-medium shadow-lg transition-all duration-300 ${
        offline
          ? 'bg-red-500/90 text-white'
          : 'bg-emerald-500/90 text-white'
      }`}
      onClick={() => setShowBanner(false)}
      role="status"
    >
      {offline ? (
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-white/60" />
          Offline — changes saved locally
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          Back online
        </span>
      )}
    </div>
  );
}
