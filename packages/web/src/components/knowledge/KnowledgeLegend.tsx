'use client';

import React from 'react';

interface KnowledgeLegendProps {
 t: (key: string, params?: Record<string, string | number>) => string;
}

export const KnowledgeLegend = React.memo(function KnowledgeLegend({ t }: KnowledgeLegendProps) {
 return (
 <div className="bg-surface-0 rounded-xl border border-surface-3 p-4">
  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">{t('legend_title')}</h3>
  <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
  <div className="flex items-center gap-2">
   <div className="w-3 h-3 rounded-full bg-teal-500" />
   {t('legend_weight')}
  </div>
  <div className="flex items-center gap-2">
   <div className="w-6 h-0.5 bg-surface-3" />
   {t('legend_connection')}
  </div>
  <div className="flex items-center gap-2">
   <div className="flex gap-1">
   <div className="w-3 h-3 rounded-full bg-teal-500" />
   <div className="w-3 h-3 rounded-full bg-teal-500 opacity-60" />
   <div className="w-3 h-3 rounded-full bg-teal-500 opacity-35" />
   </div>
   {t('legend_freshness')}
  </div>
  </div>
 </div>
 );
});
