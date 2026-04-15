'use client';

import { PageError } from '@/components/PageError';

export default function StatsError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageError
      {...props}
      title="Failed to load statistics"
      networkMessage="Could not load your reading stats. Please check your connection and try again."
      icon="chart"
    />
  );
}
