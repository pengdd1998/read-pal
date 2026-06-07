'use client';

import { useTranslations } from 'next-intl';

// ============================================================================
// Synthesize Tab Form
// ============================================================================

interface SynthesizeFormProps {
 query: string;
 onQueryChange: (value: string) => void;
 depth: 'brief' | 'standard' | 'deep';
 onDepthChange: (value: 'brief' | 'standard' | 'deep') => void;
}

export function SynthesizeForm({
 query,
 onQueryChange,
 depth,
 onDepthChange,
}: SynthesizeFormProps) {
 const t = useTranslations('reader');

 return (
 <div className="space-y-3">
  <div>
  <label htmlFor="synthesis-query" className="block text-xs font-medium text-gray-600 mb-1">
   {t('synthesis_query_label')}
  </label>
  <textarea
   id="synthesis-query"
   value={query}
   onChange={(e) => onQueryChange(e.target.value)}
   placeholder={t('synthesis_query_placeholder')}
   rows={3}
   className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-surface-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-1 focus:ring-amber-400/50 focus:border-amber-400 transition-all resize-none"
  />
  </div>
  <div>
  <label className="block text-xs font-medium text-gray-600 mb-1">
   {t('synthesis_depth_label')}
  </label>
  <div className="flex gap-1.5">
   {(['brief', 'standard', 'deep'] as const).map((d) => (
   <button
    key={d}
    onClick={() => onDepthChange(d)}
    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
    depth === d
     ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
     : 'bg-gray-100 text-gray-500'
    }`}
   >
    {t('synthesis_depth_' + d)}
   </button>
   ))}
  </div>
  </div>
 </div>
 );
}
