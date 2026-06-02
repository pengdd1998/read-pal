import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

const secondaryLinkClass =
  'inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors';

export default async function NotFound() {
  const t = await getTranslations('common');
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center px-4">
        <h1 className="text-5xl font-bold">404</h1>
        <h2 className="mt-4 text-xl font-semibold">{t('not_found_title')}</h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400 max-w-md mx-auto">
          {t('not_found_desc')}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
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
