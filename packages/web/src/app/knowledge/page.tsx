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

function getNodePosition(index: number, total: number) {
  const angle = (2 * Math.PI * index) / total - Math.PI / 2;
  return {
    x: Math.max(10, Math.min(90, 50 + 35 * Math.cos(angle))),
    y: Math.max(10, Math.min(90, 50 + 30 * Math.sin(angle))),
  };
}

function getNodeColor(type: string) {
  return type === 'book' ? '#7c3aed' : type === 'theme' ? '#2563eb' : '#06b6d4';
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
    Promise.all([
      api.get<{ nodes: GraphNode[]; edges: GraphEdge[] }>('/knowledge/graph'),
      api.get<CrossBookTheme[]>('/knowledge/themes'),
    ])
      .then(([graphRes, themesRes]) => {
        const gd = graphRes.data;
        if (gd) {
          const positioned = gd.nodes.map((node, i) => {
            const pos = 'x' in node ? { x: (node as any).x, y: (node as any).y } : getNodePosition(i, gd.nodes.length);
            return { ...node, ...pos };
          });
          setNodes(positioned);
          setEdges(gd.edges ?? []);
        }
        if (themesRes.data) setThemes(themesRes.data);
      })
      .catch(() => setError('Failed to load knowledge graph. Please try again later.'))
      .finally(() => setLoading(false));
  }, []);

  const statValues = [
    nodes.filter((n) => n.type === 'concept').length,
    edges.length,
    nodes.filter((n) => n.type === 'book').length,
    themes.length,
  ];

  const isEmpty = !loading && nodes.length === 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Knowledge Graph</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Your reading knowledge, connected and visualized</p>
        </div>
        <div className="flex gap-2">
          {(['graph', 'list', 'themes'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === mode
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {loading
          ? STAT_ITEMS.map((label) => (
              <div key={label} className="card text-center animate-pulse">
                <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-10 mx-auto" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-14 mx-auto mt-2" />
              </div>
            ))
          : statValues.map((val, i) => (
              <div key={STAT_ITEMS[i]} className="card text-center">
                <div className="text-2xl font-bold text-purple-600">{val}</div>
                <div className="text-sm text-gray-500">{STAT_ITEMS[i]}</div>
              </div>
            ))}
      </div>

      {/* Empty State */}
      {isEmpty && !error && (
        <div className="card text-center py-16">
          <div className="text-5xl mb-4">🕸️</div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No knowledge graph yet</h2>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            Your knowledge graph grows as you read. Concepts, themes, and connections will appear here automatically.
          </p>
          <Link href="/library" className="btn btn-primary">Start Reading</Link>
        </div>
      )}

      {/* Graph View */}
      {!isEmpty && viewMode === 'graph' && (
        <div className="card relative" style={{ height: '500px' }}>
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
                    <line x1={`${src.x}%`} y1={`${src.y}%`} x2={`${tgt.x}%`} y2={`${tgt.y}%`} stroke="#a78bfa" strokeWidth="2" strokeOpacity="0.4" />
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
          <div className="absolute bottom-4 left-4 bg-white/80 dark:bg-gray-900/80 rounded-lg p-3 text-xs">
            <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 rounded-full bg-purple-600" /> Book</div>
            <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 rounded-full bg-blue-600" /> Theme</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-cyan-500" /> Concept</div>
          </div>
        </div>
      )}

      {/* List View */}
      {!isEmpty && viewMode === 'list' && (
        <div className="space-y-2">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="card animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-gray-200 dark:bg-gray-700 rounded-full" />
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-40" />
                  </div>
                </div>
              ))
            : nodes.map((node) => (
                <div key={node.id} className="card flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full bg-${node.type === 'book' ? 'purple-600' : node.type === 'theme' ? 'blue-600' : 'cyan-500'}`} />
                    <span className="font-medium text-gray-900 dark:text-white">{node.label}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-500 capitalize bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{node.type}</span>
                    <span className="text-xs text-gray-400">{edges.filter((e) => e.source === node.id || e.target === node.id).length} connections</span>
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
                <div key={i} className="card animate-pulse">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-3" />
                  <div className="flex gap-2"><div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-24" /></div>
                </div>
              ))
            : themes.length === 0
              ? <div className="card text-center py-12"><p className="text-sm text-gray-500">No cross-book themes discovered yet. Keep reading!</p></div>
              : themes.map((t, i) => (
                  <div key={i} className="card">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">{t.theme}</h3>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {t.books.map((book, j) => (
                            <span key={j} className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-1 rounded">{book}</span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-purple-600">{(t.strength * 100).toFixed(0)}%</div>
                        <div className="text-xs text-gray-500">relevance</div>
                      </div>
                    </div>
                    <div className="mt-3 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div className="bg-purple-500 rounded-full h-2" style={{ width: `${t.strength * 100}%` }} />
                    </div>
                  </div>
                ))}
        </div>
      )}

      <div className="mt-8">
        <Link href="/dashboard" className="btn btn-secondary">Back to Dashboard</Link>
      </div>
    </div>
  );
}
