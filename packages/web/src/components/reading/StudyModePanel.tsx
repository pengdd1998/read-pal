'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';

import type { ChapterObjective, ConceptCheck, MasteryReport } from '@/hooks/useStudyMode';

interface StudyModePanelProps {
 enabled: boolean;
 loading: boolean;
 error: string | null;
 saveStatus: 'idle' | 'saving' | 'saved' | 'failed';
 objectives: ChapterObjective[];
 checks: ConceptCheck[];
 revealedAnswers: Set<string>;
 mastery: MasteryReport | null;
 onLoadMastery: () => void;
 onToggleObjective: (id: string) => void;
 onRevealAnswer: (id: string) => void;
 onSaveChecks: (checks: ConceptCheck[]) => void;
}

export const StudyModePanel = React.memo(function StudyModePanel({
 enabled,
 loading,
 error,
 saveStatus,
 objectives,
 checks,
 revealedAnswers,
 mastery,
 onLoadMastery,
 onToggleObjective,
 onRevealAnswer,
 onSaveChecks,
}: StudyModePanelProps) {
 const t = useTranslations('study');
 const tr = useTranslations('reader');
 const [activeTab, setActiveTab] = useState<'objectives' | 'checks' | 'mastery'>('objectives');

 if (!enabled) return null;

 const completedCount = objectives.filter((o) => o.completed).length;
 const answeredCount = revealedAnswers.size;

 return (
 <div className="bg-surface-0 border border-amber-200 dark:border-amber-800 rounded-xl overflow-hidden">
  {/* Header */}
  <div className="bg-amber-50 dark:bg-amber-900/20 px-4 py-3 border-b border-amber-200 dark:border-amber-800">
  <div className="flex items-center justify-between">
   <div className="flex items-center gap-2">
   <svg aria-hidden="true" className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
   <h3 className="font-semibold text-amber-900 dark:text-amber-200 text-sm">{tr('study_mode_title')}</h3>
   </div>
   {mastery && (
   <span className="text-xs text-amber-700 dark:text-amber-400">
    {t('mastery_percent', { pct: Math.round(mastery.overallMastery * 100) })}
   </span>
   )}
  </div>

  {/* Tabs */}
  <div className="flex gap-1 mt-2">
   {(['objectives', 'checks', 'mastery'] as const).map((tab) => (
   <button
    key={tab}
    aria-label={
     tab === 'objectives' ? t('goals_tab', { done: completedCount, total: objectives.length })
     : tab === 'checks' ? t('checks_tab', { done: answeredCount, total: checks.length })
     : t('progress_tab')
    }
    onClick={() => {
      setActiveTab(tab);
      if (tab === 'mastery' && !mastery) onLoadMastery();
    }}
    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 ${
    activeTab === tab
     ? 'bg-amber-200 dark:bg-amber-700 text-amber-900 dark:text-amber-100'
     : 'text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-800/50'
    }`}
   >
    {tab === 'objectives' && t('goals_tab', { done: completedCount, total: objectives.length })}
    {tab === 'checks' && t('checks_tab', { done: answeredCount, total: checks.length })}
    {tab === 'mastery' && t('progress_tab')}
   </button>
   ))}
  </div>
  </div>

  {/* Content */}
  <div className="p-4 max-h-80 overflow-y-auto">
  {error && (
   <div className="mb-3 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-400">
    {error}
   </div>
  )}
  {loading && (
   <div className="flex items-center justify-center py-8">
   <div className="w-5 h-5 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
   <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">{t('generating')}</span>
   </div>
  )}

  {!loading && activeTab === 'objectives' && (
   <div className="space-y-2">
   {objectives.length === 0 ? (
    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
    {t('highlight_for_objectives')}
    </p>
   ) : (
    objectives.map((obj) => (
    <button
     key={obj.id}
     aria-label={`${obj.completed ? t('completed') : t('incomplete')}: ${obj.text}`}
     onClick={() => onToggleObjective(obj.id)}
     className={`w-full text-left flex items-start gap-3 p-3 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 ${
     obj.completed
      ? 'bg-emerald-50 dark:bg-emerald-900/20'
      : 'bg-surface-1 hover:bg-surface-2'
     }`}
    >
     <span className={`flex-shrink-0 mt-0.5 ${obj.completed ? 'text-emerald-500' : 'text-gray-300 dark:text-gray-600'}`}>
     {obj.completed ? (
      <svg aria-hidden="true" className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
     ) : (
      <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      </svg>
     )}
     </span>
     <span className={`text-sm leading-relaxed ${
     obj.completed ? 'text-emerald-700 dark:text-emerald-300 line-through' : 'text-gray-700 dark:text-gray-300'
     }`}>
     {obj.text}
     </span>
    </button>
    ))
   )}
   </div>
  )}

  {!loading && activeTab === 'checks' && (
   <div className="space-y-3">
   {checks.length === 0 ? (
    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
    {t('checks_appear')}
    </p>
   ) : (
    checks.map((check) => {
    const isRevealed = revealedAnswers.has(check.id);
    return (
     <div
     key={check.id}
     className="border border-surface-3 rounded-lg overflow-hidden"
     >
     <div className="p-3">
      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
      {check.question}
      </p>
      {!isRevealed && check.hint && (
      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 italic">
       {t('hint_prefix', { hint: check.hint })}
      </p>
      )}
     </div>
     {!isRevealed ? (
      <button
      aria-label={t('reveal_answer_for', { question: check.question })}
      onClick={() => onRevealAnswer(check.id)}
      className="w-full px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-800/30 border-t border-surface-3 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
      >
      {t('reveal_answer')}
      </button>
     ) : (
      <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 border-t border-emerald-200 dark:border-emerald-800">
      <p className="text-xs text-emerald-800 dark:text-emerald-300">
       {check.answer}
      </p>
      </div>
     )}
     </div>
    );
    })
   )}
   {checks.length > 0 && answeredCount === checks.length && (
    <button
    aria-label={t('add_to_flashcard')}
    onClick={() => onSaveChecks(checks)}
    disabled={saveStatus === 'saving'}
    className="w-full mt-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
    >
    {saveStatus === 'saving' ? t('saving')
     : saveStatus === 'saved' ? t('saved')
     : saveStatus === 'failed' ? t('save_failed')
     : t('add_to_flashcard')}
    </button>
   )}
   </div>
  )}

  {!loading && activeTab === 'mastery' && !mastery && (
   <div className="text-center py-8">
    <div className="w-5 h-5 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin mx-auto mb-3" />
    <p className="text-sm text-gray-500 dark:text-gray-400">{t('loading_mastery')}</p>
   </div>
  )}
  {!loading && activeTab === 'mastery' && mastery && (
   <div className="space-y-4">
   {/* Mastery bar */}
   <div>
    <div className="flex justify-between text-xs mb-1">
    <span className="text-gray-600 dark:text-gray-400">{t('overall_mastery')}</span>
    <span className="font-medium text-amber-700 dark:text-amber-400">
     {Math.round(mastery.overallMastery * 100)}%
    </span>
    </div>
    <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
    <div
     className="h-full bg-gradient-to-r from-amber-400 to-emerald-500 rounded-full transition-all duration-500"
     style={{ width: `${mastery.overallMastery * 100}%` }}
    />
    </div>
   </div>

   {/* Stats grid */}
   <div className="grid grid-cols-2 gap-3">
    <div className="bg-surface-1 rounded-lg p-3">
    <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
     {mastery.chaptersCompleted}/{mastery.totalChapters}
    </div>
    <div className="text-xs text-gray-500 dark:text-gray-400">{t('chapters_read')}</div>
    </div>
    <div className="bg-surface-1 rounded-lg p-3">
    <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
     {mastery.cardsDue}
    </div>
    <div className="text-xs text-gray-500 dark:text-gray-400">{t('cards_due')}</div>
    </div>
   </div>

   {/* Weak/Strong areas */}
   {mastery.strongAreas.length > 0 && (
    <div>
    <h4 className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1">{t('strong_areas')}</h4>
    <div className="space-y-1">
     {mastery.strongAreas.slice(0, 3).map((area) => (
     <div key={area} className="text-xs text-gray-600 dark:text-gray-400 truncate">
      {area.slice(0, 80)}{area.length > 80 ? '...' : ''}
     </div>
     ))}
    </div>
    </div>
   )}
   {mastery.weakAreas.length > 0 && (
    <div>
    <h4 className="text-xs font-medium text-orange-600 dark:text-orange-400 mb-1">{t('needs_review')}</h4>
    <div className="space-y-1">
     {mastery.weakAreas.slice(0, 3).map((area) => (
     <div key={area} className="text-xs text-gray-600 dark:text-gray-400 truncate">
      {area.slice(0, 80)}{area.length > 80 ? '...' : ''}
     </div>
     ))}
    </div>
    </div>
   )}
   </div>
  )}
  </div>
 </div>
 );
});
