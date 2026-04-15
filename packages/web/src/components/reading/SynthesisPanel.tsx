'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';

// ============================================================================
// Types
// ============================================================================

type SynthesisAction = 'cross_reference' | 'concept_map' | 'find_contradictions' | 'summary_report' | 'synthesize';

interface SynthesisTab {
  key: SynthesisAction;
  label: string;
  icon: string;
  description: string;
}

interface ConceptNode {
  id: string;
  label: string;
  type: 'concept' | 'book' | 'author' | 'theme';
  weight: number;
}

interface ConceptEdge {
  source: string;
  target: string;
  label: string;
  strength: number;
}

interface Contradiction {
  topic: string;
  position1: { book: { title: string; author: string }; claim: string };
  position2: { book: { title: string; author: string }; claim: string };
  severity: 'low' | 'medium' | 'high';
  analysis: string;
}

interface CrossReference {
  book: { title: string; author: string };
  type: string;
  explanation: string;
}

interface Theme {
  name: string;
  description: string;
  strength: number;
}

interface AnalysisResult {
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

interface SynthesisPanelProps {
  bookId: string;
  bookTitle?: string;
  author?: string;
  isOpen: boolean;
  onClose: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const TABS: SynthesisTab[] = [
  {
    key: 'cross_reference',
    label: 'Cross-Ref',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
    description: 'Find how a concept appears across your books',
  } as SynthesisTab & { icon: React.ReactNode },
  {
    key: 'concept_map',
    label: 'Concept Map',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    description: 'Visualize relationships between ideas',
  } as SynthesisTab & { icon: React.ReactNode },
  {
    key: 'find_contradictions',
    label: 'Contradictions',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    description: 'Discover where authors disagree',
  } as SynthesisTab & { icon: React.ReactNode },
  {
    key: 'summary_report',
    label: 'Summary',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    description: 'Generate a comprehensive synthesis report',
  } as SynthesisTab & { icon: React.ReactNode },
  {
    key: 'synthesize',
    label: 'Synthesize',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
    ),
    description: 'Synthesize insights across your library',
  } as SynthesisTab & { icon: React.ReactNode },
];

// ============================================================================
// Component
// ============================================================================

export function SynthesisPanel({
  bookId,
  bookTitle,
  author,
  isOpen,
  onClose,
}: SynthesisPanelProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<SynthesisAction>('cross_reference');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state for each action
  const [concept, setConcept] = useState('');
  const [topic, setTopic] = useState('');
  const [query, setQuery] = useState('');
  const [focus, setFocus] = useState('');
  const [depth, setDepth] = useState<'brief' | 'standard' | 'deep'>('standard');
  const [analysisType, setAnalysisType] = useState<'supporting' | 'contradicting' | 'extending' | 'all'>('all');
  const [minSeverity, setMinSeverity] = useState<'low' | 'medium' | 'high'>('medium');
  const [reportFormat, setReportFormat] = useState<'narrative' | 'structured' | 'academic'>('structured');

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleAnalyze = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let input: Record<string, unknown>;

      switch (activeTab) {
        case 'cross_reference':
          if (!concept.trim()) {
            setError('Enter a concept to cross-reference');
            setLoading(false);
            return;
          }
          input = {
            concept: concept.trim(),
            sourceBookId: bookId,
            analysisType,
          };
          break;

        case 'concept_map':
          if (!topic.trim()) {
            setError('Enter a topic for the concept map');
            setLoading(false);
            return;
          }
          input = { topic: topic.trim(), maxNodes: 20 };
          break;

        case 'find_contradictions':
          input = {
            ...(topic.trim() ? { topic: topic.trim() } : {}),
            minSeverity,
            bookIds: [bookId],
          };
          break;

        case 'summary_report':
          input = {
            bookIds: [bookId],
            ...(focus.trim() ? { focus: focus.trim() } : {}),
            format: reportFormat,
          };
          break;

        case 'synthesize':
          if (!query.trim()) {
            setError('Enter a query to synthesize');
            setLoading(false);
            return;
          }
          input = {
            query: query.trim(),
            bookIds: [bookId],
            depth,
          };
          break;

        default:
          return;
      }

      const response = await api.post<AnalysisResult>(`/api/synthesis/${activeTab === 'cross_reference' ? 'cross-reference' : activeTab === 'find_contradictions' ? 'contradictions' : activeTab === 'summary_report' ? 'report' : activeTab}`, input);

      if (response.success && response.data) {
        setResult(response.data as AnalysisResult);
      } else {
        setError(response.error?.message || 'Analysis failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      toast('Analysis failed', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeTab, bookId, concept, topic, query, focus, depth, analysisType, minSeverity, reportFormat, toast]);

  const renderForm = () => {
    switch (activeTab) {
      case 'cross_reference':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Concept to cross-reference
              </label>
              <input
                type="text"
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                placeholder="e.g., cognitive bias, mindfulness, systems thinking"
                className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-1 focus:ring-amber-400/50 focus:border-amber-400 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Analysis type
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {(['all', 'supporting', 'contradicting', 'extending'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setAnalysisType(t)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      analysisType === t
                        ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 'concept_map':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Topic for concept map
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., decision making, human behavior"
                className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-1 focus:ring-amber-400/50 focus:border-amber-400 transition-all"
              />
            </div>
          </div>
        );

      case 'find_contradictions':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Topic (optional)
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Leave empty for general analysis"
                className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-1 focus:ring-amber-400/50 focus:border-amber-400 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Minimum severity
              </label>
              <div className="flex gap-1.5">
                {(['low', 'medium', 'high'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setMinSeverity(s)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      minSeverity === s
                        ? s === 'high'
                          ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                          : s === 'medium'
                            ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                            : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 'summary_report':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Focus area (optional)
              </label>
              <input
                type="text"
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                placeholder="e.g., leadership themes, scientific method"
                className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-1 focus:ring-amber-400/50 focus:border-amber-400 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Report format
              </label>
              <div className="flex gap-1.5">
                {(['structured', 'narrative', 'academic'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setReportFormat(f)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      reportFormat === f
                        ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 'synthesize':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Synthesis query
              </label>
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g., How do these books approach decision making?"
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-1 focus:ring-amber-400/50 focus:border-amber-400 transition-all resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Depth
              </label>
              <div className="flex gap-1.5">
                {(['brief', 'standard', 'deep'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDepth(d)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      depth === d
                        ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
    }
  };

  const renderResult = () => {
    if (!result) return null;

    const content = result.analysis || result.synthesis || result.report || result.summary || '';
    const textContent = typeof content === 'string' ? content : '';

    return (
      <div className="space-y-4">
        {/* Themes */}
        {result.themes && result.themes.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Key Themes
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {result.themes.map((theme, i) => (
                <span
                  key={i}
                  className="inline-flex items-center px-2 py-1 rounded-lg text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 border border-amber-200/50 dark:border-amber-800/30"
                >
                  {theme.name}
                  <span className="ml-1.5 text-[10px] opacity-50">
                    {Math.round(theme.strength * 100)}%
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Insights */}
        {result.insights && result.insights.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Key Insights
            </h4>
            <ul className="space-y-1.5">
              {result.insights.map((insight, i) => (
                <li key={i} className="text-xs text-gray-700 dark:text-gray-300 pl-3 border-l-2 border-teal-400">
                  {insight}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Cross-references */}
        {result.references && result.references.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              References Found
            </h4>
            <div className="space-y-2">
              {result.references.map((ref, i) => (
                <div key={i} className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      ref.type === 'supporting'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : ref.type === 'contradicting'
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                          : ref.type === 'extending'
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }`}>
                      {ref.type}
                    </span>
                    <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                      {ref.book.title}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2">
                    {ref.explanation}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Contradictions */}
        {result.contradictions && result.contradictions.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Contradictions ({result.contradictions.length})
            </h4>
            <div className="space-y-2">
              {result.contradictions.map((c, i) => (
                <div key={i} className="p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                      c.severity === 'high'
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                        : c.severity === 'medium'
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                          : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    }`}>
                      {c.severity}
                    </span>
                    <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                      {c.topic}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 rounded bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700">
                      <p className="font-medium text-gray-700 dark:text-gray-300 mb-0.5">{c.position1.book.title}</p>
                      <p className="text-gray-500 dark:text-gray-400 line-clamp-3">{c.position1.claim}</p>
                    </div>
                    <div className="p-2 rounded bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700">
                      <p className="font-medium text-gray-700 dark:text-gray-300 mb-0.5">{c.position2.book.title}</p>
                      <p className="text-gray-500 dark:text-gray-400 line-clamp-3">{c.position2.claim}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Concept Map */}
        {result.nodes && result.nodes.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Concept Map ({result.nodes.length} nodes, {result.edges?.length || 0} edges)
            </h4>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {result.nodes.map((node) => (
                <span
                  key={node.id}
                  className={`inline-flex items-center px-2 py-1 rounded-lg text-xs border ${
                    node.type === 'concept'
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 border-blue-200/50 dark:border-blue-800/30'
                      : node.type === 'book'
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border-green-200/50 dark:border-green-800/30'
                        : node.type === 'theme'
                          ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-800 dark:text-purple-200 border-purple-200/50 dark:border-purple-800/30'
                          : 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 border-amber-200/50 dark:border-amber-800/30'
                  }`}
                >
                  {node.label}
                  <span className="ml-1 text-[9px] opacity-40">{node.type}</span>
                </span>
              ))}
            </div>
            {result.edges && result.edges.length > 0 && (
              <div className="space-y-1">
                {result.edges.slice(0, 15).map((edge, i) => (
                  <div key={i} className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <span className="truncate max-w-[80px]">{edge.source}</span>
                    <svg className="w-3 h-3 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                    <span className="text-amber-600 dark:text-amber-400 truncate">{edge.label}</span>
                    <svg className="w-3 h-3 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                    <span className="truncate max-w-[80px]">{edge.target}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Report meta */}
        {result.booksCovered !== undefined && (
          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              {result.booksCovered} book{result.booksCovered !== 1 ? 's' : ''} covered
            </span>
          </div>
        )}

        {/* Main analysis text */}
        {textContent && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Analysis
            </h4>
            <div className="prose prose-sm dark:prose-invert max-w-none text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 max-h-[400px] overflow-y-auto">
              {textContent}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 animate-fade-in z-30"
          onClick={onClose}
          onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
          tabIndex={-1}
          role="button"
          aria-label="Close synthesis panel"
        />
      )}

      {/* Panel */}
      <div
        className={`fixed left-0 top-0 h-screen w-full md:w-[400px] bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 shadow-lg z-30 transform transition-transform duration-300 ease-out overflow-hidden flex flex-col overscroll-contain ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-amber-200/50 dark:border-amber-900/30">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100">
              Synthesis
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
            aria-label="Close synthesis panel (Esc)"
            title="Close (Esc)"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Book info */}
        {bookTitle && (
          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {bookTitle}{author ? ` by ${author}` : ''}
            </p>
          </div>
        )}

        {/* Tabs */}
        <div role="tablist" aria-label="Analysis modes" className="flex border-b border-gray-200 dark:border-gray-700 px-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setResult(null);
                setError(null);
              }}
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`flex items-center gap-1.5 px-2.5 py-2.5 text-[11px] font-medium transition-colors relative whitespace-nowrap ${
                activeTab === tab.key
                  ? 'text-amber-700 dark:text-amber-300'
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-1 right-1 h-0.5 bg-amber-500 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Tab description */}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {TABS.find((t) => t.key === activeTab)?.description}
          </p>

          {/* Form */}
          {renderForm()}

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center gap-3 py-8 justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-amber-600 border-t-transparent" />
              <span className="text-sm text-gray-500 dark:text-gray-400">Analyzing your library...</span>
            </div>
          )}

          {/* Result */}
          {!loading && renderResult()}

          {/* Empty state */}
          {!loading && !result && !error && (
            <div className="text-center py-8">
              <div className="text-3xl mb-2 opacity-20">
                <svg className="w-10 h-10 mx-auto text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Fill in the form above and run the analysis.
              </p>
            </div>
          )}
        </div>

        {/* Run button */}
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="w-full px-4 py-2.5 text-sm font-medium rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                Analyzing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Run Analysis
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}

export default SynthesisPanel;
