'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import {
  type ExportFormat,
  FORMATS,
  CATEGORIES,
} from '../ExportPreviewModal.constants';

interface FormatButtonProps {
 f: { value: ExportFormat; label: string; description: string; category: string };
 isActive: boolean;
 label: string;
 description: string;
 onFormatChange: (format: ExportFormat) => void;
}

const FormatButton = React.memo(function FormatButton({ f, isActive, label, description, onFormatChange }: FormatButtonProps) {
 return (
  <button type="button"
   onClick={() => onFormatChange(f.value)}
   aria-label={`${label} - ${description}`}
   className={`text-left px-3 py-2.5 rounded-xl border transition-all focus-visible:ring-2 focus-visible:ring-amber-400/50 ${
    isActive
     ? 'border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-400/30'
     : 'border-surface-3 hover:border-surface-3'
   }`}
  >
   <span className="text-sm font-medium text-gray-900">{label}</span>
   <span className="block text-xs text-gray-500 mt-0.5">{description}</span>
  </button>
 );
});

interface ExportFormatSelectorProps {
  format: ExportFormat;
  onFormatChange: (format: ExportFormat) => void;
}

export const ExportFormatSelector = React.memo(function ExportFormatSelector({
  format,
  onFormatChange,
}: ExportFormatSelectorProps) {
  const t = useTranslations('reader');

  return (
    <>
      {CATEGORIES.map((cat) => {
        const items = FORMATS.filter((f) => f.category === cat.key);
        return (
          <div key={cat.key}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">
              {t(cat.labelKey)}
            </p>
            
	            <div className="grid grid-cols-2 gap-2">
	              {items.map((f) => (
	                <FormatButton
	                  key={f.value}
	                  f={f}
	                  isActive={format === f.value}
	                  label={t(f.label)}
	                  description={t(f.description)}
	                  onFormatChange={onFormatChange}
	                />
	              ))}
	            </div>
          </div>
        );
      })}
    </>
  );
});
