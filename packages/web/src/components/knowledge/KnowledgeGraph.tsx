'use client';

import React, { forwardRef } from 'react';
import { getColor } from '@/lib/knowledge-colors';
import type { SimNode, VisualizationEdge } from '@/types/knowledge';

interface KnowledgeGraphProps {
  nodes: SimNode[];
  edges: VisualizationEdge[];
  selectedNode: SimNode | null;
  connectedEdges: VisualizationEdge[];
  connectedNodeIds: Set<string | undefined>;
  dimensions: { width: number; height: number };
  loading: boolean;
  onNodeClick: (node: SimNode) => void;
  conceptMapLabel: string;
  clickHintLabel: string;
}

export const KnowledgeGraph = forwardRef<SVGSVGElement, KnowledgeGraphProps>(
  function KnowledgeGraph(
    {
      nodes,
      edges,
      selectedNode,
      connectedEdges,
      connectedNodeIds,
      dimensions,
      loading,
      onNodeClick,
      conceptMapLabel,
      clickHintLabel,
    },
    ref,
  ) {
    return (
      <div className="lg:col-span-2 bg-surface-0 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="p-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{conceptMapLabel}</span>
          <span className="text-xs text-gray-400">{clickHintLabel}</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center" style={{ height: dimensions.height }}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
          </div>
        ) : (
          <svg
            ref={ref}
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
              const freshness = node.freshness ?? 1.0;
              const freshnessOpacity = freshness >= 0.7 ? 1.0 : freshness >= 0.3 ? 0.6 : 0.35;

              return (
                <g
                  key={node.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.label}${node.bookTitle ? ` from ${node.bookTitle}` : ''}`}
                  onClick={() => onNodeClick(node)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNodeClick(node); } }}
                  className="cursor-pointer"
                  opacity={isDimmed ? 0.3 : freshnessOpacity}
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
    );
  },
);
