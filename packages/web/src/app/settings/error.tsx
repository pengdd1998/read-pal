'use client';

import { PageError } from '@/components/PageError';

export default function SettingsError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageError
      {...props}
      title="Failed to load settings"
      networkMessage="Could not load your settings. Please check your connection and try again."
      icon="warning"
    />
  );
}
