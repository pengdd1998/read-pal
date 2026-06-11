'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useTranslations } from 'next-intl';
import { useKnowledgeGraph } from '@/hooks/useKnowledgeGraph';
import { KnowledgeGraph } from '@/components/knowledge/KnowledgeGraph';
import { NodeDetailPanel } from '@/components/knowledge/NodeDetailPanel';
import { CrossBookThemes } from '@/components/knowledge/CrossBookThemes';
import { KnowledgeGaps } from '@/components/knowledge/KnowledgeGaps';
import { KnowledgeLegend } from '@/components/knowledge/KnowledgeLegend';
import { KnowledgeErrorState } from '@/components/knowledge/KnowledgeErrorState';
import { KnowledgeNotConfigured } from '@/components/knowledge/KnowledgeNotConfigured';
import { KnowledgeEmptyState } from '@/components/knowledge/KnowledgeEmptyState';
import { KnowledgeSidebarSkeleton } from '@/components/knowledge/KnowledgeSidebarSkeleton';
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
    isAvailable,
    loading,
    error,
    dimensions,
    svgRef,
    refetch,
  } = useKnowledgeGraph(t('error_load'));

  // Refetch when tab regains focus
  useEffect(() => {
    function handleFocus() {
      refetch();
    }
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refetch]);

  const handleNodeClick = useCallback((node: SimNode) => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
  }, []);

  const connectedEdges = useMemo(
    () => selectedNode
      ? edges.filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
      : [],
    [selectedNode, edges],
  );
  const connectedNodeIds = useMemo(
    () => new Set([
      selectedNode?.id,
      ...connectedEdges.map((e) => (e.source === selectedNode?.id ? e.target : e.source)),
    ]),
    [selectedNode, connectedEdges],
  );

  const bookTitleMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of nodes) {
      if (n.bookId && n.bookTitle) m.set(n.bookId, n.bookTitle);
    }
    return m;
  }, [nodes]);

  // Error state
  if (!loading && error) {
    return (
      <KnowledgeErrorState
        errorTitle={t('error_title')}
        error={error}
        tryAgainLabel={t('try_again')}
        onRetry={refetch}
      />
    );
  }

  // Not configured state
  if (!loading && !isAvailable) {
    return (
      <KnowledgeNotConfigured
        setupTitle={t('setup_title')}
        setupDesc={t('setup_desc')}
        setupRequired={t('setup_required')}
        setupInstructions={t('setup_instructions')}
        backToLibraryLabel={t('back_to_library')}
      />
    );
  }

  // Empty state
  if (!loading && isAvailable && nodes.length === 0) {
    return (
      <KnowledgeEmptyState
        buildingTitle={t('building_title')}
        buildingDesc={t('building_desc')}
        tipHighlight={t('tip_highlight')}
        tipAnnotate={t('tip_annotate')}
        tipChat={t('tip_chat')}
        startReadingLabel={t('start_reading')}
      />
    );
  }

  // Main graph view
  return (
    <div className="min-h-screen bg-surface-1">
      {/* Header */}
      <div className="border-b border-surface-3 bg-surface-0">
        <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{t('header_title')}</h1>
            <p className="text-sm text-gray-500">
              {t('header_stats', { nodes: nodes.length, edges: edges.length })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/library')}
            className="text-sm text-gray-600 hover:text-gray-900 dark:hover:text-white transition-colors"
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
            {loading ? (
              <KnowledgeSidebarSkeleton />
            ) : (
              <>
                {selectedNode && (
                  <NodeDetailPanel
                    node={selectedNode}
                    connectedEdges={connectedEdges}
                    allNodes={nodes}
                    onDeselect={() => setSelectedNode(null)}
                    t={t}
                    bookTitleMap={bookTitleMap}
                  />
                )}
                <CrossBookThemes themes={themes} t={t} />
                <KnowledgeGaps gaps={gaps} t={t} />
                <KnowledgeLegend t={t} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
