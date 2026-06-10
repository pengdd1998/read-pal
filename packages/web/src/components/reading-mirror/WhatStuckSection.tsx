'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

interface StuckItem {
  concept: string;
  evidence: string;
}

interface SlippingItem {
  concept: string;
  tip: string;
}

interface WhatStuckSectionProps {
  data: Record<string, unknown>;
}

export default React.memo(function WhatStuckSection({ data }: WhatStuckSectionProps) {
  const t = useTranslations('readingMirror');
  const stuck = (data.stuck as StuckItem[]) || [];
  const slipping = (data.slipping as SlippingItem[]) || [];
  const retentionSummary = data.retention_summary as string | undefined;
  const topInsight = data.top_insight as string | undefined;

  if (stuck.length === 0 && slipping.length === 0) {
    return (
      <div className="py-8 text-center">
        <span className="text-2xl">🧠</span>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 italic">{t('no_retention_data')}</p>
      </div>
    );
  }

  return (
    <div className="py-8 space-y-6">
      {retentionSummary && (
        <p className="text-gray-600 dark:text-gray-400 text-base italic leading-relaxed max-w-[65ch]">
          {retentionSummary}
        </p>
      )}

      {/* Top insight callout */}
      {topInsight && (
        <div className="bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-900/20 dark:to-emerald-900/20 border border-teal-200 dark:border-teal-800/50 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-lg shrink-0">💡</span>
            <p className="text-gray-800 dark:text-gray-200 m-0 text-sm leading-relaxed font-medium">
              {topInsight}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* What stuck */}
        {stuck.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-3">
              {t('what_stuck')}
            </h4>
            <div className="space-y-2">
              {stuck.map((item, i) => (
                <div key={i} className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-lg p-3">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.concept}</span>
                  <p className="text-xs text-gray-600 dark:text-gray-400 m-0 mt-1 leading-relaxed">{item.evidence}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* What's slipping */}
        {slipping.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-3">
              {t('what_slipping')}
            </h4>
            <div className="space-y-2">
              {slipping.map((item, i) => (
                <div key={i} className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg p-3">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.concept}</span>
                  <p className="text-xs text-gray-600 dark:text-gray-400 m-0 mt-1 leading-relaxed">{item.tip}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
