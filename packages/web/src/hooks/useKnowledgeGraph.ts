'use client';

import { useEffect, useState, useRef } from 'react';
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
  neo4jAvailable: boolean;
  loading: boolean;
  error: string | null;
  dimensions: { width: number; height: number };
  svgRef: React.RefObject<SVGSVGElement>;
}

export function useKnowledgeGraph(errorMessage: string): UseKnowledgeGraphReturn {
  const svgRef = useRef<SVGSVGElement>(null!);

  const [nodes, setNodes] = useState<SimNode[]>([]);
  const [edges, setEdges] = useState<VisualizationEdge[]>([]);
  const [themes, setThemes] = useState<CrossBookTheme[]>([]);
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [neo4jAvailable, setNeo4jAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  // Fetch graph data
  useEffect(() => {
    async function load() {
      try {
        const [graphRes, themesRes, gapsRes] = await Promise.all([
          api.get<{ neo4jAvailable?: boolean; nodes: VisualizationNode[]; edges: VisualizationEdge[] }>('/api/v1/knowledge/graph'),
          api.get<{ neo4jAvailable?: boolean; themes: CrossBookTheme[] }>('/api/v1/knowledge/themes'),
          api.get<{ gaps?: KnowledgeGap[] }>('/api/v1/knowledge/gaps').catch(() => ({ data: { gaps: [] } })),
        ]);

        const available = graphRes.data?.neo4jAvailable ?? true;
        setNeo4jAvailable(available);
        setThemes(themesRes.data?.themes ?? []);
        setGaps(gapsRes.data?.gaps ?? []);

        if (graphRes.data) {
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
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [dimensions.width, dimensions.height, errorMessage]);

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
    neo4jAvailable,
    loading,
    error,
    dimensions,
    svgRef,
  };
}
