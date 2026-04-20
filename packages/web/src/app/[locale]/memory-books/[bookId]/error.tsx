'use client';

import { PageError } from '@/components/PageError';

export default function MemoryBookDetailError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageError
      {...props}
      title="Failed to load memory book"
      networkMessage="Could not load this memory book. Please check your connection and try again."
      icon="memory"
    />
  );
}
