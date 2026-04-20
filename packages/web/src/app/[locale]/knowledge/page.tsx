'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { useRouter } from '@/i18n/navigation';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useTranslations } from 'next-intl';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VisualizationNode {
  id: string;
  label: string;
  bookId: string;
  bookTitle?: string;
  weight: number;
  group?: string;
}

interface VisualizationEdge {
  source: string;
  target: string;
  label: string;
  weight: number;
}

interface CrossBookTheme {
  concept: string;
  conceptId: string;
  bookIds: string[];
  bookTitles: string[];
  strength: number;
  relatedConcepts: string[];
}

// ---------------------------------------------------------------------------
// Force-directed graph (pure SVG, no D3 dependency)
// ---------------------------------------------------------------------------

interface SimNode extends VisualizationNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function runForceSimulation(
  nodes: SimNode[],
  edges: VisualizationEdge[],
  width: number,
  height: number,
  iterations = 120,
): void {
  const centerX = width / 2;
  const centerY = height / 2;

  // Build adjacency for quick lookup
  const edgeMap = new Map<string, string[]>();
  for (const e of edges) {
    const sList = edgeMap.get(e.source) || [];
    sList.push(e.target);
    edgeMap.set(e.source, sList);
    const tList = edgeMap.get(e.target) || [];
    tList.push(e.source);
    edgeMap.set(e.target, tList);
  }

  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 1 - iter / iterations;

    // Repulsion between all nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (200 * alpha) / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[i].vx -= fx;
        nodes[i].vy -= fy;
        nodes[j].vx += fx;
        nodes[j].vy += fy;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const source = nodes.find((n) => n.id === edge.source);
      const target = nodes.find((n) => n.id === edge.target);
      if (!source || !target) continue;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = dist * 0.01 * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      source.vx += fx;
      source.vy += fy;
      target.vx -= fx;
      target.vy -= fy;
    }

    // Center gravity
    for (const node of nodes) {
      node.vx += (centerX - node.x) * 0.001 * alpha;
      node.vy += (centerY - node.y) * 0.001 * alpha;
    }

    // Apply velocity with damping
    for (const node of nodes) {
      node.vx *= 0.6;
      node.vy *= 0.6;
      node.x += node.vx;
      node.y += node.vy;
      // Keep within bounds
      node.x = Math.max(40, Math.min(width - 40, node.x));
      node.y = Math.max(40, Math.min(height - 40, node.y));
    }
  }
}

// ---------------------------------------------------------------------------
// Color palette for groups
// ---------------------------------------------------------------------------

const GROUP_COLORS = [
  '#0d9488', // teal
  '#7c3aed', // violet
  '#ea580c', // orange
  '#2563eb', // blue
  '#dc2626', // red
  '#059669', // emerald
  '#d97706', // amber
  '#9333ea', // purple
];

