'use client';

import { PageError } from '@/components/PageError';

export default function ChatError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageError
      {...props}
      title="Chat unavailable"
      networkMessage="Could not connect to the AI service. Please check your connection and try again."
      icon="chat"
    />
  );
}
