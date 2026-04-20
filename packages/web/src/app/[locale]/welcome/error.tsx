'use client';

import { PageError } from '@/components/PageError';

export default function WelcomeError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageError
      {...props}
      title="Something went wrong"
      networkMessage="Could not complete onboarding. Please check your connection and try again."
    />
  );
}
