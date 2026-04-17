'use client';

import { PageError } from '@/components/PageError';

export default function BookClubsError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageError
      {...props}
      title="Failed to load book clubs"
      networkMessage="Could not load your book clubs. Please check your connection and try again."
      icon="chat"
    />
  );
}
