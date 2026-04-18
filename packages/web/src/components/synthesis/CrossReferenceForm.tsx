'use client';

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
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Concept to cross-reference
        </label>
        <input
          type="text"
          value={concept}
          onChange={(e) => onConceptChange(e.target.value)}
          placeholder="e.g., cognitive bias, mindfulness, systems thinking"
          className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-1 focus:ring-amber-400/50 focus:border-amber-400 transition-all"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Analysis type
        </label>
        <div className="flex gap-1.5 flex-wrap">
          {(['all', 'supporting', 'contradicting', 'extending'] as const).map((t) => (
            <button
              key={t}
              onClick={() => onAnalysisTypeChange(t)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                analysisType === t
                  ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
