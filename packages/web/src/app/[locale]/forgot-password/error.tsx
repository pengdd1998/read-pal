'use client';

import { PageError } from '@/components/PageError';

export default function ForgotPasswordError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageError
      {...props}
      title="Failed to load page"
      networkMessage="Could not load the password reset page. Please check your connection and try again."
      icon="book"
    />
  );
}
