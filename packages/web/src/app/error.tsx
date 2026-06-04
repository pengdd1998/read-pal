'use client';

import { PageError } from '@/components/PageError';

export default function GlobalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageError
      {...props}
    />
  );
}
