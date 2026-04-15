'use client';

import { RefObject, useMemo, useEffect, useRef } from 'react';
import type { GraphNode, GraphEdge } from './graphLayout';
import { getNodeColor, getNodeSize } from './graphLayout';

interface GraphViewProps {
  svgRef: React.MutableRefObject<SVGSVGElement | null>;
  nodes: GraphNode[];
  layoutNodes: GraphNode[];
  edges: GraphEdge[];
  selectedNode: string | null;
  hoverNode: string | null;
  zoom: number;
  pan: { x: number; y: number };
  computingLayout: boolean;
  loading: boolean;
  onSelectNode: (id: string | null) => void;
  onHoverNode: (id: string | null) => void;
  onZoom: (zoom: number) => void;
  onPan: (pan: { x: number; y: number }) => void;
}

export function GraphView({
  svgRef,
  nodes,
  layoutNodes,
  edges,
  selectedNode,
  hoverNode,
  zoom,
  pan,
  computingLayout,
  loading,
  onSelectNode,
  onHoverNode,
  onZoom,
  onPan,
}: GraphViewProps) {
  const displayNodes = layoutNodes.length > 0 ? layoutNodes : nodes;

  const connectedEdges = useMemo(() => {
    const active = hoverNode || selectedNode;
    if (!active) return edges;
    return edges.filter((e) => e.source === active || e.target === active);
  }, [edges, hoverNode, selectedNode]);

  const connectedNodeIds = useMemo(() => {
    const active = hoverNode || selectedNode;
    if (!active) return new Set<string>();
    const ids = new Set<string>();
    ids.add(active);
    for (const e of connectedEdges) {
      ids.add(e.source);
      ids.add(e.target);
    }
    return ids;
  }, [connectedEdges, hoverNode, selectedNode]);

  const localRef = useRef<SVGSVGElement>(null);

  // Sync local ref to parent ref
  useEffect(() => {
    if (svgRef) (svgRef as React.MutableRefObject<SVGSVGElement | null>).current = localRef.current;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-gray-400">Loading graph...</div>
      </div>
    );
  }

  if (computingLayout) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-gray-400">Computing layout...</div>
      </div>
    );
  }

  return (
    <>
      <svg
        ref={localRef}
        width="100%"
        height="100%"
        className="overflow-visible"
        style={{
          transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
          transformOrigin: 'center center',
          transition: 'transform 0.1s ease-out',
        }}
      >
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
              onClick={() => onSelectNode(node.id === selectedNode ? null : node.id)}
              onMouseEnter={() => onHoverNode(node.id)}
              onMouseLeave={() => onHoverNode(null)}
              className="cursor-pointer"
              style={{ opacity: isConnected ? 1 : 0.2, transition: 'opacity 0.2s' }}
            >
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
              <NodeConnectionCount nodeId={node.id} edges={edges} size={size} node={node} />
            </g>
          );
        })}
      </svg>

      <ZoomControls zoom={zoom} onZoom={onZoom} onPan={onPan} />
      <NodeDetailTooltip
        nodes={displayNodes}
        edges={edges}
        selectedNode={selectedNode}
        onClose={() => onSelectNode(null)}
      />

      {/* Legend */}
      <div className="absolute top-4 left-4 bg-white/90 dark:bg-gray-900/90 rounded-lg p-3 text-xs border border-[#f0e9e0] dark:border-gray-700">
        <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 rounded-full bg-amber-600" /> Book</div>
        <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 rounded-full bg-teal-500" /> Theme</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-400" /> Concept</div>
      </div>
    </>
  );
}

/** Small inline component showing the edge count badge on a node. */
function NodeConnectionCount({ nodeId, edges, size, node }: {
  nodeId: string;
  edges: GraphEdge[];
  size: number;
  node: GraphNode;
}) {
  const count = edges.filter((e) => e.source === nodeId || e.target === nodeId).length;
  if (count === 0) return null;
  return (
    <text x={`${node.x + size * 0.7}%`} y={`${node.y - size * 0.7}%`} className="text-[9px] font-bold fill-gray-400" textAnchor="middle">
      {count}
    </text>
  );
}

/** Zoom in/out/reset controls overlaid on the graph. */
function ZoomControls({ zoom, onZoom, onPan }: {
  zoom: number;
  onZoom: (z: number) => void;
  onPan: (p: { x: number; y: number }) => void;
}) {
  const btnClass = 'w-11 h-11 rounded-lg bg-white/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-amber-50 dark:hover:bg-gray-700 active:scale-95 flex items-center justify-center text-sm sm:text-lg font-bold shadow-sm transition-transform';

  return (
    <div className="absolute top-2 right-2 sm:top-4 sm:right-4 flex flex-col gap-1 sm:gap-1.5">
      <button onClick={() => onZoom(Math.min(3, zoom + 0.2))} className={btnClass}>+</button>
      <button onClick={() => onZoom(Math.max(0.4, zoom - 0.2))} className={btnClass}>-</button>
      <button onClick={() => { onZoom(1); onPan({ x: 0, y: 0 }); }} className={btnClass} title="Reset view">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </div>
  );
}

/** Tooltip showing details for the selected node. */
function NodeDetailTooltip({ nodes, edges, selectedNode, onClose }: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNode: string | null;
  onClose: () => void;
}) {
  if (!selectedNode) return null;

  const node = nodes.find((n) => n.id === selectedNode);
  if (!node) return null;

  const connected = edges
    .filter((e) => e.source === selectedNode || e.target === selectedNode)
    .map((e) => {
      const otherId = e.source === selectedNode ? e.target : e.source;
      const other = nodes.find((n) => n.id === otherId);
      return { id: otherId, label: other?.label || otherId, type: e.type };
    });

  return (
    <div className="absolute bottom-4 left-4 right-16 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-xl p-4 border border-[#f0e9e0] dark:border-gray-700 shadow-lg max-h-48 overflow-y-auto">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getNodeColor(node.type) }} />
        <span className="font-semibold text-[#1e3a5f] dark:text-white text-sm">{node.label}</span>
        <span className="text-xs text-gray-400 capitalize bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{node.type}</span>
        <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
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
}
