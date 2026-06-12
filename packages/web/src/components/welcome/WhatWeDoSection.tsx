'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

interface WhatWeDoSectionProps {
  visible: boolean;
}

const ITEMS = [
  { icon: 'book-open', titleKey: 'read_together', descKey: 'read_together_desc' },
  { icon: 'chat', titleKey: 'chat_ideas', descKey: 'chat_ideas_desc' },
  { icon: 'sprout', titleKey: 'build_knowledge', descKey: 'build_knowledge_desc' },
] as const;

function FeatureIcon({ type }: { type: string }) {
  const cls = 'w-5 h-5 text-amber-600 dark:text-amber-400';
  switch (type) {
    case 'book-open':
      return (
        <svg aria-hidden="true" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
      );
    case 'chat':
      return (
        <svg aria-hidden="true" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
        </svg>
      );
    case 'sprout':
      return (
        <svg aria-hidden="true" className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25m0 0c-2.25 0-4.5-1.5-4.5-4.5 0-3 4.5-6 4.5-6s4.5 3 4.5 6c0 3-2.25 4.5-4.5 4.5zm-6 3.75c0-3.75 2.25-6.75 6-10.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 8.25a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
        </svg>
      );
    default:
      return null;
  }
}

export const WhatWeDoSection = React.memo(function WhatWeDoSection({ visible }: WhatWeDoSectionProps) {
  const t = useTranslations('welcome');

  if (!visible) return null;

  return (
    <div
      className={`mt-8 transition-all duration-700 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      <div className="bg-surface-0 rounded-2xl border border-surface-3 p-6 text-left space-y-4">
        <h2 className="font-semibold text-lg text-center">{t('what_we_do_title')}</h2>
        {ITEMS.map((item) => (
          <div key={item.titleKey} className="flex items-start gap-3">
            <span className="mt-0.5"><FeatureIcon type={item.icon} /></span>
            <div>
              <div className="font-medium text-sm">{t(item.titleKey)}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{t(item.descKey)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
