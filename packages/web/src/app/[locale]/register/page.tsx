'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { usePageTitle } from '@/hooks/usePageTitle';

/**
 * Redirect /register to the unified /auth page (register mode).
 */
export default function RegisterPage() {
  const t = useTranslations('auth');
  usePageTitle(t('page_title_register'));
  const router = useRouter();

  useEffect(() => {
    router.replace('/auth?mode=register');
  }, [router]);

  return null;
}
