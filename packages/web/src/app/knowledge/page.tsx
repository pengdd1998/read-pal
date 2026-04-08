'use client';

import { useState, useEffect } from 'react';
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

function getNodeColor(type: string) {
  if (type === 'book') return '#d97706';
  if (type === 'theme') return '#14b8a6';
  return '#f59e0b';
}

function getNodeSize(type: string) {
  return type === 'theme' ? 20 : type === 'book' ? 16 : 12;
}

const STAT_ITEMS = ['Concepts', 'Connections', 'Books', 'Themes'] as const;

export default function KnowledgePage() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [themes, setThemes] = useState<CrossBookTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'graph' | 'list' | 'themes'>('graph');

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      api.get<GraphData>('/api/knowledge/graph'),
      api.get<{ themes: CrossBookTheme[] }>('/api/knowledge/themes'),
    ])
      .then(([graphRes, themesRes]) => {
        if (cancelled) return;

        const gd = graphRes.data as unknown as GraphData | undefined;
        if (gd) {
          const positioned = gd.nodes.map((node, i) => {
            const pos = 'x' in node && typeof node.x === 'number'
              ? { x: node.x, y: node.y }
              : getNodePosition(i, gd.nodes.length);
            return { ...node, ...pos };
          });
          setNodes(positioned);
          setEdges(gd.edges ?? []);
        }

        const td = themesRes.data as unknown as { themes: CrossBookTheme[] } | CrossBookTheme[] | undefined;
        if (td) {
          const themeArray = Array.isArray(td) ? td : (td as { themes: CrossBookTheme[] }).themes ?? [];
          setThemes(themeArray);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load knowledge graph. Please try again later.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const statValues = [
    nodes.filter((n) => n.type === 'concept').length,
    edges.length,
    nodes.filter((n) => n.type === 'book').length,
    themes.length,
  ];

  const isEmpty = !loading && !error && nodes.length === 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[#1e3a5f] dark:text-white">Knowledge Graph</h1>
          <p className="text-[#5c5c5c] dark:text-gray-400 mt-1">Your reading knowledge, connected and visualized</p>
        </div>
        {!isEmpty && (
          <div className="flex gap-2">
            {(['graph', 'list', 'themes'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === mode
                    ? 'bg-amber-600 text-white'
                    : 'bg-[#f0e9e0] dark:bg-gray-800 text-[#5c5c5c] dark:text-gray-400 hover:bg-amber-100 dark:hover:bg-gray-700'
                }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Coming Soon Banner — always shown */}
      <div className="mb-8 p-5 rounded-xl bg-gradient-to-r from-amber-50 to-teal-50 dark:from-amber-950/40 dark:to-teal-950/30 border border-amber-200/60 dark:border-amber-800/30">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xl">{'\u2728'}</span>
          <span className="text-sm font-semibold text-amber-800 dark:text-amber-200 uppercase tracking-wide">Coming Soon</span>
        </div>
        <p className="text-sm text-[#5c5c5c] dark:text-gray-300 leading-relaxed">
          The Knowledge Graph is a core part of read-pal&apos;s future. As you read, concepts, themes, and cross-book connections will be automatically discovered and woven into a personal knowledge network you can explore visually.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Stats */}
      {!isEmpty && (
        <div className="grid grid-cols-4 gap-4 mb-8">
          {loading
            ? STAT_ITEMS.map((label) => (
                <div key={label} className="bg-white dark:bg-gray-900 rounded-xl border border-[#f0e9e0] dark:border-gray-800 p-4 text-center animate-pulse">
                  <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-10 mx-auto" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-14 mx-auto mt-2" />
                </div>
              ))
            : statValues.map((val, i) => (
                <div key={STAT_ITEMS[i]} className="bg-white dark:bg-gray-900 rounded-xl border border-[#f0e9e0] dark:border-gray-800 p-4 text-center">
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{val}</div>
                  <div className="text-sm text-[#5c5c5c] dark:text-gray-400">{STAT_ITEMS[i]}</div>
                </div>
              ))}
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
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-[#f0e9e0] dark:border-gray-800 relative" style={{ height: '500px' }}>
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-pulse text-gray-400">Loading graph...</div>
            </div>
          ) : (
            <svg width="100%" height="100%" className="overflow-visible">
              {edges.map((edge, i) => {
                const src = nodes.find((n) => n.id === edge.source);
                const tgt = nodes.find((n) => n.id === edge.target);
                if (!src || !tgt) return null;
                return (
                  <g key={i}>
                    <line x1={`${src.x}%`} y1={`${src.y}%`} x2={`${tgt.x}%`} y2={`${tgt.y}%`} stroke="#d97706" strokeWidth="2" strokeOpacity="0.35" />
                    <text x={`${(src.x + tgt.x) / 2}%`} y={`${(src.y + tgt.y) / 2}%`} className="text-[10px] fill-gray-400" textAnchor="middle">{edge.type}</text>
                  </g>
                );
              })}
              {nodes.map((node) => {
                const size = getNodeSize(node.type);
                return (
                  <g key={node.id} onClick={() => setSelectedNode(node.id === selectedNode ? null : node.id)} className="cursor-pointer">
                    <circle cx={`${node.x}%`} cy={`${node.y}%`} r={size} fill={getNodeColor(node.type)} fillOpacity={selectedNode === node.id ? 0.9 : 0.6} stroke={selectedNode === node.id ? '#fff' : 'none'} strokeWidth="2" />
                    <text x={`${node.x}%`} y={`${node.y + size + 10}%`} className="text-xs font-medium fill-gray-700 dark:fill-gray-300" textAnchor="middle">{node.label}</text>
                  </g>
                );
              })}
            </svg>
          )}
          <div className="absolute bottom-4 left-4 bg-white/90 dark:bg-gray-900/90 rounded-lg p-3 text-xs border border-[#f0e9e0] dark:border-gray-700">
            <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 rounded-full bg-amber-600" /> Book</div>
            <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 rounded-full bg-teal-500" /> Theme</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-400" /> Concept</div>
          </div>
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
