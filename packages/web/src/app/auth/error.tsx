'use client';

import { PageError } from '@/components/PageError';

export default function AuthError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageError
      {...props}
      title="Authentication error"
      networkMessage="Could not reach the authentication server. Please try again."
    />
  );
}
