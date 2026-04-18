'use client';

import { AnalysisResult } from './types';

// ============================================================================
// Analysis Result View (shared across all tabs)
// ============================================================================

interface AnalysisResultViewProps {
  result: AnalysisResult;
}

export function AnalysisResultView({ result }: AnalysisResultViewProps) {
  const content = result.analysis || result.synthesis || result.report || result.summary || '';
  const textContent = typeof content === 'string' ? content : '';

  return (
    <div className="space-y-4">
      {/* Themes */}
      {result.themes && result.themes.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Key Themes
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {result.themes.map((theme, i) => (
              <span
                key={i}
                className="inline-flex items-center px-2 py-1 rounded-lg text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 border border-amber-200/50 dark:border-amber-800/30"
              >
                {theme.name}
                <span className="ml-1.5 text-[10px] opacity-50">
                  {Math.round(theme.strength * 100)}%
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Insights */}
      {result.insights && result.insights.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Key Insights
          </h4>
          <ul className="space-y-1.5">
            {result.insights.map((insight, i) => (
              <li key={i} className="text-xs text-gray-700 dark:text-gray-300 pl-3 border-l-2 border-teal-400">
                {insight}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Cross-references */}
      {result.references && result.references.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            References Found
          </h4>
          <div className="space-y-2">
            {result.references.map((ref, i) => (
              <div key={i} className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    ref.type === 'supporting'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : ref.type === 'contradicting'
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                        : ref.type === 'extending'
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                  }`}>
                    {ref.type}
                  </span>
                  <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                    {ref.book.title}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2">
                  {ref.explanation}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contradictions */}
      {result.contradictions && result.contradictions.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Contradictions ({result.contradictions.length})
          </h4>
          <div className="space-y-2">
            {result.contradictions.map((c, i) => (
              <div key={i} className="p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                    c.severity === 'high'
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                      : c.severity === 'medium'
                        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  }`}>
                    {c.severity}
                  </span>
                  <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                    {c.topic}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700">
                    <p className="font-medium text-gray-700 dark:text-gray-300 mb-0.5">{c.position1.book.title}</p>
                    <p className="text-gray-500 dark:text-gray-400 line-clamp-3">{c.position1.claim}</p>
                  </div>
                  <div className="p-2 rounded bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700">
                    <p className="font-medium text-gray-700 dark:text-gray-300 mb-0.5">{c.position2.book.title}</p>
                    <p className="text-gray-500 dark:text-gray-400 line-clamp-3">{c.position2.claim}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Concept Map */}
      {result.nodes && result.nodes.length > 0 && (
        <ConceptMapView result={result} />
      )}

      {/* Report meta */}
      {result.booksCovered !== undefined && (
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            {result.booksCovered} book{result.booksCovered !== 1 ? 's' : ''} covered
          </span>
        </div>
      )}

      {/* Main analysis text */}
      {textContent && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Analysis
          </h4>
          <div className="prose prose-sm dark:prose-invert max-w-none text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 max-h-[400px] overflow-y-auto">
            {textContent}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Concept Map Sub-view
// ============================================================================

function ConceptMapView({ result }: { result: AnalysisResult }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
        Concept Map ({result.nodes?.length || 0} nodes, {result.edges?.length || 0} edges)
      </h4>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {result.nodes?.map((node) => (
          <span
            key={node.id}
            className={`inline-flex items-center px-2 py-1 rounded-lg text-xs border ${
              node.type === 'concept'
                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 border-blue-200/50 dark:border-blue-800/30'
                : node.type === 'book'
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border-green-200/50 dark:border-green-800/30'
                  : node.type === 'theme'
                    ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-800 dark:text-purple-200 border-purple-200/50 dark:border-purple-800/30'
                    : 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 border-amber-200/50 dark:border-amber-800/30'
            }`}
          >
            {node.label}
            <span className="ml-1 text-[9px] opacity-40">{node.type}</span>
          </span>
        ))}
      </div>
      {result.edges && result.edges.length > 0 && (
        <div className="space-y-1">
          {result.edges.slice(0, 15).map((edge, i) => (
            <div key={i} className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <span className="truncate max-w-[80px]">{edge.source}</span>
              <svg className="w-3 h-3 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
              <span className="text-amber-600 dark:text-amber-400 truncate">{edge.label}</span>
              <svg className="w-3 h-3 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
              <span className="truncate max-w-[80px]">{edge.target}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
