'use client';

import { useTranslations } from 'next-intl';
import { PageError } from '@/components/PageError';

export default function ErrorPage(props: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('errors');
  return (
    <PageError
      {...props}
      title={t('login_failed')}
      networkMessage={t('network_login')}
    />
  );
}
