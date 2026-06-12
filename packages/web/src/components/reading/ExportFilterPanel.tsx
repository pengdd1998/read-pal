'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { TYPE_OPTIONS } from './ExportPreviewModal.constants';

interface TypeFilterButtonProps {
 opt: { value: string; labelKey: string; color: string };
 isSelected: boolean;
 label: string;
 ariaLabel: string;
 value: string;
 onToggleType: (type: string) => void;
}

const TypeFilterButton = React.memo(function TypeFilterButton({ opt, isSelected, label, ariaLabel, value, onToggleType }: TypeFilterButtonProps) {
 return (
  <button type="button"
   onClick={() => onToggleType(value)}
   aria-pressed={isSelected}
   aria-label={ariaLabel}
   className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
   isSelected
    ? opt.color + ' ring-1 ring-current/20'
    : 'bg-surface-1 text-gray-500 dark:text-gray-400'
   }`}
  >
   {label}
  </button>
 );
});

interface ExportFilterPanelProps {
 selectedTypes: Set<string>;
 selectedTag: string;
 availableTags: string[];
 showFilters: boolean;
 hasActiveFilters: boolean;
 onToggleType: (type: string) => void;
 onSetSelectedTag: (tag: string) => void;
 onToggleShowFilters: () => void;
 onClearFilters: () => void;
}

export const ExportFilterPanel = React.memo(function ExportFilterPanel({
 selectedTypes,
 selectedTag,
 availableTags,
 showFilters,
 hasActiveFilters,
 onToggleType,
 onSetSelectedTag,
 onToggleShowFilters,
 onClearFilters,
}: ExportFilterPanelProps) {
 const t = useTranslations('reader');

 return (
 <div>
  <button type="button"
  onClick={onToggleShowFilters}
  aria-expanded={showFilters}
  aria-label={t('export_filters')}
  className={`flex items-center gap-2 text-xs font-medium transition-colors ${
   hasActiveFilters
   ? 'text-amber-600 dark:text-amber-400'
   : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
  }`}
  >
  <svg aria-hidden="true" className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
  {t('export_filters')} {hasActiveFilters ? `(${t('export_filters_active')})` : ''}
  </button>

  {showFilters && (
  <div className="mt-2 p-3 bg-surface-1 rounded-xl border border-surface-3 space-y-3">
   {/* Type filters */}
   <div>
   <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">{t('export_include_types')}</p>
   
	   <div className="flex flex-wrap gap-1.5">
	    {TYPE_OPTIONS.map((opt) => (
	    <TypeFilterButton
	     key={opt.value}
	     opt={opt}
	     isSelected={selectedTypes.has(opt.value)}
	     label={t(opt.labelKey)}
	     ariaLabel={t(opt.labelKey)}
	     value={opt.value}
	     onToggleType={onToggleType}
	    />
	    ))}
	   </div>
   </div>

   {/* Tag filter */}
   {availableTags.length > 0 && (
   <div>
    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">{t('export_filter_by_tag')}</p>
    <select
    value={selectedTag}
    onChange={(e) => onSetSelectedTag(e.target.value)}
    aria-label={t('export_filter_by_tag')}
    className="w-full px-3 py-1.5 text-xs bg-surface-0 border border-surface-3 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-400"
    >
    <option value="">{t('export_all_tags')}</option>
    {availableTags.map((tag) => (
     <option key={tag} value={tag}>{tag}</option>
    ))}
    </select>
   </div>
   )}

   {hasActiveFilters && (
   <button type="button"
    onClick={onClearFilters}
    aria-label={t('export_clear_filters_btn')}
    className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-400 focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
   >
    {t('export_clear_filters_btn')}
   </button>
   )}
  </div>
  )}
 </div>
 );
});
