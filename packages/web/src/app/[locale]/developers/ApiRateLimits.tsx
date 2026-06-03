'use client';

import { useTranslations } from 'next-intl';

export function ApiRateLimits() {
  const t = useTranslations('developers');

  return (
    <section>
      <h2 className="text-xl font-bold font-serif text-stone-900 dark:text-stone-100 mb-4">{t('rate_limits')}</h2>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-stone-200 dark:border-gray-700 p-6 text-sm text-stone-700 dark:text-stone-300 space-y-3 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-stone-200 dark:border-gray-700">
              <th className="pb-2 font-semibold">{t('rate_group')}</th>
              <th className="pb-2 font-semibold">{t('rate_limit')}</th>
              <th className="pb-2 font-semibold">{t('rate_window')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-gray-800">
            <tr><td className="py-2">{t('rate_ai_chat')}</td><td>10</td><td>{t('rate_minute')}</td></tr>
            <tr><td className="py-2">{t('rate_data_export')}</td><td>5</td><td>{t('rate_minute')}</td></tr>
            <tr><td className="py-2">{t('rate_zotero')}</td><td>5</td><td>{t('rate_minute')}</td></tr>
            <tr><td className="py-2">{t('rate_zotero_batch')}</td><td>2</td><td>{t('rate_5_minutes')}</td></tr>
          </tbody>
        </table>
        <p>{t('rate_headers_intro')}</p>
        <div className="bg-stone-100 dark:bg-gray-800 rounded-lg p-3 font-mono text-xs">
          <div>X-RateLimit-Limit: 10</div>
          <div>X-RateLimit-Remaining: 7</div>
          <div>X-RateLimit-Reset: 1713456789</div>
          <div>Retry-After: 45 &nbsp;# only on 429 responses</div>
        </div>
      </div>
    </section>
  );
}
