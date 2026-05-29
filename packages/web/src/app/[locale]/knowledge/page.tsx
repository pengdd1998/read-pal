'use client';

import { useState, useCallback } from 'react';
import { useRouter } from '@/i18n/navigation';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useTranslations } from 'next-intl';
import { useKnowledgeGraph } from '@/hooks/useKnowledgeGraph';
import { KnowledgeGraph } from '@/components/knowledge/KnowledgeGraph';
import { NodeDetailPanel } from '@/components/knowledge/NodeDetailPanel';
import { CrossBookThemes } from '@/components/knowledge/CrossBookThemes';
import { KnowledgeGaps } from '@/components/knowledge/KnowledgeGaps';
import { KnowledgeLegend } from '@/components/knowledge/KnowledgeLegend';
import type { SimNode } from '@/types/knowledge';

export default function KnowledgePage() {
  const t = useTranslations('knowledge');
  usePageTitle(t('page_title'));
  const router = useRouter();

  const [selectedNode, setSelectedNode] = useState<SimNode | null>(null);

  const {
    nodes,
    edges,
    themes,
    gaps,
    neo4jAvailable,
    loading,
    error,
    dimensions,
    svgRef,
  } = useKnowledgeGraph(t('error_load'));

  const handleNodeClick = useCallback((node: SimNode) => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
  }, []);

  // Find connected edges for selected node
  const connectedEdges = selectedNode
    ? edges.filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
    : [];
  const connectedNodeIds = new Set([
    selectedNode?.id,
    ...connectedEdges.map((e) => (e.source === selectedNode?.id ? e.target : e.source)),
  ]);

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------
  if (!loading && error) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="text-5xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">{t('error_title')}</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => { window.location.reload(); }}
            className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-xl transition-colors text-sm"
          >
            {t('try_again')}
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Empty state — Neo4j not configured
  // ---------------------------------------------------------------------------
  if (!loading && !neo4jAvailable) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="text-5xl mb-4">🧠</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">{t('setup_title')}</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {t('setup_desc')}
          </p>
          <div className="bg-surface-0 rounded-xl border border-gray-200 dark:border-gray-800 p-4 text-sm text-gray-500 dark:text-gray-400">
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">{t('setup_required')}</p>
            <p>{t('setup_instructions')}</p>
          </div>
          <button
            onClick={() => router.push('/library')}
            className="mt-6 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {t('back_to_library')}
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Empty state — no data yet
  // ---------------------------------------------------------------------------
  if (!loading && neo4jAvailable && nodes.length === 0) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center max-w-lg px-6">
          {/* Decorative mini-graph preview */}
          <div className="mx-auto mb-6 w-48 h-36 relative opacity-30">
            <svg viewBox="0 0 200 140" className="w-full h-full">
              <line x1="60" y1="40" x2="120" y2="70" stroke="#94a3b8" strokeWidth="1.5" />
              <line x1="120" y1="70" x2="80" y2="110" stroke="#94a3b8" strokeWidth="1.5" />
              <line x1="60" y1="40" x2="150" y2="35" stroke="#94a3b8" strokeWidth="1.5" />
              <line x1="120" y1="70" x2="160" y2="100" stroke="#94a3b8" strokeWidth="1.5" />
              <line x1="80" y1="110" x2="40" y2="80" stroke="#94a3b8" strokeWidth="1.5" />
              <circle cx="60" cy="40" r="12" fill="#0d9488" opacity="0.6" />
              <circle cx="120" cy="70" r="16" fill="#7c3aed" opacity="0.6" />
              <circle cx="80" cy="110" r="10" fill="#ea580c" opacity="0.6" />
              <circle cx="150" cy="35" r="8" fill="#2563eb" opacity="0.6" />
              <circle cx="160" cy="100" r="10" fill="#059669" opacity="0.6" />
              <circle cx="40" cy="80" r="8" fill="#d97706" opacity="0.6" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">{t('building_title')}</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {t('building_desc')}
          </p>
          <div className="bg-surface-0 rounded-xl border border-gray-200 dark:border-gray-800 p-4 text-sm text-gray-500 dark:text-gray-400 mb-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                <span>{t('tip_highlight')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                <span>{t('tip_annotate')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                <span>{t('tip_chat')}</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => router.push('/library')}
            className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {t('start_reading')}
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main graph view
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-stone-50 dark:bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-surface-0">
        <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('header_title')}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('header_stats', { nodes: nodes.length, edges: edges.length })}
            </p>
          </div>
          <button
            onClick={() => router.push('/library')}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            {t('library_link')}
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Graph visualization */}
          <KnowledgeGraph
            ref={svgRef}
            nodes={nodes}
            edges={edges}
            selectedNode={selectedNode}
            connectedEdges={connectedEdges}
            connectedNodeIds={connectedNodeIds}
            dimensions={dimensions}
            loading={loading}
            onNodeClick={handleNodeClick}
            conceptMapLabel={t('concept_map')}
            clickHintLabel={t('click_hint')}
          />

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Selected node details */}
            {selectedNode && (
              <NodeDetailPanel
                node={selectedNode}
                connectedEdges={connectedEdges}
                allNodes={nodes}
                onDeselect={() => setSelectedNode(null)}
                t={t}
              />
            )}

            {/* Cross-book themes */}
            <CrossBookThemes themes={themes} t={t} />

            {/* Knowledge Gaps */}
            <KnowledgeGaps gaps={gaps} t={t} />

            {/* Legend */}
            <KnowledgeLegend t={t} />
          </div>
        </div>
      </div>
    </div>
  );
}
