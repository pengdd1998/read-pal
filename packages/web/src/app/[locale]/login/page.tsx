'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { LoadingSpinner } from '@/components/ui';
import { usePageTitle } from '@/hooks/usePageTitle';

function LoginRedirect() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  usePageTitle(t('page_title_login'));
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('mode', 'login');
    const next = searchParams.get('next');
    if (next) params.set('next', next);
    window.location.href = `/${locale}/auth?${params.toString()}`;
  }, [searchParams, locale]);

  return (
    <main className="min-h-[80vh] flex items-center justify-center">
      <div className="flex items-center gap-2 text-gray-500">
        <LoadingSpinner />
        {tc('loading')}
      </div>
    </main>
  );
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
