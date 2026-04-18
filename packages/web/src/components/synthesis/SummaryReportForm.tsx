'use client';

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
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Focus area (optional)
        </label>
        <input
          type="text"
          value={focus}
          onChange={(e) => onFocusChange(e.target.value)}
          placeholder="e.g., leadership themes, scientific method"
          className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-1 focus:ring-amber-400/50 focus:border-amber-400 transition-all"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Report format
        </label>
        <div className="flex gap-1.5">
          {(['structured', 'narrative', 'academic'] as const).map((f) => (
            <button
              key={f}
              onClick={() => onReportFormatChange(f)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                reportFormat === f
                  ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
