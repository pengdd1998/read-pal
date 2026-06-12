'use client';

import React from 'react';
import type { SimNode, VisualizationEdge } from '@/types/knowledge';

interface NodeDetailPanelProps {
 node: SimNode;
 connectedEdges: VisualizationEdge[];
 allNodes: SimNode[];
 onDeselect: () => void;
 t: (key: string, params?: Record<string, string | number>) => string;
 bookTitleMap?: Map<string, string>;
}

const TYPE_BADGE_CLASSES: Record<string, string> = {
 character: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
 theme: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
 location: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

const FRESHNESS_CLASSES: Record<string, string> = {
 fresh: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
 aging: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
 stale: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

function getTypeBadgeClass(type?: string): string {
 return TYPE_BADGE_CLASSES[type ?? ''] ?? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
}

function getFreshnessInfo(freshness: number): { label: string; colorClass: string } {
 if (freshness >= 0.7) return { label: 'freshness_fresh', colorClass: FRESHNESS_CLASSES.fresh };
 if (freshness >= 0.3) return { label: 'freshness_aging', colorClass: FRESHNESS_CLASSES.aging };
 return { label: 'freshness_stale', colorClass: FRESHNESS_CLASSES.stale };
}

export const NodeDetailPanel = React.memo(function NodeDetailPanel({ node, connectedEdges, allNodes, onDeselect, t, bookTitleMap }: NodeDetailPanelProps) {
 const nodeType = node.type || 'concept';
 const freshness = node.freshness ?? 1.0;
 const { label: freshnessLabel, colorClass: freshnessColorClass } = getFreshnessInfo(freshness);

 return (
 <div className="bg-surface-0 rounded-xl border border-surface-3 p-4">
  <div className="flex items-center gap-2 mb-2">
  <h3 className="font-semibold text-gray-900 dark:text-gray-100">{node.label}</h3>
  <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${getTypeBadgeClass(node.type)}`}>
   {nodeType}
  </span>
  </div>
  {node.bookTitle && (
  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{t('from_label', { title: node.bookTitle })}</p>
  )}
  {node.description && (
  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{node.description}</p>
  )}
  <div className="text-sm space-y-1">
  <div>
   <span className="text-gray-500 dark:text-gray-400">{t('connections_label')} </span>
   <span className="font-medium text-gray-900 dark:text-gray-100">{connectedEdges.length}</span>
  </div>
  {(node.annotationCount ?? 0) > 0 && (
   <div>
   <span className="text-gray-500 dark:text-gray-400">{t('annotation_count_label')} </span>
   <span className="font-medium text-gray-900 dark:text-gray-100">{node.annotationCount}</span>
   </div>
  )}
  <div>
   <span className="text-gray-500 dark:text-gray-400">{t('freshness_label')} </span>
   <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${freshnessColorClass}`}>
   {t(freshnessLabel)}
   </span>
  </div>
  </div>
  {node.sourceBookIds && node.sourceBookIds.length > 0 && (
  <div className="mt-2">
   <span className="text-xs text-gray-500 dark:text-gray-400">{t('source_books_label')}</span>
   <div className="flex flex-wrap gap-1 mt-1">
   {node.sourceBookIds.map((bid) => (
    <span key={bid} className="inline-block px-2 py-0.5 text-xs bg-surface-1 text-gray-600 dark:text-gray-400 rounded">
    {bookTitleMap?.get(bid) || bid.slice(0, 8) + '...'}
    </span>
   ))}
   </div>
  </div>
  )}
  {connectedEdges.length > 0 ? (
  <div className="mt-3 space-y-1.5">
   {connectedEdges.map((e) => {
   const otherId = e.source === node.id ? e.target : e.source;
   const otherNode = allNodes.find((n) => n.id === otherId);
   return (
    <div key={e.source + "-" + e.target + "-" + e.label} className="flex items-center gap-2 text-sm">
    <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
    <span className="text-gray-600 dark:text-gray-400">{e.label}</span>
    <span className="text-gray-900 dark:text-gray-100 font-medium">{otherNode?.label || otherId}</span>
    </div>
   );
   })}
  </div>
  ) : (
  <p className="mt-3 text-sm text-gray-400 dark:text-gray-500 italic">{t('no_connections')}</p>
  )}
  <button type="button"
  onClick={onDeselect}
  aria-label={t('close_details')}
  className="mt-3 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-400 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
  >
  {t('deselect')}
  </button>
 </div>
 );
});
