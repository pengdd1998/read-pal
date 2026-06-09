'use client';

import { useTranslations } from 'next-intl';

export function ApiAuthSection() {
 const t = useTranslations('developers');

 return (
 <section>
  <h2 className="text-xl font-bold font-serif text-gray-900 dark:text-gray-100 mb-4">{t('authentication')}</h2>
  <div className="bg-surface-0 rounded-xl border border-surface-3 p-6 space-y-3 text-sm text-gray-700 dark:text-gray-300">
  <p>{t('auth_intro', { code: 'Authorization' })}</p>
  <p><strong>{t('auth_methods')}</strong></p>
  <ul className="list-disc list-inside space-y-1 ml-2">
   <li><strong>{t('auth_jwt', { code: '/api/auth/login', code2: 'Bearer eyJ...' })}</strong></li>
   <li><strong>{t('auth_api_key', { code: 'Bearer rpk_...' })}</strong></li>
  </ul>
  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
   <strong>{t('auth_tip')}</strong>
  </div>
  </div>
 </section>
 );
}
