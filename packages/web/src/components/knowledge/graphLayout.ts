/**
 * Graph Layout Algorithms
 *
 * Provides force-directed, circular, and hierarchical layout algorithms
 * for the knowledge graph visualization.
 */

export interface GraphNode {
  id: string;
  label: string;
  type: 'concept' | 'book' | 'theme';
  bookIds?: string[];
  x: number;
  y: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

/** Get a position on a circle for a given index/total. */
export function getNodePosition(index: number, total: number) {
  const angle = (2 * Math.PI * index) / total - Math.PI / 2;
  return {
    x: Math.max(10, Math.min(90, 50 + 35 * Math.cos(angle))),
    y: Math.max(10, Math.min(90, 50 + 30 * Math.sin(angle))),
  };
}

/** Simple force-directed layout for better graph positioning. */
export function forceDirectedLayout(
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
    const temp = 0.1 * (1 - iter / iterations);

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

/** Circular layout — nodes arranged in a circle. */
export function circularLayout(nodes: GraphNode[]): GraphNode[] {
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

/** Hierarchical layout — tree-like arrangement based on edge direction. */
export function hierarchicalLayout(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  if (nodes.length < 2) return nodes;

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

/** Apply a named layout algorithm to the graph nodes. */
export function applyLayout(nodes: GraphNode[], edges: GraphEdge[], mode: string): GraphNode[] {
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

/** Get node fill color by type. */
export function getNodeColor(type: string) {
  if (type === 'book') return '#d97706';
  if (type === 'theme') return '#14b8a6';
  return '#f59e0b';
}

/** Get node circle radius by type. */
export function getNodeSize(type: string) {
  return type === 'theme' ? 20 : type === 'book' ? 16 : 12;
}
