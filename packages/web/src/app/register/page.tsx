'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePageTitle } from '@/hooks/usePageTitle';

/**
 * Redirect /register to the unified /auth page (register mode).
 */
export default function RegisterPage() {
  usePageTitle('Create Account');
  const router = useRouter();

  useEffect(() => {
    router.replace('/auth?mode=register');
  }, [router]);

  return null;
}
