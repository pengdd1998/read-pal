'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { endpoints, methodColor } from './api-constants';

export function ApiEndpointTable() {
  const t = useTranslations('developers');
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() =>
    filter
      ? endpoints.filter((e) =>
          e.path.toLowerCase().includes(filter.toLowerCase()) ||
          e.description.toLowerCase().includes(filter.toLowerCase())
        )
      : endpoints,
    [filter]
  );

  return (
    <section>
      <h2 className="text-xl font-bold font-serif text-stone-900 dark:text-stone-100 mb-4">{t('endpoints_title')}</h2>

      <input
        type="text"
        placeholder={t('endpoints_filter')}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        aria-label={t('endpoints_filter')}
        className="w-full px-4 py-2 border border-stone-300 dark:border-gray-600 rounded-lg text-sm mb-4 bg-white dark:bg-gray-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
      />

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-stone-200 dark:border-gray-700 divide-y divide-stone-100 dark:divide-gray-800">
        {filtered.length === 0 && (
          <div className="p-4 text-sm text-stone-500 dark:text-stone-400 text-center">{t('endpoints_no_match')}</div>
        )}
        {filtered.map((ep, i) => (
          <div key={i} className="px-4 py-3 flex items-center gap-3 hover:bg-stone-50 dark:hover:bg-gray-800">
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${methodColor(ep.method)}`}>
              {ep.method}
            </span>
            <code className="text-sm font-mono text-stone-800 dark:text-stone-200 flex-1">{ep.path}</code>
            <span className="text-xs text-stone-500 dark:text-stone-400">{ep.description}</span>
            {ep.auth && (
              <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded">{t('endpoints_auth_badge')}</span>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-stone-400 dark:text-stone-500 mt-2">{t('endpoints_count', { count: filtered.length })}</p>
    </section>
  );
}
