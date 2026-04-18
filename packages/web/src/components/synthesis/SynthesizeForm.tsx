'use client';

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
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Synthesis query
        </label>
        <textarea
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="e.g., How do these books approach decision making?"
          rows={3}
          className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-1 focus:ring-amber-400/50 focus:border-amber-400 transition-all resize-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Depth
        </label>
        <div className="flex gap-1.5">
          {(['brief', 'standard', 'deep'] as const).map((d) => (
            <button
              key={d}
              onClick={() => onDepthChange(d)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                depth === d
                  ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
              }`}
            >
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
