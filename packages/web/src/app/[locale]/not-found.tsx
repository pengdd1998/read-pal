'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

const secondaryLinkClass =
  'inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors';

export default function NotFound() {
  const t = useTranslations('common');
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center px-4">
        <h1 className="text-5xl font-bold">404</h1>
        <h2 className="mt-4 text-xl font-semibold">{t('not_found_title')}</h2>
        <p className="mt-2 text-gray-600 max-w-md mx-auto">
          {t('not_found_desc')}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            {t('back_to_home')}
          </Link>
          <Link href="/library" className={secondaryLinkClass}>
            {t('go_to_library')}
          </Link>
          <Link href="/dashboard" className={secondaryLinkClass}>
            {t('go_to_dashboard')}
          </Link>
        </div>
      </div>
    </div>
  );
}
