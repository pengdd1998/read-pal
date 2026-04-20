'use client';

import { PageError } from '@/components/PageError';

export default function AuthCallbackError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageError
      {...props}
      title="Login failed"
      networkMessage="Could not complete sign-in. Please check your connection and try again."
    />
  );
}
