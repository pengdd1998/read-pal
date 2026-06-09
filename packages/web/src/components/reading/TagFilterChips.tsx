'use client';

import React from 'react';

import { useTranslations } from 'next-intl';

interface TagFilterChipsProps {
 tags: string[];
 tagCounts: Record<string, number>;
 selectedTags: string[];
 onToggleTag: (tag: string) => void;
 onClearTags: () => void;
}

export const TagFilterChips = React.memo(function TagFilterChips({
 tags,
 tagCounts,
 selectedTags,
 onToggleTag,
 onClearTags,
}: TagFilterChipsProps) {
 const t = useTranslations('reader');

 if (tags.length === 0) return null;

 return (
 <div className="px-3 pt-2 pb-1">
  <div className="flex flex-wrap gap-1">
  {tags.slice(0, 8).map((tag) => (
   <button
   key={tag}
   onClick={() => onToggleTag(tag)}
   aria-pressed={selectedTags.includes(tag)}
   aria-label={selectedTags.includes(tag) ? t('sidebar_unfilter_tag', { tag }) : t('sidebar_filter_tag', { tag })}
   className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium transition-all duration-150 active:scale-95 focus-visible:ring-2 focus-visible:ring-amber-400 ${
    selectedTags.includes(tag)
    ? tag === 'discuss'
     ? 'bg-teal-500 text-white'
     : tag === 'important'
     ? 'bg-red-500 text-white'
     : tag === 'question'
     ? 'bg-blue-500 text-white'
     : 'bg-amber-500 text-white'
    : 'bg-surface-1 text-gray-500 dark:text-gray-400 hover:bg-surface-2'
   }`}
   >
   #{tag}
   <span className="ml-1 text-[9px] opacity-60">
    {tagCounts[tag]}
   </span>
   </button>
  ))}
  {selectedTags.length > 0 && (
   <button
   onClick={onClearTags}
   aria-label={t('sidebar_clear_all_tags')}
   className="px-1.5 py-0.5 rounded-full text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors focus-visible:ring-2 focus-visible:ring-amber-400"
   >
   {t('sidebar_clear')}
   </button>
  )}
  </div>
 </div>
 );
});