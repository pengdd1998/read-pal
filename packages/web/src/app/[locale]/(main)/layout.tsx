import { AuthProvider } from '@/components/AuthProvider';
import { AppShell } from '@/components/shared/AppShell';
import { ServiceWorkerRegistrar } from '@/components/shared/ServiceWorkerRegistrar';
import { NetworkStatus } from '@/components/shared/NetworkStatus';
import { AnalyticsProvider } from '@/components/shared/AnalyticsProvider';

/**
 * Product shell (P-H standalone split): every product page renders inside
 * the app framework — auth context, analytics, PWA registrar, network
 * banner, and the AppShell header. The ops console (/ops) deliberately
 * lives OUTSIDE this group: standalone layout, ops-key-only auth, no
 * product chrome. URLs are unchanged — route groups are path-invisible.
 */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AnalyticsProvider>
        <ServiceWorkerRegistrar />
        <NetworkStatus />
        <AppShell>{children}</AppShell>
      </AnalyticsProvider>
    </AuthProvider>
  );
}
