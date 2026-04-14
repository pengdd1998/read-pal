'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface GraphNode {
  id: string;
  label: string;
  type: 'concept' | 'book' | 'theme';
  bookIds?: string[];
  x: number;
  y: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

interface CrossBookTheme {
  theme: string;
  books: string[];
  connections: number;
  strength: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

function getNodePosition(index: number, total: number) {
  const angle = (2 * Math.PI * index) / total - Math.PI / 2;
  return {
    x: Math.max(10, Math.min(90, 50 + 35 * Math.cos(angle))),
    y: Math.max(10, Math.min(90, 50 + 30 * Math.sin(angle))),
  };
}

/** Simple force-directed layout for better graph positioning */
function forceDirectedLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  iterations = 60,
): GraphNode[] {
  if (nodes.length < 2) return nodes;

  const positioned = nodes.map((n) => ({
    ...n,
    x: 50 + (Math.random() - 0.5) * 40,
    y: 50 + (Math.random() - 0.5) * 40,
  }));

  const nodeMap = new Map(positioned.map((n) => [n.id, n]));

  for (let iter = 0; iter < iterations; iter++) {
    const temp = 0.1 * (1 - iter / iterations); // Cooling

    // Repulsion between all nodes
    for (let i = 0; i < positioned.length; i++) {
      for (let j = i + 1; j < positioned.length; j++) {
        const a = positioned[i];
        const b = positioned[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
        const force = 200 / (dist * dist);
        const fx = (dx / dist) * force * temp;
        const fy = (dy / dist) * force * temp;
        a.x += fx;
        a.y += fy;
        b.x -= fx;
        b.y -= fy;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const src = nodeMap.get(edge.source);
      const tgt = nodeMap.get(edge.target);
      if (!src || !tgt) continue;
      const dx = tgt.x - src.x;
      const dy = tgt.y - src.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
      const force = (dist - 25) * 0.01 * temp;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      src.x += fx;
      src.y += fy;
      tgt.x -= fx;
      tgt.y -= fy;
    }

    // Center gravity
    for (const n of positioned) {
      n.x += (50 - n.x) * 0.01 * temp;
      n.y += (50 - n.y) * 0.01 * temp;
      n.x = Math.max(8, Math.min(92, n.x));
      n.y = Math.max(8, Math.min(92, n.y));
    }
  }

  return positioned;
}

function circularLayout(nodes: GraphNode[]): GraphNode[] {
  if (nodes.length < 2) return nodes;
  return nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    return {
      ...n,
      x: 50 + 38 * Math.cos(angle),
      y: 50 + 38 * Math.sin(angle),
    };
  });
}

function hierarchicalLayout(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  if (nodes.length < 2) return nodes;

  // Find root nodes (book nodes or nodes with no incoming edges)
  const targetIds = new Set(edges.map((e) => e.target));
  const roots = nodes.filter((n) => !targetIds.has(n.id));
  const nonRoots = nodes.filter((n) => targetIds.has(n.id));

  const layers: GraphNode[][] = [];
  if (roots.length > 0) {
    layers.push(roots);
  } else if (nodes.length > 0) {
    layers.push([nodes[0]]);
  } else {
    return [];
  }

  // BFS to assign layers
  const assigned = new Set(layers[0].map((n) => n.id));
  let remaining = nonRoots.filter((n) => !assigned.has(n.id));

  while (remaining.length > 0 && layers.length < 10) {
    const nextLayer = remaining.filter((n) => {
      return edges.some(
        (e) => (e.target === n.id && assigned.has(e.source)) ||
               (e.source === n.id && assigned.has(e.target))
      );
    });

    if (nextLayer.length === 0) {
      // Place remaining nodes in the last layer
      layers.push(remaining);
      break;
    }

    layers.push(nextLayer);
    nextLayer.forEach((n) => assigned.add(n.id));
    remaining = remaining.filter((n) => !assigned.has(n.id));
  }

  const totalLayers = layers.length;
  const result: GraphNode[] = [];

  for (let layerIdx = 0; layerIdx < totalLayers; layerIdx++) {
    const layer = layers[layerIdx];
    const y = 10 + (80 * layerIdx) / Math.max(1, totalLayers - 1);
    for (let i = 0; i < layer.length; i++) {
      const x = 10 + (80 * i) / Math.max(1, layer.length - 1);
      result.push({ ...layer[i], x: layer.length === 1 ? 50 : x, y });
    }
  }

  return result;
}

