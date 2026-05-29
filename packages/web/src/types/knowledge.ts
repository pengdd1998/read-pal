export interface VisualizationNode {
  id: string;
  label: string;
  bookId: string;
  bookTitle?: string;
  weight: number;
  group?: string;
  type?: string;
  description?: string;
  annotation_count?: number;
  source_book_ids?: string[];
  freshness?: number;
}

export interface VisualizationEdge {
  source: string;
  target: string;
  label: string;
  weight: number;
}

export interface CrossBookTheme {
  concept: string;
  conceptId: string;
  bookIds: string[];
  bookTitles: string[];
  strength: number;
  relatedConcepts: string[];
}

export interface KnowledgeGap {
  concept: string;
  reason: string;
  suggestion: string;
  suggested_action: string;
  connected_clusters: number;
}

export interface SimNode extends VisualizationNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}
