'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';
import type { GraphNode, GraphEdge } from '@/components/knowledge/graphLayout';
import { getNodePosition, getNodeColor } from '@/components/knowledge/graphLayout';

// Lazy-load the heavy GraphView SVG component — only loads when user selects graph view
const GraphView = dynamic(() => import('@/components/knowledge/GraphView').then((m) => ({ default: m.GraphView })), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-xs text-gray-400">Loading graph...</p>
      </div>
    </div>
  ),
});

interface CrossBookTheme {
  theme: string;
  books: string[];
  connections: number;
  strength: number;
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
  const [computingLayout, setComputingLayout] = useState(false);

  // SVG ref for export
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

  useEffect(() => {
    let cancelled = false;

    async function loadKnowledgeData() {
      try {
        const [graphRes, conceptsRes, themesRes] = await Promise.all([
          api.get<{ neo4jAvailable: boolean; nodes: GraphNode[]; edges: GraphEdge[] }>('/api/knowledge/graph').catch(() => ({ success: false, data: null as unknown })),
          api.get<{ neo4jAvailable: boolean; concepts: { id: string; name: string; type: string; bookIds?: string[] }[] }>('/api/knowledge/concepts').catch(() => ({ success: false, data: null as unknown })),
          api.get<{ neo4jAvailable: boolean; themes: { theme: string; books: string[]; connections: number; strength: number }[] }>('/api/knowledge/themes').catch(() => ({ success: false, data: null as unknown })),
        ]);

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
          setLoading(false);
          return;
        }

        // Fallback: derive graph from annotations
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

        const bookMap = new Map(books.map((b) => [b.id, b.title || 'Untitled']));
        const bookGroups = new Map<string, { title: string; count: number; types: Set<string> }>();
        for (const a of annotations) {
          const bookId = a.bookId || a.book_id || '';
          const existing = bookGroups.get(bookId) || { title: bookMap.get(bookId) || 'Unknown', count: 0, types: new Set() };
          existing.count++;
          existing.types.add(a.type);
          bookGroups.set(bookId, existing);
        }

        const graphNodes: GraphNode[] = [];
        const graphEdges: GraphEdge[] = [];
        let idx = 0;

        for (const [bookId, group] of bookGroups) {
          graphNodes.push({ id: bookId, label: group.title, type: 'book', ...getNodePosition(idx, bookGroups.size) });
          idx++;
        }

        if (conceptsData?.concepts) {
          for (const concept of conceptsData.concepts) {
            graphNodes.push({ id: concept.id || `concept-${idx}`, label: concept.name, type: 'concept', ...getNodePosition(idx, bookGroups.size + conceptsData.concepts.length) });
            if (concept.bookIds) {
              for (const bookId of concept.bookIds) {
                graphEdges.push({ source: concept.id || `concept-${idx}`, target: bookId, type: 'related to' });
              }
            }
            idx++;
          }
        }

        const colorGroups = new Map<string, { books: Set<string>; count: number }>();
        for (const a of annotations) {
          if (a.color) {
            const existing = colorGroups.get(a.color) || { books: new Set(), count: 0 };
            existing.books.add(a.bookId || a.book_id || '');
            existing.count++;
            colorGroups.set(a.color, existing);
          }
        }

        const crossBookThemes: CrossBookTheme[] = [];
        const colorNames: Record<string, string> = { '#FFEB3B': 'Important Ideas', '#FF9800': 'Questions & Wonders', '#4CAF50': 'Key Insights', '#2196F3': 'Connections', '#9C27B0': 'Creative Thoughts', '#F44336': 'Critical Points' };

        for (const [color, group] of colorGroups) {
          if (group.books.size > 1) {
            const themeName = colorNames[color] || `Theme (${color})`;
            graphNodes.push({ id: `theme-${color}`, label: themeName, type: 'theme', ...getNodePosition(idx, bookGroups.size + colorGroups.size) });
            idx++;
            for (const bookId of group.books) {
              graphEdges.push({ source: `theme-${color}`, target: bookId, type: 'shared highlight' });
            }
            crossBookThemes.push({ theme: themeName, books: Array.from(group.books).map((id) => bookMap.get(id) || 'Unknown'), connections: group.count, strength: Math.min(1, group.count / 10) });
          }
        }

        const finalThemes = themesData?.themes && themesData.themes.length > 0
          ? themesData.themes.map((t) => ({ theme: t.theme, books: t.books, connections: t.connections, strength: t.strength }))
          : crossBookThemes;

        setNodes(graphNodes);
        setEdges(graphEdges);
        setThemes(finalThemes);
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
      setComputingLayout(true);
      // Dynamic import to avoid blocking initial render
      import('@/components/knowledge/graphLayout').then(({ applyLayout }) => {
        setLayoutNodes(applyLayout(nodes, edges, layoutMode));
        setComputingLayout(false);
      });
    }
  }, [layoutMode, nodes, edges]);

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
    <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6 sm:mb-8 animate-slide-up">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1e3a5f] dark:text-white">Knowledge Graph</h1>
          <p className="text-sm sm:text-base text-[#5c5c5c] dark:text-gray-400 mt-1">Your reading knowledge, connected and visualized</p>
        </div>
        {!isEmpty && <ViewModeBar viewMode={viewMode} setViewMode={setViewMode} layoutMode={layoutMode} setLayoutMode={setLayoutMode} exportSVG={exportSVG} exportPNG={exportPNG} />}
      </div>

      {error && <ErrorBanner message={error} />}

      {/* Stats */}
      {!isEmpty && <StatsBar loading={loading} statValues={statValues} />}

      {isSparse && !loading && <SparseNotice bookCount={bookCount} />}

      {isEmpty && <EmptyState />}

