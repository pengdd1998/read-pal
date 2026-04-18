// ============================================================================
// Shared Types for Synthesis Components
// ============================================================================

export type SynthesisAction =
  | 'cross_reference'
  | 'concept_map'
  | 'find_contradictions'
  | 'summary_report'
  | 'synthesize';

export interface SynthesisTab {
  key: SynthesisAction;
  label: string;
  icon: React.ReactNode;
  description: string;
}

export interface ConceptNode {
  id: string;
  label: string;
  type: 'concept' | 'book' | 'author' | 'theme';
  weight: number;
}

export interface ConceptEdge {
  source: string;
  target: string;
  label: string;
  strength: number;
}

export interface Contradiction {
  topic: string;
  position1: { book: { title: string; author: string }; claim: string };
  position2: { book: { title: string; author: string }; claim: string };
  severity: 'low' | 'medium' | 'high';
  analysis: string;
}

export interface CrossReference {
  book: { title: string; author: string };
  type: string;
  explanation: string;
}

export interface Theme {
  name: string;
  description: string;
  strength: number;
}

export interface AnalysisResult {
  themes?: Theme[];
  connections?: Array<{ concept: string; relationship: string }>;
  synthesis?: string;
  concept?: string;
  source?: { title: string; author: string };
  references?: CrossReference[];
  analysis?: string;
  nodes?: ConceptNode[];
  edges?: ConceptEdge[];
  summary?: string;
  contradictions?: Contradiction[];
  report?: string;
  booksCovered?: number;
  insights?: string[];
}

export interface SynthesisPanelProps {
  bookId: string;
  bookTitle?: string;
  author?: string;
  isOpen: boolean;
  onClose: () => void;
}
