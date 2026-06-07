'use client';

import { useTranslations } from 'next-intl';

// ============================================================================
// Summary Report Tab Form
// ============================================================================

interface SummaryReportFormProps {
 focus: string;
 onFocusChange: (value: string) => void;
 reportFormat: 'narrative' | 'structured' | 'academic';
 onReportFormatChange: (value: 'narrative' | 'structured' | 'academic') => void;
}

export function SummaryReportForm({
 focus,
 onFocusChange,
 reportFormat,
 onReportFormatChange,
}: SummaryReportFormProps) {
 const t = useTranslations('reader');

 return (
 <div className="space-y-3">
  <div>
  <label htmlFor="focus-input" className="block text-xs font-medium text-gray-600 mb-1">
   {t('synthesis_report_focus')}
  </label>
  <input
   id="focus-input"
   type="text"
   value={focus}
   onChange={(e) => onFocusChange(e.target.value)}
   placeholder={t('synthesis_report_placeholder')}
   className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-surface-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-1 focus:ring-amber-400/50 focus:border-amber-400 transition-all"
  />
  </div>
  <div>
  <label className="block text-xs font-medium text-gray-600 mb-1">
   {t('synthesis_report_format')}
  </label>
  <div className="flex gap-1.5">
   {(['structured', 'narrative', 'academic'] as const).map((f) => (
   <button
    key={f}
    onClick={() => onReportFormatChange(f)}
    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
    reportFormat === f
     ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
     : 'bg-gray-100 text-gray-500'
    }`}
   >
    {t('synthesis_format_' + f)}
   </button>
   ))}
  </div>
  </div>
 </div>
 );
}
