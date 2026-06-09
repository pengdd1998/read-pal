'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function TermsPage() {
  const t = useTranslations('terms');
  usePageTitle(t('page_title'));
  const linkClass = 'text-amber-700 dark:text-amber-400 underline hover:text-amber-600';

  return (
    <div className="min-h-screen bg-surface-1">
      {/* Header */}
      <header className="bg-amber-800 dark:bg-amber-900 text-white">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <Link href="/dashboard" className="text-amber-200 hover:text-white text-sm mb-2 inline-block">
            &larr; {t('back_to_dashboard')}
          </Link>
          <h1 className="text-3xl font-bold font-serif">{t('page_title')}</h1>
          <p className="text-amber-200 mt-2">{t('last_updated')}</p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-10 text-gray-700 dark:text-gray-300 text-sm leading-relaxed">

        <section>
          <h2 className="text-lg font-bold font-serif text-gray-900 dark:text-gray-100 mb-3">{t('s1_title')}</h2>
          <p>{t('s1_body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-bold font-serif text-gray-900 dark:text-gray-100 mb-3">{t('s2_title')}</h2>
          <p>{t.rich('s2_body', {
            githubLink: (chunks) => (
              <a href="https://github.com/pengdd1998/read-pal" target="_blank" rel="noopener noreferrer" className={linkClass}>{chunks}</a>
            ),
          })}</p>
        </section>

        <section>
          <h2 className="text-lg font-bold font-serif text-gray-900 dark:text-gray-100 mb-3">{t('s3_title')}</h2>
          <p>{t('s3_body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-bold font-serif text-gray-900 dark:text-gray-100 mb-3">{t('s4_title')}</h2>
          <p>{t('s4_body')}</p>
          <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
            <li>{t('s4_item1')}</li>
            <li>{t('s4_item2')}</li>
            <li>{t('s4_item3')}</li>
            <li>{t('s4_item4')}</li>
            <li>{t('s4_item5')}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold font-serif text-gray-900 dark:text-gray-100 mb-3">{t('s5_title')}</h2>
          <p>{t.rich('s5_body', {
            mitLink: (chunks) => (
              <a href="https://opensource.org/licenses/MIT" target="_blank" rel="noopener noreferrer" className={linkClass}>{chunks}</a>
            ),
          })}</p>
        </section>

        <section>
          <h2 className="text-lg font-bold font-serif text-gray-900 dark:text-gray-100 mb-3">{t('s6_title')}</h2>
          <p>{t('s6_body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-bold font-serif text-gray-900 dark:text-gray-100 mb-3">{t('s7_title')}</h2>
          <p>{t('s7_body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-bold font-serif text-gray-900 dark:text-gray-100 mb-3">{t('s8_title')}</h2>
          <p>{t('s8_body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-bold font-serif text-gray-900 dark:text-gray-100 mb-3">{t('s9_title')}</h2>
          <p>{t('s9_body')}</p>
        </section>

        <section>
          <h2 className="text-lg font-bold font-serif text-gray-900 dark:text-gray-100 mb-3">{t('s10_title')}</h2>
          <p>{t.rich('s10_body', {
            issuesLink: (chunks) => (
              <a href="https://github.com/pengdd1998/read-pal/issues" target="_blank" rel="noopener noreferrer" className={linkClass}>{chunks}</a>
            ),
          })}</p>
        </section>

        <div className="pt-6 border-t border-surface-3">
          <Link href="/" className="text-amber-700 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 text-sm font-medium">
            &larr; {t('back_to_home')}
          </Link>
        </div>
      </div>
    </div>
  );
}
