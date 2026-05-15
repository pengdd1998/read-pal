'use client';

import { useTranslations } from 'next-intl';
import { PageError } from '@/components/PageError';

export default function LibraryError(props: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('library');
  return (
    <PageError
      {...props}
      title={t('failed_load_library')}
      networkMessage={t('failed_connect_server')}
      icon="book"
    />
  );
}
