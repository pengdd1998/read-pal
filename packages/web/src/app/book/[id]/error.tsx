'use client';

import { PageError } from '@/components/PageError';

export default function BookDetailError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageError
      {...props}
      title="Failed to load book"
      networkMessage="Could not load this book's details. Please check your connection and try again."
      icon="book"
    />
  );
}
