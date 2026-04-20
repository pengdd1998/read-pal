'use client';

import { useEffect } from 'react';
import { usePathname } from '@/i18n/navigation';
import { analytics } from '@/lib/analytics';

/**
 * Minimal analytics initializer.
 *
 * - Calls analytics.page() on every route change.
 * - Associates subsequent events with the logged-in user (if any).
 * - Entirely inert when NEXT_PUBLIC_POSTHOG_KEY is not set.
 */
export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Track page views on route change
  useEffect(() => {
    analytics.page();
  }, [pathname]);

  // Identify user if already logged in
  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const user = JSON.parse(raw) as { id: string; email?: string; name?: string };
        if (user?.id) {
          analytics.identify(user.id, { email: user.email, name: user.name });
        }
      }
    } catch {
      // Ignore — non-critical
    }
  }, []);

  return <>{children}</>;
}
