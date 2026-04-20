'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { LoadingSpinner } from '@/components/ui';
import { usePageTitle } from '@/hooks/usePageTitle';

function LoginRedirect() {
  const t = useTranslations('auth');
  usePageTitle(t('page_title_login'));
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
