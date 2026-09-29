'use client';

import { useTranslations } from 'next-intl';

export default function Loading() {
  const t = useTranslations('common');
  return (
    <div className="min-h-[70vh] flex items-center justify-center animate-fade-in">
      <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" role="status" aria-label={t('loading')} />
    </div>
  );
}
