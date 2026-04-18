'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';
import {
  TABS,
  CrossReferenceForm,
  ConceptMapForm,
  ContradictionsForm,
  SummaryReportForm,
  SynthesizeForm,
  AnalysisResultView,
} from '@/components/synthesis';
import type { SynthesisAction, AnalysisResult, SynthesisPanelProps } from '@/components/synthesis';

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

  const buildInput = useCallback((): Record<string, unknown> | null => {
    switch (activeTab) {
      case 'cross_reference':
        if (!concept.trim()) { setError('Enter a concept to cross-reference'); return null; }
        return { concept: concept.trim(), sourceBookId: bookId, analysisType };
      case 'concept_map':
        if (!topic.trim()) { setError('Enter a topic for the concept map'); return null; }
        return { topic: topic.trim(), maxNodes: 20 };
      case 'find_contradictions':
        return { ...(topic.trim() ? { topic: topic.trim() } : {}), minSeverity, bookIds: [bookId] };
      case 'summary_report':
        return { bookIds: [bookId], ...(focus.trim() ? { focus: focus.trim() } : {}), format: reportFormat };
      case 'synthesize':
        if (!query.trim()) { setError('Enter a query to synthesize'); return null; }
        return { query: query.trim(), bookIds: [bookId], depth };
      default: return null;
    }
  }, [activeTab, bookId, concept, topic, query, focus, depth, analysisType, minSeverity, reportFormat]);

  const API_PATHS: Record<SynthesisAction, string> = {
    cross_reference: 'cross-reference',
    concept_map: 'concept_map',
    find_contradictions: 'contradictions',
    summary_report: 'report',
    synthesize: 'synthesize',
  };

  const handleAnalyze = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const input = buildInput();
      if (!input) {
        setLoading(false);
        return;
      }

      const response = await api.post<AnalysisResult>(`/api/synthesis/${API_PATHS[activeTab]}`, input);

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
  }, [activeTab, buildInput, toast]);

  const renderForm = () => {
    switch (activeTab) {
      case 'cross_reference': return <CrossReferenceForm concept={concept} onConceptChange={setConcept} analysisType={analysisType} onAnalysisTypeChange={setAnalysisType} />;
      case 'concept_map': return <ConceptMapForm topic={topic} onTopicChange={setTopic} />;
      case 'find_contradictions': return <ContradictionsForm topic={topic} onTopicChange={setTopic} minSeverity={minSeverity} onMinSeverityChange={setMinSeverity} />;
      case 'summary_report': return <SummaryReportForm focus={focus} onFocusChange={setFocus} reportFormat={reportFormat} onReportFormatChange={setReportFormat} />;
      case 'synthesize': return <SynthesizeForm query={query} onQueryChange={setQuery} depth={depth} onDepthChange={setDepth} />;
    }
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

      <div className={`fixed left-0 top-0 h-screen w-full md:w-[400px] bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 shadow-lg z-30 transform transition-transform duration-300 ease-out overflow-hidden flex flex-col overscroll-contain ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-amber-200/50 dark:border-amber-900/30">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100">Synthesis</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-500 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors" aria-label="Close synthesis panel (Esc)" title="Close (Esc)">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

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
              onClick={() => { setActiveTab(tab.key); setResult(null); setError(null); }}
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`flex items-center gap-1.5 px-2.5 py-2.5 text-[11px] font-medium transition-colors relative whitespace-nowrap ${
                activeTab === tab.key ? 'text-amber-700 dark:text-amber-300' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
              {activeTab === tab.key && <span className="absolute bottom-0 left-1 right-1 h-0.5 bg-amber-500 rounded-full" />}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {TABS.find((t) => t.key === activeTab)?.description}
          </p>
          {renderForm()}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-xs text-red-700 dark:text-red-300">{error}</div>
          )}
          {loading && (
            <div className="flex items-center gap-3 py-8 justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-amber-600 border-t-transparent" />
              <span className="text-sm text-gray-500 dark:text-gray-400">Analyzing your library...</span>
            </div>
          )}
          {!loading && result && <AnalysisResultView result={result} />}
          {!loading && !result && !error && (
            <div className="text-center py-8">
              <svg className="w-10 h-10 mx-auto text-amber-400 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              <p className="text-xs text-gray-400 dark:text-gray-500">Fill in the form above and run the analysis.</p>
            </div>
          )}
        </div>

        {/* Run button */}
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <button onClick={handleAnalyze} disabled={loading} className="w-full px-4 py-2.5 text-sm font-medium rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
            {loading ? (
              <><div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />Analyzing...</>
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
