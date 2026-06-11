'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

export const ApiRateLimits = React.memo(function ApiRateLimits() {
 const t = useTranslations('developers');

 return (
 <section>
  <h2 className="text-xl font-bold font-serif text-gray-900 mb-4">{t('rate_limits')}</h2>
  <div className="bg-surface-0 rounded-xl border border-surface-3 p-6 text-sm text-gray-700 space-y-3 overflow-x-auto">
  <table className="w-full text-left">
   <thead>
   <tr className="border-b border-surface-3">
    <th className="pb-2 font-semibold">{t('rate_group')}</th>
    <th className="pb-2 font-semibold">{t('rate_limit')}</th>
    <th className="pb-2 font-semibold">{t('rate_window')}</th>
   </tr>
   </thead>
   <tbody className="divide-y divide-gray-200">
   <tr><td className="py-2">{t('rate_ai_chat')}</td><td>10</td><td>{t('rate_minute')}</td></tr>
   <tr><td className="py-2">{t('rate_data_export')}</td><td>5</td><td>{t('rate_minute')}</td></tr>
   <tr><td className="py-2">{t('rate_zotero')}</td><td>5</td><td>{t('rate_minute')}</td></tr>
   <tr><td className="py-2">{t('rate_zotero_batch')}</td><td>2</td><td>{t('rate_5_minutes')}</td></tr>
   </tbody>
  </table>
  <p>{t('rate_headers_intro')}</p>
  <div className="bg-surface-2 rounded-lg p-3 font-mono text-xs">
   <div>X-RateLimit-Limit: 10</div>
   <div>X-RateLimit-Remaining: 7</div>
   <div>X-RateLimit-Reset: 1713456789</div>
   <div>Retry-After: 45 &nbsp;# only on 429 responses</div>
  </div>
  </div>
 </section>
 );
});
