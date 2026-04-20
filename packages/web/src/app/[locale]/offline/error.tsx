'use client';

import { PageError } from '@/components/PageError';

export default function OfflineError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageError
      {...props}
      title="Failed to load offline queue"
      networkMessage="Could not load the offline queue. Please try again."
      icon="book"
    />
  );
}
