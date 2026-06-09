'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

interface WhatWeDoSectionProps {
  visible: boolean;
}

const ITEMS = [
  { icon: '📖', titleKey: 'read_together', descKey: 'read_together_desc' },
  { icon: '💬', titleKey: 'chat_ideas', descKey: 'chat_ideas_desc' },
  { icon: '🌱', titleKey: 'build_knowledge', descKey: 'build_knowledge_desc' },
] as const;

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
            <span className="text-xl mt-0.5">{item.icon}</span>
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
