'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import { runForceSimulation } from '@/lib/force-simulation';
import type {
  VisualizationNode,
  VisualizationEdge,
  CrossBookTheme,
  KnowledgeGap,
  SimNode,
} from '@/types/knowledge';

export interface UseKnowledgeGraphReturn {
  nodes: SimNode[];
  edges: VisualizationEdge[];
  themes: CrossBookTheme[];
  gaps: KnowledgeGap[];
  isAvailable: boolean;
  loading: boolean;
  error: string | null;
  dimensions: { width: number; height: number };
  svgRef: React.RefObject<SVGSVGElement>;
  refetch: () => void;
}

export function useKnowledgeGraph(errorMessage: string): UseKnowledgeGraphReturn {
  const svgRef = useRef<SVGSVGElement>(null!);

  const [nodes, setNodes] = useState<SimNode[]>([]);
  const [edges, setEdges] = useState<VisualizationEdge[]>([]);
  const [themes, setThemes] = useState<CrossBookTheme[]>([]);
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [isAvailable, setNeo4jAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const [fetchKey, setFetchKey] = useState(0);
  const dataLoadedRef = useRef(false);

  const rawNodesRef = useRef<VisualizationNode[]>([]);
  const rawEdgesRef = useRef<VisualizationEdge[]>([]);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    setFetchKey((k) => k + 1);
  }, []);

  // Fetch graph data
  useEffect(() => {
    let stale = false;
    async function load() {
      try {
        const [graphRes, themesRes, gapsRes] = await Promise.all([
          api.get<{ neo4jAvailable?: boolean; nodes: VisualizationNode[]; edges: VisualizationEdge[] }>('/api/v1/knowledge/graph'),
          api.get<{ neo4jAvailable?: boolean; themes: CrossBookTheme[] }>('/api/v1/knowledge/themes'),
          api.get<{ gaps?: KnowledgeGap[] }>('/api/v1/knowledge/gaps').catch((err) => { console.warn('useKnowledgeGraph: gaps fetch failed', err); return { data: { gaps: [] } }; }),
        ]);

        if (stale) return;

        const available = graphRes.data?.neo4jAvailable ?? true;
        setNeo4jAvailable(available);
        setThemes(themesRes.data?.themes ?? []);
        setGaps(gapsRes.data?.gaps ?? []);

        if (graphRes.data) {
          rawNodesRef.current = graphRes.data.nodes || [];
          rawEdgesRef.current = graphRes.data.edges || [];
          setEdges(rawEdgesRef.current);
          dataLoadedRef.current = true;
        }
      } catch {
        if (!stale) setError(errorMessage);
      } finally {
        if (!stale) setLoading(false);
      }
    }
    load();
    return () => { stale = true; };
  }, [errorMessage, fetchKey]);

  // Recompute layout when dimensions change or data is refetched
  useEffect(() => {
    if (!dataLoadedRef.current) return;
    const rawNodes = rawNodesRef.current;
    const rawEdges = rawEdgesRef.current;
    if (rawNodes.length === 0) return;
    const simNodes: SimNode[] = rawNodes.map((n) => ({
      ...n,
      x: dimensions.width / 2 + (Math.random() - 0.5) * 300,
      y: dimensions.height / 2 + (Math.random() - 0.5) * 300,
      vx: 0,
      vy: 0,
    }));
    runForceSimulation(simNodes, rawEdges, dimensions.width, dimensions.height);
    setNodes(simNodes);
  }, [dimensions.width, dimensions.height, fetchKey]);

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

  return {
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
  };
}
