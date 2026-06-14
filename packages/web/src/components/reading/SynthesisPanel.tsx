'use client';

import React, { useState, useEffect, useCallback, useReducer, useRef } from 'react';
import { useTranslations } from 'next-intl';
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
import { warn } from '@/lib/logger';

// ---------------------------------------------------------------------------
// State machine for analysis: idle → loading → success/error, reset on tab switch.
// Consolidated so tab switches can't forget to clear a state, and so the
// "loading + result" combination (which previously let a stale request from
// tab A land in tab B) is structurally impossible.
// ---------------------------------------------------------------------------

type AnalysisStatus = 'idle' | 'loading' | 'success' | 'error';

type AnalysisState = {
 status: AnalysisStatus;
 result: AnalysisResult | null;
 error: string | null;
};

type AnalysisAction =
 | { type: 'reset' }
 | { type: 'start' }
 | { type: 'success'; result: AnalysisResult }
 | { type: 'fail'; error: string };

const initialAnalysis: AnalysisState = { status: 'idle', result: null, error: null };

function analysisReducer(state: AnalysisState, action: AnalysisAction): AnalysisState {
 switch (action.type) {
  case 'reset':
   return initialAnalysis;
  case 'start':
   return { status: 'loading', result: null, error: null };
  case 'success':
   return { status: 'success', result: action.result, error: null };
  case 'fail':
   return { status: 'error', result: null, error: action.error };
  default:
   return state;
 }
}

interface SynthesisTabProps {
 tab: { key: SynthesisAction; icon: React.ReactNode; label: string };
 isActive: boolean;
 onClick: () => void;
 label: string;
}

const SynthesisTab = React.memo(function SynthesisTab({ tab, isActive, onClick, label }: SynthesisTabProps) {
 return (
  <button type="button"
   onClick={onClick}
   role="tab"
   aria-selected={isActive}
   className={`flex items-center gap-1.5 px-2.5 py-2.5 text-[11px] font-medium transition-colors relative whitespace-nowrap focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 ${
   isActive ? 'text-amber-700 dark:text-amber-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-400'
   }`}
  >
   {tab.icon}
   {label}
   {isActive && <span className="absolute bottom-0 left-1 right-1 h-0.5 bg-amber-500 rounded-full" />}
  </button>
 );
});

