'use client';

import { useTranslations } from 'next-intl';

export function ApiResponseFormat() {
  const t = useTranslations('developers');

  return (
    <section>
      <h2 className="text-xl font-bold font-serif text-stone-900 dark:text-stone-100 mb-4">{t('response_format')}</h2>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-stone-200 dark:border-gray-700 p-6 text-sm text-stone-700 dark:text-stone-300 space-y-3">
        <p>{t('response_intro')}</p>
        <div className="bg-stone-900 rounded-lg p-4 font-mono text-xs overflow-x-auto">
          <div className="text-stone-400">{t('response_comment_success')}</div>
          <div className="text-green-400">{`{ "success": true, "data": { ... } }`}</div>
          <div className="text-stone-400 mt-2">{t('response_comment_error')}</div>
          <div className="text-red-400">{`{ "success": false, "error": { "code": "ERROR_CODE", "message": "Description" } }`}</div>
        </div>
        <p>{t('response_pagination', { code: 'pagination', code2: 'total', code3: 'page', code4: 'pageSize', code5: 'totalPages' })}</p>
      </div>
    </section>
  );
}
