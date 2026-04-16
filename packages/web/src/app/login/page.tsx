'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Redirect /login to the unified /auth page (login mode).
 * Preserves the ?next= query param for post-login redirect.
 */
export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('mode', 'login');
    const next = searchParams.get('next');
    if (next) params.set('next', next);
    router.replace(`/auth?${params.toString()}`);
  }, [router, searchParams]);

  return null;
}