function applyLayout(nodes: GraphNode[], edges: GraphEdge[], mode: string): GraphNode[] {
  switch (mode) {
    case 'circular':
      return circularLayout(nodes);
    case 'hierarchical':
      return hierarchicalLayout(nodes, edges);
    case 'force':
    default:
      return forceDirectedLayout(nodes, edges);
  }
}

function getNodeColor(type: string) {
  if (type === 'book') return '#d97706';
  if (type === 'theme') return '#14b8a6';
  return '#f59e0b';
}

function getNodeSize(type: string) {
  return type === 'theme' ? 20 : type === 'book' ? 16 : 12;
}

const STAT_ITEMS = ['Concepts', 'Connections', 'Books', 'Themes'] as const;

interface AnnotationItem {
  bookId?: string;
  book_id?: string;
  type: string;
  content: string;
  color?: string;
  note?: string;
}

export default function KnowledgePage() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [themes, setThemes] = useState<CrossBookTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'graph' | 'list' | 'themes'>('list');
  const [layoutMode, setLayoutMode] = useState<'force' | 'circular' | 'hierarchical'>('force');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [layoutNodes, setLayoutNodes] = useState<GraphNode[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadKnowledgeData() {
      try {
        // Step 1: Try backend knowledge graph API (Neo4j-powered)
        const [graphRes, conceptsRes, themesRes] = await Promise.all([
          api.get<{ neo4jAvailable: boolean; nodes: GraphNode[]; edges: GraphEdge[] }>('/api/knowledge/graph').catch(() => ({ success: false, data: null as unknown })),
          api.get<{ neo4jAvailable: boolean; concepts: { id: string; name: string; type: string; bookIds?: string[] }[] }>('/api/knowledge/concepts').catch(() => ({ success: false, data: null as unknown })),
          api.get<{ neo4jAvailable: boolean; themes: { theme: string; books: string[]; connections: number; strength: number }[] }>('/api/knowledge/themes').catch(() => ({ success: false, data: null as unknown })),
        ]);

        // If Neo4j is available and returned data, use it directly
        const graphData = (graphRes as { success?: boolean; data?: unknown }).data as { neo4jAvailable?: boolean; nodes?: GraphNode[]; edges?: GraphEdge[] } | null;
        const conceptsData = (conceptsRes as { success?: boolean; data?: unknown }).data as { neo4jAvailable?: boolean; concepts?: { id: string; name: string; type: string; bookIds?: string[] }[] } | null;
        const themesData = (themesRes as { success?: boolean; data?: unknown }).data as { neo4jAvailable?: boolean; themes?: { theme: string; books: string[]; connections: number; strength: number }[] } | null;

        if (graphData?.neo4jAvailable && graphData.nodes && graphData.nodes.length > 0) {
          if (cancelled) return;
          const positionedNodes = graphData.nodes.map((n, i) => ({
            ...n,
            x: n.x ?? getNodePosition(i, graphData.nodes!.length).x,
            y: n.y ?? getNodePosition(i, graphData.nodes!.length).y,
          }));
          setNodes(positionedNodes);
          setEdges(graphData.edges || []);
          setThemes(themesData?.themes || []);
          setLayoutNodes(applyLayout(positionedNodes, graphData.edges || [], "force"));
          setLoading(false);
          return;
        }

        // Step 2: Fallback — derive graph from annotations + concepts
        const [annotationsRes, booksRes] = await Promise.all([
          api.get<AnnotationItem[]>('/api/annotations', { limit: 100 }),
          api.get<{ id: string; title?: string }[]>('/api/books'),
        ]);

        if (cancelled) return;

        const annotations = annotationsRes.data || [];
        const books = booksRes.data || [];

        if (annotations.length === 0) {
          setLoading(false);
          return;
        }

        // Build book lookup
        const bookMap = new Map(books.map((b) => [b.id, b.title || 'Untitled']));

        // Group annotations by book
        const bookGroups = new Map<string, { title: string; count: number; types: Set<string> }>();
        for (const a of annotations) {
          const bookId = a.bookId || a.book_id || '';
          const existing = bookGroups.get(bookId) || { title: bookMap.get(bookId) || 'Unknown', count: 0, types: new Set() };
          existing.count++;
          existing.types.add(a.type);
          bookGroups.set(bookId, existing);
        }

        // Build graph nodes from books
        const graphNodes: GraphNode[] = [];
        const graphEdges: GraphEdge[] = [];
        let idx = 0;

        for (const [bookId, group] of bookGroups) {
          graphNodes.push({
            id: bookId,
            label: group.title,
            type: 'book',
            ...getNodePosition(idx, bookGroups.size),
          });
          idx++;
        }

        // Add concept nodes from knowledge graph if available
        if (conceptsData?.concepts) {
          for (const concept of conceptsData.concepts) {
            graphNodes.push({
              id: concept.id || `concept-${idx}`,
              label: concept.name,
              type: 'concept',
              ...getNodePosition(idx, bookGroups.size + conceptsData.concepts.length),
            });
            if (concept.bookIds) {
              for (const bookId of concept.bookIds) {
                graphEdges.push({ source: concept.id || `concept-${idx}`, target: bookId, type: 'related to' });
              }
            }
            idx++;
          }
        }

        // Extract color-based themes from highlights
        const colorGroups = new Map<string, { books: Set<string>; count: number }>();
        for (const a of annotations) {
          if (a.color) {
            const existing = colorGroups.get(a.color) || { books: new Set(), count: 0 };
            existing.books.add(a.bookId || a.book_id || '');
            existing.count++;
            colorGroups.set(a.color, existing);
          }
        }

        // Add theme nodes for colors shared across books
        const crossBookThemes: CrossBookTheme[] = [];
        const colorNames: Record<string, string> = {
          '#FFEB3B': 'Important Ideas',
          '#FF9800': 'Questions & Wonders',
          '#4CAF50': 'Key Insights',
          '#2196F3': 'Connections',
          '#9C27B0': 'Creative Thoughts',
          '#F44336': 'Critical Points',
        };

        for (const [color, group] of colorGroups) {
          if (group.books.size > 1) {
            const themeName = colorNames[color] || `Theme (${color})`;
            graphNodes.push({
              id: `theme-${color}`,
              label: themeName,
              type: 'theme',
              ...getNodePosition(idx, bookGroups.size + colorGroups.size),
            });
            idx++;

            for (const bookId of group.books) {
              graphEdges.push({ source: `theme-${color}`, target: bookId, type: 'shared highlight' });
            }

            crossBookThemes.push({
              theme: themeName,
              books: Array.from(group.books).map((id) => bookMap.get(id) || 'Unknown'),
              connections: group.count,
              strength: Math.min(1, group.count / 10),
            });
          }
        }

        // Use backend themes if available and richer
        const finalThemes = themesData?.themes && themesData.themes.length > 0
          ? themesData.themes.map((t) => ({
              theme: t.theme,
              books: t.books,
              connections: t.connections,
              strength: t.strength,
            }))
          : crossBookThemes;

        setNodes(graphNodes);
        setEdges(graphEdges);
        setThemes(finalThemes);
        setLayoutNodes(applyLayout(graphNodes, graphEdges, "force"));
      } catch {
        if (!cancelled) setError('Failed to load knowledge data. Please try again later.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadKnowledgeData();
    return () => { cancelled = true; };
  }, []);

  // Re-apply layout when mode changes
  useEffect(() => {
    if (nodes.length > 0) {
      setLayoutNodes(applyLayout(nodes, edges, layoutMode));
    }
  }, [layoutMode, nodes, edges]);

  // SVG export
  const svgRef = useRef<SVGSVGElement>(null);

  const exportSVG = useCallback(() => {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'knowledge-graph.svg';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const exportPNG = useCallback(() => {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 1200, 800);
      ctx.drawImage(img, 0, 0, 1200, 800);
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = 'knowledge-graph.png';
      a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  }, []);

  const statValues = [
    nodes.filter((n) => n.type === 'concept').length,
    edges.length,
    nodes.filter((n) => n.type === 'book').length,
    themes.length,
  ];

  const isEmpty = !loading && !error && nodes.length === 0;
  const bookCount = nodes.filter((n) => n.type === 'book').length;
  const isSparse = !isEmpty && bookCount < 3;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1e3a5f] dark:text-white">Knowledge Graph</h1>
          <p className="text-sm sm:text-base text-[#5c5c5c] dark:text-gray-400 mt-1">Your reading knowledge, connected and visualized</p>
        </div>
        {!isEmpty && (
          <div className="flex flex-wrap gap-2 items-center">
            {(['graph', 'list', 'themes'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                  viewMode === mode
                    ? 'bg-amber-600 text-white'
                    : 'bg-[#f0e9e0] dark:bg-gray-800 text-[#5c5c5c] dark:text-gray-400 hover:bg-amber-100 dark:hover:bg-gray-700'
                }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
            {viewMode === 'graph' && (
              <>
                <div className="w-px h-5 sm:h-6 bg-gray-300 dark:bg-gray-600 mx-0.5" />
                {(['force', 'circular', 'hierarchical'] as const).map((lm) => (
                  <button
                    key={lm}
                    onClick={() => setLayoutMode(lm)}
                    className={`px-1.5 py-1 sm:px-2 sm:py-1.5 rounded text-[10px] sm:text-xs font-medium transition-colors ${
                      layoutMode === lm
                        ? 'bg-teal-600 text-white'
                        : 'bg-[#f0e9e0] dark:bg-gray-800 text-[#5c5c5c] dark:text-gray-400 hover:bg-teal-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {lm === 'force' ? 'Force' : lm === 'circular' ? 'Circle' : 'Tree'}
                  </button>
                ))}
                <div className="w-px h-5 sm:h-6 bg-gray-300 dark:bg-gray-600 mx-0.5" />
                <button
                  onClick={exportSVG}
                  className="px-1.5 py-1 sm:px-2 sm:py-1.5 rounded text-[10px] sm:text-xs font-medium bg-[#f0e9e0] dark:bg-gray-800 text-[#5c5c5c] dark:text-gray-400 hover:bg-amber-50 dark:hover:bg-gray-700 transition-colors"
                  title="Export as SVG"
                >
                  SVG
                </button>
                <button
                  onClick={exportPNG}
                  className="px-1.5 py-1 sm:px-2 sm:py-1.5 rounded text-[10px] sm:text-xs font-medium bg-[#f0e9e0] dark:bg-gray-800 text-[#5c5c5c] dark:text-gray-400 hover:bg-amber-50 dark:hover:bg-gray-700 transition-colors"
                  title="Export as PNG"
                >
                  PNG
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Stats */}
      {!isEmpty && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-6 sm:mb-8">
          {loading
            ? STAT_ITEMS.map((label) => (
                <div key={label} className="bg-white dark:bg-gray-900 rounded-xl border border-[#f0e9e0] dark:border-gray-800 p-4 text-center animate-pulse">
                  <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-10 mx-auto" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-14 mx-auto mt-2" />
                </div>
              ))
            : statValues.map((val, i) => (
                <div key={STAT_ITEMS[i]} className="bg-white dark:bg-gray-900 rounded-xl border border-[#f0e9e0] dark:border-gray-800 p-2 sm:p-4 text-center">
                  <div className="text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400">{val}</div>
                  <div className="text-xs sm:text-sm text-[#5c5c5c] dark:text-gray-400">{STAT_ITEMS[i]}</div>
                </div>
              ))}
        </div>
      )}

      {/* Sparse data notice — encourage more reading before graph is useful */}
      {isSparse && !loading && (
        <div className="mb-6 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
          <span className="text-2xl flex-shrink-0">{'\uD83D\uDCA1'}</span>
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Your graph is growing
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 leading-relaxed">
              Connections become more meaningful with more books. Read {3 - bookCount} more book{3 - bookCount !== 1 ? 's' : ''} to unlock richer cross-book themes and insights.
            </p>
          </div>
        </div>
      )}

      {/* Empty State — warm amber design */}
      {isEmpty && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-[#f0e9e0] dark:border-gray-800 text-center py-20 px-8">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/30 dark:to-teal-900/30 flex items-center justify-center">
            <span className="text-4xl">{'\uD83D\uDD78'}</span>
          </div>
          <h2 className="text-2xl font-bold text-[#1e3a5f] dark:text-white mb-3">
            Your Knowledge Graph grows as you read
          </h2>
          <p className="text-[#5c5c5c] dark:text-gray-400 mb-3 max-w-lg mx-auto leading-relaxed">
            Every book you finish, every highlight you make, and every insight you share with your AI companion builds a richer picture of what you know.
          </p>
          <p className="text-sm text-amber-700 dark:text-amber-300 mb-8 max-w-md mx-auto">
            Start reading to see connections appear here automatically.
          </p>
          <Link
            href="/library"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-teal-500 text-white font-semibold shadow-lg hover:from-amber-600 hover:to-teal-600 transition-all duration-200 hover:shadow-xl"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            Go to Library
          </Link>
        </div>
      )}

      {/* Graph View */}
      {!isEmpty && viewMode === 'graph' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-[#f0e9e0] dark:border-gray-800 relative overflow-hidden" style={{ height: 'clamp(300px, 60vh, 500px)' }}>
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-pulse text-gray-400">Loading graph...</div>
            </div>
          ) : (
            <>
              <svg ref={svgRef} width="100%" height="100%" className="overflow-visible" style={{ transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`, transformOrigin: 'center center', transition: 'transform 0.1s ease-out' }}>
                {/* Connection count badge per node */}
                {(() => {
                  const displayNodes = layoutNodes.length > 0 ? layoutNodes : nodes;
                  const connectedEdges = hoverNode || selectedNode
                    ? edges.filter((e) => e.source === (hoverNode || selectedNode) || e.target === (hoverNode || selectedNode))
                    : edges;
                  const connectedNodeIds = new Set<string>();
                  if (hoverNode || selectedNode) {
                    connectedNodeIds.add(hoverNode || selectedNode || '');
                    for (const e of connectedEdges) {
                      connectedNodeIds.add(e.source);
                      connectedNodeIds.add(e.target);
                    }
                  }
                  return (
                    <>
                      {/* Edges */}
                      {edges.map((edge, i) => {
                        const src = displayNodes.find((n) => n.id === edge.source);
                        const tgt = displayNodes.find((n) => n.id === edge.target);
                        if (!src || !tgt) return null;
                        const isHighlighted = connectedNodeIds.has(edge.source) && connectedNodeIds.has(edge.target);
                        return (
                          <g key={i}>
                            <line
                              x1={`${src.x}%`} y1={`${src.y}%`}
                              x2={`${tgt.x}%`} y2={`${tgt.y}%`}
                              stroke="#d97706"
                              strokeWidth={isHighlighted ? 3 : 1.5}
                              strokeOpacity={isHighlighted ? 0.7 : (connectedNodeIds.size > 0 ? 0.1 : 0.3)}
                              strokeDasharray={isHighlighted ? 'none' : '4 2'}
                            />
                          </g>
                        );
                      })}
                      {/* Nodes */}
                      {displayNodes.map((node) => {
                        const size = getNodeSize(node.type);
                        const isActive = node.id === selectedNode || node.id === hoverNode;
                        const isConnected = connectedNodeIds.size === 0 || connectedNodeIds.has(node.id);
                        return (
                          <g
                            key={node.id}
                            onClick={() => setSelectedNode(node.id === selectedNode ? null : node.id)}
                            onMouseEnter={() => setHoverNode(node.id)}
                            onMouseLeave={() => setHoverNode(null)}
                            className="cursor-pointer"
                            style={{ opacity: isConnected ? 1 : 0.2, transition: 'opacity 0.2s' }}
                          >
                            {/* Glow ring on hover */}
                            {isActive && (
                              <circle cx={`${node.x}%`} cy={`${node.y}%`} r={size + 6} fill="none" stroke={getNodeColor(node.type)} strokeWidth="2" strokeOpacity="0.4">
                                <animate attributeName="r" from={size} to={size + 8} dur="1.5s" repeatCount="indefinite" />
                                <animate attributeName="stroke-opacity" from="0.5" to="0" dur="1.5s" repeatCount="indefinite" />
                              </circle>
                            )}
                            <circle
                              cx={`${node.x}%`} cy={`${node.y}%`}
                              r={isActive ? size + 3 : size}
                              fill={getNodeColor(node.type)}
                              fillOpacity={isActive ? 0.9 : 0.65}
                              stroke={isActive ? '#fff' : 'none'}
                              strokeWidth="2"
                              style={{ transition: 'r 0.2s, fill-opacity 0.2s' }}
                            />
                            <text
                              x={`${node.x}%`}
                              y={`${node.y + size + 12}%`}
                              className="text-[11px] font-medium fill-gray-700 dark:fill-gray-300"
                              textAnchor="middle"
                              style={{ textShadow: isActive ? '0 0 8px rgba(255,255,255,0.9)' : 'none' }}
                            >
                              {node.label.length > 20 ? node.label.slice(0, 18) + '...' : node.label}
                            </text>
                            {/* Connection count */}
                            {(() => {
                              const count = edges.filter((e) => e.source === node.id || e.target === node.id).length;
                              return count > 0 ? (
                                <text x={`${node.x + size * 0.7}%`} y={`${node.y - size * 0.7}%`} className="text-[9px] font-bold fill-gray-400" textAnchor="middle">
                                  {count}
                                </text>
                              ) : null;
                            })()}
                          </g>
                        );
                      })}
                    </>
                  );
                })()}
              </svg>
              {/* Zoom controls */}
              <div className="absolute top-2 right-2 sm:top-4 sm:right-4 flex flex-col gap-1 sm:gap-1.5">
                <button
                  onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
                  className="w-11 h-11 rounded-lg bg-white/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-amber-50 dark:hover:bg-gray-700 active:scale-95 flex items-center justify-center text-sm sm:text-lg font-bold shadow-sm transition-transform"
                >
                  +
                </button>
                <button
                  onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}
                  className="w-11 h-11 rounded-lg bg-white/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-amber-50 dark:hover:bg-gray-700 active:scale-95 flex items-center justify-center text-sm sm:text-lg font-bold shadow-sm transition-transform"
                >
                  -
                </button>
                <button
                  onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
                  className="w-11 h-11 rounded-lg bg-white/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-amber-50 dark:hover:bg-gray-700 active:scale-95 flex items-center justify-center shadow-sm transition-transform"
                  title="Reset view"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
              {/* Node detail tooltip */}
              {selectedNode && (() => {
                const displayNodes = layoutNodes.length > 0 ? layoutNodes : nodes;
                const node = displayNodes.find((n) => n.id === selectedNode);
                if (!node) return null;
                const connected = edges
                  .filter((e) => e.source === selectedNode || e.target === selectedNode)
                  .map((e) => {
                    const otherId = e.source === selectedNode ? e.target : e.source;
                    const other = displayNodes.find((n) => n.id === otherId);
                    return { id: otherId, label: other?.label || otherId, type: e.type };
                  });
                return (
                  <div className="absolute bottom-4 left-4 right-16 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-xl p-4 border border-[#f0e9e0] dark:border-gray-700 shadow-lg max-h-48 overflow-y-auto">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getNodeColor(node.type) }} />
                      <span className="font-semibold text-[#1e3a5f] dark:text-white text-sm">{node.label}</span>
                      <span className="text-xs text-gray-400 capitalize bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{node.type}</span>
                      <button onClick={() => setSelectedNode(null)} className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    {connected.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Connections</p>
                        {connected.map((c) => (
                          <div key={c.id} className="flex items-center gap-2 text-xs">
                            <span className="text-gray-500 dark:text-gray-400">{c.label}</span>
                            <span className="text-gray-300 dark:text-gray-600">{c.type}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
              {/* Legend */}
              <div className="absolute top-4 left-4 bg-white/90 dark:bg-gray-900/90 rounded-lg p-3 text-xs border border-[#f0e9e0] dark:border-gray-700">
                <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 rounded-full bg-amber-600" /> Book</div>
                <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 rounded-full bg-teal-500" /> Theme</div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-400" /> Concept</div>
              </div>
            </>
          )}
        </div>
      )}

      {/* List View */}
      {!isEmpty && viewMode === 'list' && (
        <div className="space-y-2">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-[#f0e9e0] dark:border-gray-800 p-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-gray-200 dark:bg-gray-700 rounded-full" />
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-40" />
                  </div>
                </div>
              ))
            : nodes.map((node) => (
                <div key={node.id} className="bg-white dark:bg-gray-900 rounded-xl border border-[#f0e9e0] dark:border-gray-800 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: getNodeColor(node.type) }}
                    />
                    <span className="font-medium text-[#1e3a5f] dark:text-white">{node.label}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-[#5c5c5c] dark:text-gray-400 capitalize bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded">{node.type}</span>
                    <span className="text-xs text-[#5c5c5c] dark:text-gray-400">{edges.filter((e) => e.source === node.id || e.target === node.id).length} connections</span>
                  </div>
                </div>
              ))}
        </div>
      )}

      {/* Themes View */}
      {!isEmpty && viewMode === 'themes' && (
        <div className="space-y-4">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-[#f0e9e0] dark:border-gray-800 p-4 animate-pulse">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-3" />
                  <div className="flex gap-2"><div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-24" /></div>
                </div>
              ))
            : themes.length === 0
              ? <div className="bg-white dark:bg-gray-900 rounded-xl border border-[#f0e9e0] dark:border-gray-800 text-center py-12"><p className="text-sm text-[#5c5c5c] dark:text-gray-400">No cross-book themes discovered yet. Keep reading!</p></div>
              : themes.map((t, i) => (
                  <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-[#f0e9e0] dark:border-gray-800 p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-[#1e3a5f] dark:text-white">{t.theme}</h3>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {t.books.map((book, j) => (
                            <span key={j} className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-1 rounded">{book}</span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{(t.strength * 100).toFixed(0)}%</div>
                        <div className="text-xs text-[#5c5c5c] dark:text-gray-400">relevance</div>
                      </div>
                    </div>
                    <div className="mt-3 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div className="bg-amber-500 rounded-full h-2" style={{ width: `${t.strength * 100}%` }} />
                    </div>
                  </div>
                ))}
        </div>
      )}

      <div className="mt-8">
        <Link href="/dashboard" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#f0e9e0] dark:bg-gray-800 text-[#1e3a5f] dark:text-gray-200 hover:bg-amber-100 dark:hover:bg-gray-700 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