function getColor(group?: string): string {
  if (!group) return GROUP_COLORS[0];
  const idx = group.charCodeAt(0) % GROUP_COLORS.length;
  return GROUP_COLORS[idx];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function KnowledgePage() {
  const t = useTranslations('knowledge');
  usePageTitle(t('page_title'));
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);

  const [nodes, setNodes] = useState<SimNode[]>([]);
  const [edges, setEdges] = useState<VisualizationEdge[]>([]);
  const [themes, setThemes] = useState<CrossBookTheme[]>([]);
  const [neo4jAvailable, setNeo4jAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<SimNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  // Fetch graph data
  useEffect(() => {
    async function load() {
      try {
        const [graphRes, themesRes] = await Promise.all([
          api.get<{ neo4jAvailable: boolean; nodes: VisualizationNode[]; edges: VisualizationEdge[] }>('/api/knowledge/graph'),
          api.get<{ neo4jAvailable: boolean; themes: CrossBookTheme[] }>('/api/knowledge/themes'),
        ]);

        const available = graphRes.data?.neo4jAvailable ?? false;
        setNeo4jAvailable(available);
        setThemes(themesRes.data?.themes ?? []);

        if (available && graphRes.data) {
          const rawNodes = graphRes.data.nodes || [];
          const rawEdges = graphRes.data.edges || [];

          // Convert to simulation nodes with random initial positions
          const simNodes: SimNode[] = rawNodes.map((n) => ({
            ...n,
            x: dimensions.width / 2 + (Math.random() - 0.5) * 300,
            y: dimensions.height / 2 + (Math.random() - 0.5) * 300,
            vx: 0,
            vy: 0,
          }));

          runForceSimulation(simNodes, rawEdges, dimensions.width, dimensions.height);
          setNodes(simNodes);
          setEdges(rawEdges);
        }
      } catch (err) {
        console.error('Failed to load knowledge graph:', err);
        setError(t('error_load'));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [dimensions.width, dimensions.height, t]);

  // Responsive SVG
  useEffect(() => {
    function handleResize() {
      if (svgRef.current?.parentElement) {
        const rect = svgRef.current.parentElement.getBoundingClientRect();
        setDimensions({ width: Math.floor(rect.width), height: Math.max(400, Math.floor(rect.width * 0.55)) });
      }
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
            onClick={() => { setError(null); setLoading(true); window.location.reload(); }}
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
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 text-sm text-gray-500 dark:text-gray-400">
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
        <div className="text-center max-w-md px-6">
          <div className="text-5xl mb-4">📚</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">{t('building_title')}</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {t('building_desc')}
          </p>
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
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Graph visualization */}
          <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="p-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('concept_map')}</span>
              <span className="text-xs text-gray-400">{t('click_hint')}</span>
            </div>
            {loading ? (
              <div className="flex items-center justify-center" style={{ height: dimensions.height }}>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
              </div>
            ) : (
              <svg
                ref={svgRef}
                width={dimensions.width}
                height={dimensions.height}
                viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
                className="w-full"
              >
                <defs>
                  <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
                    <polygon points="0 0, 6 2, 0 4" fill="#94a3b8" />
                  </marker>
                </defs>

                {/* Edges */}
                {edges.map((edge, i) => {
                  const source = nodes.find((n) => n.id === edge.source);
                  const target = nodes.find((n) => n.id === edge.target);
                  if (!source || !target) return null;

                  const isHighlighted = selectedNode && connectedEdges.includes(edge);
                  const isDimmed = selectedNode && !isHighlighted;

                  return (
                    <line
                      key={`edge-${i}`}
                      x1={source.x}
                      y1={source.y}
                      x2={target.x}
                      y2={target.y}
                      stroke={isDimmed ? '#e5e7eb' : isHighlighted ? '#0d9488' : '#cbd5e1'}
                      strokeWidth={isHighlighted ? 2 : 1}
                      strokeOpacity={isDimmed ? 0.3 : 0.7}
                      markerEnd={isHighlighted ? 'url(#arrowhead)' : undefined}
                    />
                  );
                })}

                {/* Nodes */}
                {nodes.map((node) => {
                  const isSelected = selectedNode?.id === node.id;
                  const isConnected = connectedNodeIds.has(node.id);
                  const isDimmed = selectedNode && !isConnected;
                  const radius = Math.max(6, Math.min(20, 6 + node.weight * 2));
                  const color = getColor(node.group);

                  return (
                    <g
                      key={node.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${node.label}${node.bookTitle ? ` from ${node.bookTitle}` : ''}`}
                      onClick={() => handleNodeClick(node)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleNodeClick(node); } }}
                      className="cursor-pointer"
                      opacity={isDimmed ? 0.3 : 1}
                    >
                      {isSelected && (
                        <circle cx={node.x} cy={node.y} r={radius + 4} fill="none" stroke={color} strokeWidth={2} strokeDasharray="4 2" />
                      )}
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={radius}
                        fill={color}
                        fillOpacity={0.85}
                        stroke="white"
                        strokeWidth={1.5}
                      />
                      <text
                        x={node.x}
                        y={node.y + radius + 14}
                        textAnchor="middle"
                        className="text-[10px] fill-gray-700 dark:fill-gray-300 pointer-events-none"
                        fontWeight="500"
                      >
                        {node.label.length > 16 ? node.label.slice(0, 15) + '…' : node.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Selected node details */}
            {selectedNode && (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{selectedNode.label}</h3>
                {selectedNode.bookTitle && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{t('from_label', { title: selectedNode.bookTitle })}</p>
                )}
                <div className="text-sm">
                  <span className="text-gray-500 dark:text-gray-400">{t('connections_label')} </span>
                  <span className="font-medium text-gray-900 dark:text-white">{connectedEdges.length}</span>
                </div>
                {connectedEdges.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {connectedEdges.map((e, i) => {
                      const otherId = e.source === selectedNode.id ? e.target : e.source;
                      const otherNode = nodes.find((n) => n.id === otherId);
                      return (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                          <span className="text-gray-600 dark:text-gray-400">{e.label}</span>
                          <span className="text-gray-900 dark:text-white font-medium">{otherNode?.label || otherId}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <button
                  onClick={() => setSelectedNode(null)}
                  aria-label={t('close_details')}
                  className="mt-3 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {t('deselect')}
                </button>
              </div>
            )}

            {/* Cross-book themes */}
            {themes.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">{t('cross_book_themes')}</h3>
                <div className="space-y-3">
                  {themes.slice(0, 8).map((theme) => (
                    <div key={theme.conceptId} className="flex items-start gap-2">
                      <div className="w-2 h-2 rounded-full bg-violet-500 mt-1.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{theme.concept}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t('found_in_books', { count: theme.bookTitles.length })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3">{t('legend_title')}</h3>
              <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-teal-500" />
                  {t('legend_weight')}
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-0.5 bg-gray-300 dark:bg-gray-700" />
                  {t('legend_connection')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
