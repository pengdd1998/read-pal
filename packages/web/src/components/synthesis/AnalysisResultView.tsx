'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { AnalysisResult } from './types';

// ============================================================================
// Extracted memo components for .map() items
// ============================================================================

const ThemeChip = React.memo(function ThemeChip({ name, strength }: { name: string; strength: number }) {
  return (
    <span
      className="inline-flex items-center px-2 py-1 rounded-lg text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 border border-amber-200/50 dark:border-amber-800/30"
    >
      {name}
      <span className="ml-1.5 text-[10px] opacity-50">
        {Math.round(strength * 100)}%
      </span>
    </span>
  );
});

const InsightItem = React.memo(function InsightItem({ insight }: { insight: string }) {
  return (
    <li className="text-xs text-gray-700 dark:text-gray-300 pl-3 border-l-2 border-teal-400">
      {insight}
    </li>
  );
});

const ReferenceItem = React.memo(function ReferenceItem({ ref: refData, t }: {
  ref: { book: { title: string }; type: string; explanation: string };
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <div className="p-2.5 rounded-lg bg-surface-1 border border-surface-3">
      <div className="flex items-center gap-2 mb-1">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
          refData.type === 'supporting'
            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
            : refData.type === 'contradicting'
              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
              : refData.type === 'extending'
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'bg-surface-1 text-gray-600 dark:text-gray-400'
        }`}>
          {t(`ref_${refData.type}`, { defaultValue: refData.type })}
        </span>
        <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
          {refData.book.title}
        </span>
      </div>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2">
        {refData.explanation}
      </p>
    </div>
  );
});

const ContradictionItem = React.memo(function ContradictionItem({ c, t }: {
  c: {
    topic: string;
    severity: string;
    position1: { book: { title: string }; claim: string };
    position2: { book: { title: string }; claim: string };
  };
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <div className="p-2.5 rounded-lg border border-surface-3 bg-surface-1">
      <div className="flex items-center gap-2 mb-2">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
          c.severity === 'high'
            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
            : c.severity === 'medium'
              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
              : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
        }`}>
          {t(`severity_${c.severity}`, { defaultValue: c.severity })}
        </span>
        <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
          {c.topic}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
        <div className="p-2 rounded bg-surface-0 border border-gray-100 dark:border-gray-700">
          <p className="font-medium text-gray-700 dark:text-gray-300 mb-0.5">{c.position1.book.title}</p>
          <p className="text-gray-500 dark:text-gray-400 line-clamp-3">{c.position1.claim}</p>
        </div>
        <div className="p-2 rounded bg-surface-0 border border-gray-100 dark:border-gray-700">
          <p className="font-medium text-gray-700 dark:text-gray-300 mb-0.5">{c.position2.book.title}</p>
          <p className="text-gray-500 dark:text-gray-400 line-clamp-3">{c.position2.claim}</p>
        </div>
      </div>
    </div>
  );
});

const ConceptNodeChip = React.memo(function ConceptNodeChip({ node, t }: {
  node: { id: string; label: string; type: string };
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <span
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
      <span className="ml-1 text-[9px] opacity-40">{t(`node_${node.type}`, { defaultValue: node.type })}</span>
    </span>
  );
});

const EdgeRow = React.memo(function EdgeRow({ edge }: {
  edge: { source: string; target: string; label: string };
}) {
  return (
    <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
      <span className="truncate max-w-[80px]">{edge.source}</span>
      <svg aria-hidden="true" className="w-3 h-3 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
      </svg>
      <span className="text-amber-600 dark:text-amber-400 truncate">{edge.label}</span>
      <svg aria-hidden="true" className="w-3 h-3 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
      </svg>
      <span className="truncate max-w-[80px]">{edge.target}</span>
    </div>
  );
});

// ============================================================================
// Analysis Result View (shared across all tabs)
// ============================================================================

interface AnalysisResultViewProps {
  result: AnalysisResult;
}

export const AnalysisResultView = React.memo(function AnalysisResultView({ result }: AnalysisResultViewProps) {
  const t = useTranslations('synthesis');
  const content = result.analysis || result.synthesis || result.report || result.summary || '';
  const textContent = typeof content === 'string' ? content : '';

  return (
    <div className="space-y-4">
      {/* Themes */}
      {result.themes && result.themes.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            {t('key_themes')}
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {result.themes.map((theme) => (
              <ThemeChip key={theme.name} name={theme.name} strength={theme.strength} />
            ))}
          </div>
        </div>
      )}

      {/* Insights */}
      {result.insights && result.insights.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            {t('key_insights')}
          </h4>
          <ul className="space-y-1.5">
            {result.insights.map((insight) => (
              <InsightItem key={insight} insight={insight} />
            ))}
          </ul>
        </div>
      )}

      {/* Cross-references */}
      {result.references && result.references.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            {t('references_found')}
          </h4>
          <div className="space-y-2">
            {result.references.map((ref) => (
              <ReferenceItem key={ref.book.title + '-' + ref.type} ref={ref} t={t} />
            ))}
          </div>
        </div>
      )}

      {/* Contradictions */}
      {result.contradictions && result.contradictions.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            {t('contradictions_count', { count: result.contradictions.length })}
          </h4>
          <div className="space-y-2">
            {result.contradictions.map((c) => (
              <ContradictionItem key={c.topic} c={c} t={t} />
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
            <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            {t('books_covered', { count: result.booksCovered })}
          </span>
        </div>
      )}

      {/* Main analysis text */}
      {textContent && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            {t('analysis_label')}
          </h4>
          <div className="prose prose-sm dark:prose-invert max-w-none text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed bg-surface-1 rounded-lg p-3 border border-surface-3 max-h-[400px] overflow-y-auto">
            {textContent}
          </div>
        </div>
      )}
    </div>
  );
});

// ============================================================================
// Concept Map Sub-view
// ============================================================================

const ConceptMapView = React.memo(function ConceptMapView({ result }: { result: AnalysisResult }) {
  const t = useTranslations('synthesis');
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
        {t('concept_map_label', { nodes: result.nodes?.length || 0, edges: result.edges?.length || 0 })}
      </h4>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {result.nodes?.map((node) => (
          <ConceptNodeChip key={node.id} node={node} t={t} />
        ))}
      </div>
      {result.edges && result.edges.length > 0 && (
        <div className="space-y-1">
          {result.edges.slice(0, 15).map((edge) => (
            <EdgeRow key={edge.source + '-' + edge.target} edge={edge} />
          ))}
        </div>
      )}
    </div>
  );
});
