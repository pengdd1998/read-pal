'use client';

import { PageError } from '@/components/PageError';

export default function BookClubDetailError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageError
      {...props}
      title="Failed to load book club"
      networkMessage="Could not load this book club. Please check your connection and try again."
      icon="chat"
    />
  );
}
