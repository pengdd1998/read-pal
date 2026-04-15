'use client';

import { PageError } from '@/components/PageError';

export default function DashboardError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageError
      {...props}
      title="Failed to load dashboard"
      networkMessage="Could not load your dashboard. Please check your connection and try again."
      icon="chart"
    />
  );
}
