'use client';

import { useTranslations } from 'next-intl';
import { PageError } from '@/components/PageError';

export default function TermsError(props: { error: Error & { digest?: string }; reset: () => void }) {
 const t = useTranslations('errors');
 return (
 <PageError
  {...props}
  title={t('failed_load_page')}
  networkMessage={t('network_error')}
 />
 );
}
