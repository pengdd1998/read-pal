'use client';

import { PageError } from '@/components/PageError';

export default function KnowledgeError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageError
      {...props}
      title="Failed to load knowledge graph"
      networkMessage="Could not load your knowledge graph. Please check your connection and try again."
      icon="search"
    />
  );
}
