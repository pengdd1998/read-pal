'use client';

import React from 'react';

import { useTranslations } from 'next-intl';

type FilterTab = 'all' | 'highlight' | 'note' | 'bookmark';

const TAB_KEYS: FilterTab[] = ['all', 'highlight', 'note', 'bookmark'];
const TAB_LABEL_KEYS: Record<FilterTab, string> = {
 all: 'sidebar_all',
 highlight: 'sidebar_highlights',
 note: 'sidebar_notes',
 bookmark: 'sidebar_bookmarks',
};

interface FilterTabsProps {
 activeTab: FilterTab;
 counts: Record<FilterTab, number>;
 onTabChange: (tab: FilterTab) => void;
}

export const FilterTabs = React.memo(function FilterTabs({ activeTab, counts, onTabChange }: FilterTabsProps) {
 const t = useTranslations('reader');

 return (
 <div role="tablist" aria-label={t('sidebar_annotations')} className="flex border-b border-surface-3 px-2">
  {TAB_KEYS.map((tab) => (
  <button
   key={tab}
   onClick={() => onTabChange(tab)}
   role="tab"
   aria-selected={activeTab === tab}
   className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors relative focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none ${
   activeTab === tab
    ? 'text-primary-600 dark:text-primary-400'
    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
   }`}
  >
   {t(TAB_LABEL_KEYS[tab])}
   {counts[tab] > 0 && ' '}
   {counts[tab] > 0 && (
   <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${
    activeTab === tab
    ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400'
    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
   }`}>
    {counts[tab]}
   </span>
   )}
   {activeTab === tab && (
   <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary-500 rounded-full" />
   )}
  </button>
  ))}
 </div>
 );
});

export type { FilterTab };
export { TAB_KEYS };