      {/* Graph View */}
      {!isEmpty && viewMode === 'graph' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-[#f0e9e0] dark:border-gray-800 relative overflow-hidden" style={{ height: 'clamp(300px, 60vh, 500px)' }}>
          <GraphView
            svgRef={svgRef}
            nodes={nodes}
            layoutNodes={layoutNodes}
            edges={edges}
            selectedNode={selectedNode}
            hoverNode={hoverNode}
            zoom={zoom}
            pan={pan}
            computingLayout={computingLayout}
            loading={loading}
            onSelectNode={setSelectedNode}
            onHoverNode={setHoverNode}
            onZoom={setZoom}
            onPan={setPan}
          />
        </div>
      )}

      {/* List View */}
      {!isEmpty && viewMode === 'list' && <ListView loading={loading} nodes={nodes} edges={edges} />}

      {/* Themes View */}
      {!isEmpty && viewMode === 'themes' && <ThemesView loading={loading} themes={themes} />}

      <div className="mt-8">
        <Link href="/dashboard" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#f0e9e0] dark:bg-gray-800 text-[#1e3a5f] dark:text-gray-200 hover:bg-amber-100 dark:hover:bg-gray-700 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </Link>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ViewModeBar({ viewMode, setViewMode, layoutMode, setLayoutMode, exportSVG, exportPNG }: {
  viewMode: 'graph' | 'list' | 'themes';
  setViewMode: (m: 'graph' | 'list' | 'themes') => void;
  layoutMode: 'force' | 'circular' | 'hierarchical';
  setLayoutMode: (m: 'force' | 'circular' | 'hierarchical') => void;
  exportSVG: () => void;
  exportPNG: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {(['graph', 'list', 'themes'] as const).map((mode) => (
        <button
          key={mode}
          onClick={() => setViewMode(mode)}
          className={`px-3 py-2.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
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
              className={`px-2 py-2 sm:px-2 sm:py-1.5 rounded text-[10px] sm:text-xs font-medium transition-colors ${
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
            className="px-2 py-2 sm:px-2 sm:py-1.5 rounded text-[10px] sm:text-xs font-medium bg-[#f0e9e0] dark:bg-gray-800 text-[#5c5c5c] dark:text-gray-400 hover:bg-amber-50 dark:hover:bg-gray-700 transition-colors"
            title="Export as SVG"
            aria-label="Export as SVG"
          >
            SVG
          </button>
          <button
            onClick={exportPNG}
            className="px-2 py-2 sm:px-2 sm:py-1.5 rounded text-[10px] sm:text-xs font-medium bg-[#f0e9e0] dark:bg-gray-800 text-[#5c5c5c] dark:text-gray-400 hover:bg-amber-50 dark:hover:bg-gray-700 transition-colors"
            title="Export as PNG"
            aria-label="Export as PNG"
          >
            PNG
          </button>
        </>
      )}
    </div>
  );
}

function StatsBar({ loading, statValues }: { loading: boolean; statValues: number[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-6 sm:mb-8">
      {loading
        ? STAT_ITEMS.map((label) => (
            <div key={label} className="bg-white dark:bg-gray-900 rounded-xl border border-[#f0e9e0] dark:border-gray-800 p-4 text-center animate-pulse">
              <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-10 mx-auto" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-14 mx-auto mt-2" />
            </div>
          ))
        : statValues.map((val, i) => (
            <div key={STAT_ITEMS[i]} className={`stagger-${i + 1} animate-slide-up bg-white dark:bg-gray-900 rounded-xl border border-[#f0e9e0] dark:border-gray-800 p-2 sm:p-4 text-center`}>
              <div className="text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400">{val}</div>
              <div className="text-xs sm:text-sm text-[#5c5c5c] dark:text-gray-400">{STAT_ITEMS[i]}</div>
            </div>
          ))}
    </div>
  );
}

function SparseNotice({ bookCount }: { bookCount: number }) {
  return (
    <div className="mb-6 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
      <span className="text-2xl flex-shrink-0">{'\uD83D\uDCA1'}</span>
      <div>
        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Your graph is growing</p>
        <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 leading-relaxed">
          Connections become more meaningful with more books. Read {3 - bookCount} more book{3 - bookCount !== 1 ? 's' : ''} to unlock richer cross-book themes and insights.
        </p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-[#f0e9e0] dark:border-gray-800 text-center py-20 px-8">
      <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/30 dark:to-teal-900/30 flex items-center justify-center">
        <span className="text-4xl">{'\uD83D\uDD78'}</span>
      </div>
      <h2 className="text-2xl font-bold text-[#1e3a5f] dark:text-white mb-3">Your Knowledge Graph grows as you read</h2>
      <p className="text-[#5c5c5c] dark:text-gray-400 mb-3 max-w-lg mx-auto leading-relaxed">
        Every book you finish, every highlight you make, and every insight you share with your AI companion builds a richer picture of what you know.
      </p>
      <p className="text-sm text-amber-700 dark:text-amber-300 mb-8 max-w-md mx-auto">Start reading to see connections appear here automatically.</p>
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
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
      {message}
    </div>
  );
}

function ListView({ loading, nodes, edges }: { loading: boolean; nodes: GraphNode[]; edges: GraphEdge[] }) {
  return (
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
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getNodeColor(node.type) }} />
                <span className="font-medium text-[#1e3a5f] dark:text-white">{node.label}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-[#5c5c5c] dark:text-gray-400 capitalize bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded">{node.type}</span>
                <span className="text-xs text-[#5c5c5c] dark:text-gray-400">{edges.filter((e) => e.source === node.id || e.target === node.id).length} connections</span>
              </div>
            </div>
          ))}
    </div>
  );
}

function ThemesView({ loading, themes }: { loading: boolean; themes: CrossBookTheme[] }) {
  return (
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
  );
}
