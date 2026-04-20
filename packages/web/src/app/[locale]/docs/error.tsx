'use client';

import { PageError } from '@/components/PageError';

export default function DocsError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageError
      {...props}
      title="Failed to load documentation"
      networkMessage="Could not load the documentation. Please check your connection and try again."
      icon="book"
    />
  );
}
