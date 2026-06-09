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
   t(e.descriptionKey).toLowerCase().includes(filter.toLowerCase())
  )
  : endpoints,
 [filter, t]
 );

 return (
 <section>
  <h2 className="text-xl font-bold font-serif text-gray-900 dark:text-gray-100 mb-4">{t('endpoints_title')}</h2>

  <input
  type="text"
  placeholder={t('endpoints_filter')}
  value={filter}
  onChange={(e) => setFilter(e.target.value)}
  aria-label={t('endpoints_filter')}
  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm mb-4 bg-surface-0 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
  />

  <div className="bg-surface-0 rounded-xl border border-surface-3 divide-y divide-surface-2">
  {filtered.length === 0 && (
   <div className="p-4 text-sm text-gray-500 dark:text-gray-400 text-center">{t('endpoints_no_match')}</div>
  )}
  {filtered.map((ep, i) => (
   <div key={ep.method + "-" + ep.path} className="px-4 py-3 flex items-center gap-3 hover:bg-surface-1">
   <span className={`px-2 py-0.5 rounded text-xs font-bold ${methodColor(ep.method)}`}>
    {ep.method}
   </span>
   <code className="text-sm font-mono text-gray-800 dark:text-gray-200 flex-1">{ep.path}</code>
   <span className="text-xs text-gray-500 dark:text-gray-400">{t(ep.descriptionKey)}</span>
   {ep.auth && (
    <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded">{t('endpoints_auth_badge')}</span>
   )}
   </div>
  ))}
  </div>
  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{t('endpoints_count', { count: filtered.length })}</p>
 </section>
 );
}
