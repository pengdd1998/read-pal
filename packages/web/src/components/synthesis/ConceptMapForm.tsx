'use client';

import { useTranslations } from 'next-intl';

// ============================================================================
// Concept Map Tab Form
// ============================================================================

interface ConceptMapFormProps {
 topic: string;
 onTopicChange: (value: string) => void;
}

export function ConceptMapForm({
 topic,
 onTopicChange,
}: ConceptMapFormProps) {
 const t = useTranslations('reader');

 return (
 <div className="space-y-3">
  <div>
  <label htmlFor="topic-input" className="block text-xs font-medium text-gray-600 mb-1">
   {t('synthesis_concept_map_label')}
  </label>
  <input
   id="topic-input"
   type="text"
   value={topic}
   onChange={(e) => onTopicChange(e.target.value)}
   placeholder={t('synthesis_concept_map_placeholder')}
   className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-surface-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-1 focus:ring-amber-400/50 focus:border-amber-400 transition-all"
  />
  </div>
 </div>
 );
}
