'use client';

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
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Topic for concept map
        </label>
        <input
          type="text"
          value={topic}
          onChange={(e) => onTopicChange(e.target.value)}
          placeholder="e.g., decision making, human behavior"
          className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-1 focus:ring-amber-400/50 focus:border-amber-400 transition-all"
        />
      </div>
    </div>
  );
}
