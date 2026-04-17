'use client';

import { PageError } from '@/components/PageError';

export default function ResetPasswordError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageError
      {...props}
      title="Password reset failed"
      networkMessage="Could not process your password reset. Please try again."
    />
  );
}
