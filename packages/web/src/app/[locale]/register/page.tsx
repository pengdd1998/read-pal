'use client';

import { useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { LoadingSpinner } from '@/components/ui';
import { usePageTitle } from '@/hooks/usePageTitle';

/**
 * Redirect /register to the unified /auth page (register mode).
 */
export default function RegisterPage() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  usePageTitle(t('page_title_register'));
  const locale = useLocale();

  useEffect(() => {
    window.location.href = `/${locale}/auth?mode=register`;
  }, [locale]);

  return (
    <main className="min-h-[80vh] flex items-center justify-center">
      <div className="flex items-center gap-2 text-gray-500">
        <LoadingSpinner />
        {tc('loading')}
      </div>
    </main>
  );
}
