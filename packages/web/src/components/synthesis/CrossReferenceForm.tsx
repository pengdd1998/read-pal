'use client';

import { useTranslations } from 'next-intl';

// ============================================================================
// Cross-Reference Tab Form
// ============================================================================

interface CrossReferenceFormProps {
  concept: string;
  onConceptChange: (value: string) => void;
  analysisType: 'supporting' | 'contradicting' | 'extending' | 'all';
  onAnalysisTypeChange: (value: 'supporting' | 'contradicting' | 'extending' | 'all') => void;
}

export function CrossReferenceForm({
  concept,
  onConceptChange,
  analysisType,
  onAnalysisTypeChange,
}: CrossReferenceFormProps) {
  const t = useTranslations('reader');

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="concept-input" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          {t('synthesis_cross_ref_label')}
        </label>
        <input
          id="concept-input"
          type="text"
          value={concept}
          onChange={(e) => onConceptChange(e.target.value)}
          placeholder={t('synthesis_cross_ref_placeholder')}
          className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-1 focus:ring-amber-400/50 focus:border-amber-400 transition-all"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          {t('synthesis_analysis_type')}
        </label>
        <div className="flex gap-1.5 flex-wrap">
          {(['all', 'supporting', 'contradicting', 'extending'] as const).map((v) => (
            <button
              key={v}
              onClick={() => onAnalysisTypeChange(v)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                analysisType === v
                  ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {t('synthesis_type_' + v)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
