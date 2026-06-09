'use client';

import { useTranslations } from 'next-intl';

// ============================================================================
// Contradictions Tab Form
// ============================================================================

interface ContradictionsFormProps {
 topic: string;
 onTopicChange: (value: string) => void;
 minSeverity: 'low' | 'medium' | 'high';
 onMinSeverityChange: (value: 'low' | 'medium' | 'high') => void;
}

export function ContradictionsForm({
 topic,
 onTopicChange,
 minSeverity,
 onMinSeverityChange,
}: ContradictionsFormProps) {
 const t = useTranslations('reader');

 return (
 <div className="space-y-3">
  <div>
  <label htmlFor="topic-input" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
   {t('synthesis_contradictions_topic')}
  </label>
  <input
   id="topic-input"
   type="text"
   value={topic}
   onChange={(e) => onTopicChange(e.target.value)}
   placeholder={t('synthesis_contradictions_placeholder')}
   className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-surface-3 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:ring-1 focus:ring-amber-400/50 focus:border-amber-400 transition-all"
  />
  </div>
  <div>
  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
   {t('synthesis_min_severity')}
  </label>
  <div className="flex gap-1.5">
   {(['low', 'medium', 'high'] as const).map((s) => (
   <button
    key={s}
    onClick={() => onMinSeverityChange(s)}
    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 ${
    minSeverity === s
     ? s === 'high'
     ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
     : s === 'medium'
      ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
      : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
     : 'bg-surface-1 text-gray-500 dark:text-gray-400'
    }`}
   >
    {t('synthesis_severity_' + s)}
   </button>
   ))}
  </div>
  </div>
 </div>
 );
}