export const SynthesisPanel = React.memo(function SynthesisPanel({
 bookId,
 bookTitle,
 author,
 isOpen,
 onClose,
}: SynthesisPanelProps) {
 const { toast } = useToast();
 const t = useTranslations('reader');
 const ts = useTranslations('synthesis');
 const tRef = useRef(t); tRef.current = t;
 const [activeTab, setActiveTab] = useState<SynthesisAction>('cross_reference');
 const [analysis, dispatch] = useReducer(analysisReducer, initialAnalysis);
 const abortRef = useRef<AbortController | null>(null);

 // Form state for each action
 const [concept, setConcept] = useState('');
 const [topic, setTopic] = useState('');
 const [query, setQuery] = useState('');
 const [focus, setFocus] = useState('');
 const [depth, setDepth] = useState<'brief' | 'standard' | 'deep'>('standard');
 const [analysisType, setAnalysisType] = useState<'supporting' | 'contradicting' | 'extending' | 'all'>('all');
 const [minSeverity, setMinSeverity] = useState<'low' | 'medium' | 'high'>('medium');
 const [reportFormat, setReportFormat] = useState<'narrative' | 'structured' | 'academic'>('structured');

 // Abort in-flight analysis on unmount or panel close
 useEffect(() => {
  if (!isOpen) abortRef.current?.abort();
  return () => abortRef.current?.abort();
 }, [isOpen]);

 // Escape key
 useEffect(() => {
 if (!isOpen) return;
 const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') onClose();
 };
 window.addEventListener('keydown', handleKeyDown);
 return () => window.removeEventListener('keydown', handleKeyDown);
 }, [isOpen, onClose]);

 const buildInput = useCallback((): { input: Record<string, unknown> } | { error: string } => {
 switch (activeTab) {
  case 'cross_reference':
  if (!concept.trim()) return { error: tRef.current('synthesis_enter_concept') };
  return { input: { concept: concept.trim(), sourceBookId: bookId, analysisType } };
  case 'concept_map':
  if (!topic.trim()) return { error: tRef.current('synthesis_enter_topic_map') };
  return { input: { topic: topic.trim(), maxNodes: 20 } };
  case 'find_contradictions':
  return { input: { ...(topic.trim() ? { topic: topic.trim() } : {}), minSeverity, bookIds: [bookId] } };
  case 'summary_report':
  return { input: { bookIds: [bookId], ...(focus.trim() ? { focus: focus.trim() } : {}), format: reportFormat } };
  case 'synthesize':
  if (!query.trim()) return { error: tRef.current('synthesis_enter_query') };
  return { input: { query: query.trim(), bookIds: [bookId], depth } };
  default:
  return { error: tRef.current('synthesis_analysis_failed') };
 }
 }, [activeTab, bookId, concept, topic, query, focus, depth, analysisType, minSeverity, reportFormat]);

 const handleAnalyze = useCallback(async () => {
 abortRef.current?.abort();
 const controller = new AbortController();
 abortRef.current = controller;

 const built = buildInput();
 if ('error' in built) {
  // Validation failed — surface error without entering loading state.
  dispatch({ type: 'fail', error: built.error });
  return;
 }

 dispatch({ type: 'start' });

 try {
  const response = await api.post<AnalysisResult>(`/api/synthesis/${bookId}`, {
  includeHighlights: true,
  includeNotes: true,
  includeConversations: true,
  ...built.input,
  }, { signal: controller.signal, timeout: 120_000 });

  if (controller.signal.aborted) return;
  if (response.success && response.data) {
  dispatch({ type: 'success', result: response.data as AnalysisResult });
  } else {
  dispatch({ type: 'fail', error: tRef.current('synthesis_analysis_failed') });
  }
 } catch (err) {
  if ((err as Error).name === 'AbortError' || (err as Error).name === 'CanceledError') return;
  warn('SynthesisPanel: analysis failed', err);
  dispatch({ type: 'fail', error: tRef.current('synthesis_network_error') });
  toast(tRef.current('synthesis_analysis_failed'), 'error');
 }
 }, [activeTab, bookId, buildInput, toast]);

 const selectTab = useCallback((next: SynthesisAction) => {
  if (next === activeTab) return;
  // Abort any in-flight analysis so its result can't land in the new tab.
  abortRef.current?.abort();
  setActiveTab(next);
  dispatch({ type: 'reset' });
 }, [activeTab]);

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
   className="fixed inset-0 bg-black/30 animate-fade-in z-30 focus-visible:ring-2 focus-visible:ring-amber-500"
   onClick={onClose}
   onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
   tabIndex={-1}
   aria-label={t('synthesis_close_label')}
  />
  )}

  <div className={`fixed left-0 top-[61px] bottom-0 w-full md:w-[400px] bg-surface-0 border-r border-surface-3 shadow-lg z-30 transform transition-transform duration-300 ease-out overflow-hidden flex flex-col overscroll-contain ${
  isOpen ? 'translate-x-0' : '-translate-x-full'
  }`}>
  {/* Header */}
  <div className="flex items-center justify-between px-4 py-3 border-b border-amber-200/50 dark:border-amber-900/30">
   <div className="flex items-center gap-2">
   <svg aria-hidden="true" className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
   </svg>
   <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100">{t('synthesis_title')}</h2>
   </div>
   <button type="button" onClick={onClose} className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1" aria-label={t('synthesis_close_label')} title={t('synthesis_close_esc')}>
   <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
   </svg>
   </button>
  </div>

  {bookTitle && (
   <div className="px-4 py-2 bg-surface-1 border-b border-surface-2">
   <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
    {bookTitle}{author ? t('synthesis_by_author', { author }) : ''}
   </p>
   </div>
  )}

  {/* Tabs */}
	  <div role="tablist" aria-label={t('synthesis_tab_label')} className="flex border-b border-surface-3 px-1 overflow-x-auto" onKeyDown={(e) => {
	   const idx = TABS.findIndex((tb) => tb.key === activeTab);
	   let next = -1;
	   if (e.key === 'ArrowRight') next = (idx + 1) % TABS.length;
	   else if (e.key === 'ArrowLeft') next = (idx - 1 + TABS.length) % TABS.length;
	   if (next >= 0) {
	    e.preventDefault();
	    selectTab(TABS[next].key);
	    (e.currentTarget.children[next] as HTMLElement)?.focus();
	   }
	  }}>
	   {TABS.map((tab) => (
	   <SynthesisTab
	    key={tab.key}
	    tab={tab}
	    isActive={activeTab === tab.key}
	    onClick={() => selectTab(tab.key)}
	    label={t(tab.label)}
	   />
	   ))}
	  </div>

  {/* Content */}
  <div className="flex-1 overflow-y-auto p-4 space-y-4">
   <p className="text-xs text-gray-500 dark:text-gray-400">
   {t(TABS.find((t) => t.key === activeTab)?.description ?? '')}
   </p>
   {renderForm()}
   {analysis.status === 'error' && analysis.error && (
   <div role="alert" className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-xs text-red-700 dark:text-red-300 flex items-center justify-between"><span>{analysis.error}</span><button type="button" onClick={handleAnalyze} className="ml-2 font-medium underline hover:no-underline whitespace-nowrap focus-visible:ring-2 focus-visible:ring-amber-400 rounded min-h-[44px] inline-flex items-center">{ts("synthesis_retry")}</button></div>
   )}
   {analysis.status === 'loading' && (
   <div aria-live="polite" className="flex items-center gap-3 py-8 justify-center">
    <div className="animate-spin rounded-full h-6 w-6 border-2 border-amber-600 border-t-transparent" aria-hidden="true" />
    <span className="text-sm text-gray-500 dark:text-gray-400">{t('synthesis_analyzing')}</span>
   </div>
   )}
   {analysis.status === 'success' && analysis.result && <div className="animate-fade-in"><AnalysisResultView result={analysis.result} /></div>}
   {analysis.status === 'idle' && (
   <div className="text-center py-8">
    <svg aria-hidden="true" className="w-10 h-10 mx-auto text-amber-400 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
    <p className="text-xs text-gray-500 dark:text-gray-400">{t('synthesis_fill_form')}</p>
   </div>
   )}
  </div>

  {/* Run button */}
  <div className="px-4 py-3 border-t border-surface-3">
   <button type="button" onClick={handleAnalyze} disabled={analysis.status === 'loading'} className="w-full px-4 py-2.5 text-sm font-medium rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2">
   {analysis.status === 'loading' ? (
    <><div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" aria-hidden="true" />{t('synthesis_analyzing_btn')}</>
   ) : (
    <>
    <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
    {t('synthesis_run')}
    </>
   )}
   </button>
  </div>
  </div>
 </>
 );
});

export default SynthesisPanel;
