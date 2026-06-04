'use client';

import { useTranslations } from 'next-intl';
import { TYPE_OPTIONS } from './ExportPreviewModal.constants';

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

export function ExportFilterPanel({
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
      <button
        onClick={onToggleShowFilters}
        className={`flex items-center gap-2 text-xs font-medium transition-colors ${
          hasActiveFilters
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
        }`}
      >
        <svg className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {t('export_filters')} {hasActiveFilters ? `(${t('export_filters_active')})` : ''}
      </button>

      {showFilters && (
        <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
          {/* Type filters */}
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">{t('export_include_types')}</p>
            <div className="flex flex-wrap gap-1.5">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onToggleType(opt.value)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    selectedTypes.has(opt.value)
                      ? opt.color + ' ring-1 ring-current/20'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
                  }`}
                >
                  {t(opt.labelKey)}
                </button>
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
                className="w-full px-3 py-1.5 text-xs bg-surface-0 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
              >
                <option value="">{t('export_all_tags')}</option>
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </div>
          )}

          {hasActiveFilters && (
            <button
              onClick={onClearFilters}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              {t('export_clear_filters_btn')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
