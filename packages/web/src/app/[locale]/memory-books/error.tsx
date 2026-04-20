'use client';

import { PageError } from '@/components/PageError';

export default function MemoryBooksError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageError
      {...props}
      title="Failed to load memory books"
      networkMessage="Could not load your memory books. Please check your connection and try again."
      icon="memory"
    />
  );
}
