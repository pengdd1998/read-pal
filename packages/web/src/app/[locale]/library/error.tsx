'use client';

import { PageError } from '@/components/PageError';

export default function LibraryError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageError
      {...props}
      title="Failed to load library"
      networkMessage="Could not reach the server. Your books are safe — please check your connection and try again."
      icon="book"
    />
  );
}
