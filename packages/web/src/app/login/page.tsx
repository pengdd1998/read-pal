'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui';

function LoginRedirect() {
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

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="min-h-[80vh] flex items-center justify-center">
        <LoadingSpinner />
      </main>
    }>
      <LoginRedirect />
    </Suspense>
  );
}
