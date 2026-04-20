'use client';

import { PageError } from '@/components/PageError';

export default function DevelopersError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageError
      {...props}
      title="Failed to load developer docs"
      networkMessage="Could not load the developer documentation. Please check your connection and try again."
      icon="chart"
    />
  );
}
