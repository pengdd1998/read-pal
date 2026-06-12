'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { API_BASE_URL } from '@/lib/api';

export const ApiQuickStart = React.memo(function ApiQuickStart() {
 const t = useTranslations('developers');
 const [apiBase, setApiBase] = useState('');

 useEffect(() => {
 setApiBase(API_BASE_URL || window.location.origin);
 }, []);

 return (
 <section>
  <h2 className="text-xl font-bold font-serif text-gray-900 mb-4">{t('quick_start')}</h2>
  <div className="bg-surface-0 rounded-xl border border-surface-3 p-6 space-y-4">
  <div>
   <h3 className="font-semibold text-gray-800 mb-2">{t('step1_title')}</h3>
   <p className="text-sm text-gray-600 dark:text-gray-400">
   {t('step1_desc', {
    link: t('step1_link'),
    code: 'rpk_',
   })}
   </p>
  </div>
  <div>
   <h3 className="font-semibold text-gray-800 mb-2">{t('step2_title')}</h3>
   <div className="bg-stone-900 rounded-lg p-4 text-sm font-mono overflow-x-auto">
   <div className="text-stone-400 mb-1">{t('step2_comment')}</div>
   <div className="text-green-400">
    curl -H &quot;Authorization: Bearer rpk_YOUR_KEY&quot; \
   </div>
   <div className="text-green-400 ml-6">
    {apiBase}/api/books
   </div>
   </div>
  </div>
  <div>
   <h3 className="font-semibold text-gray-800 mb-2">{t('step3_title')}</h3>
   <div className="bg-stone-900 rounded-lg p-4 text-sm font-mono overflow-x-auto">
   <div className="text-stone-400 mb-1">{t('step3_comment')}</div>
   <div className="text-green-400">
    curl -H &quot;Authorization: Bearer rpk_YOUR_KEY&quot; \
   </div>
   <div className="text-green-400 ml-6">
    {apiBase}/api/export/csv?type=annotations &gt; annotations.csv
   </div>
   </div>
  </div>
  </div>
 </section>
 );
});
