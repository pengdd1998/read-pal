'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Redirect /register to the unified /auth page (register mode).
 */
export default function RegisterPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/auth?mode=register');
  }, [router]);

  return null;
}
