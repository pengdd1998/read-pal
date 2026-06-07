'use client';

import { useTranslations } from 'next-intl';

interface AnnotationSearchBarProps {
 value: string;
 onChange: (value: string) => void;
}

export function AnnotationSearchBar({ value, onChange }: AnnotationSearchBarProps) {
 const t = useTranslations('reader');

 return (
 <div className="px-3 pt-3 pb-1">
  <input
  type="text"
  value={value}
  onChange={(e) => onChange(e.target.value)}
  placeholder={t('sidebar_search_annotations')}
  aria-label={t('sidebar_search_annotations')}
  className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-surface-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-1 focus:ring-amber-400/50 focus:border-amber-400 transition-all"
  />
 </div>
 );
}
