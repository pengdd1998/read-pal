'use client';

import { PageError } from '@/components/PageError';

export default function FlashcardsError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageError
      {...props}
      title="Failed to load flashcards"
      networkMessage="Could not load your flashcards. Please check your connection and try again."
      icon="memory"
    />
  );
}
