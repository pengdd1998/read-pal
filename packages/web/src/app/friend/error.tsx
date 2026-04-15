'use client';

import { PageError } from '@/components/PageError';

export default function FriendError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageError
      {...props}
      title="Failed to load reading friend"
      networkMessage="Could not connect to your reading friend. Please check your connection and try again."
      icon="friend"
    />
  );
}
