'use client';

import { PageError } from '@/components/PageError';

export default function SearchError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageError
      {...props}
      title="Search unavailable"
      networkMessage="Could not search right now. Please check your connection and try again."
      icon="search"
    />
  );
}
