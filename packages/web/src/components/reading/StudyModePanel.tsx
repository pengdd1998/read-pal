'use client';

import { useState } from 'react';
import type { ChapterObjective, ConceptCheck, MasteryReport } from '@/hooks/useStudyMode';

interface StudyModePanelProps {
  enabled: boolean;
  loading: boolean;
  objectives: ChapterObjective[];
  checks: ConceptCheck[];
  revealedAnswers: Set<string>;
  mastery: MasteryReport | null;
  onToggleObjective: (id: string) => void;
  onRevealAnswer: (id: string) => void;
  onSaveChecks: (checks: ConceptCheck[]) => void;
}

export function StudyModePanel({
  enabled,
  loading,
  objectives,
  checks,
  revealedAnswers,
  mastery,
  onToggleObjective,
  onRevealAnswer,
  onSaveChecks,
}: StudyModePanelProps) {
  const [activeTab, setActiveTab] = useState<'objectives' | 'checks' | 'mastery'>('objectives');

  if (!enabled) return null;

  const completedCount = objectives.filter((o) => o.completed).length;
  const answeredCount = revealedAnswers.size;

  return (
    <div className="bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-amber-50 dark:bg-amber-900/20 px-4 py-3 border-b border-amber-200 dark:border-amber-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📚</span>
            <h3 className="font-semibold text-amber-900 dark:text-amber-200 text-sm">Study Mode</h3>
          </div>
          {mastery && (
            <span className="text-xs text-amber-700 dark:text-amber-400">
              Mastery: {Math.round(mastery.overallMastery * 100)}%
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-2">
          {(['objectives', 'checks', 'mastery'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-amber-200 dark:bg-amber-700 text-amber-900 dark:text-amber-100'
                  : 'text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-800/50'
              }`}
            >
              {tab === 'objectives' && `Goals (${completedCount}/${objectives.length})`}
              {tab === 'checks' && `Checks (${answeredCount}/${checks.length})`}
              {tab === 'mastery' && 'Progress'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 max-h-80 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
            <span className="ml-2 text-sm text-gray-500">Generating study material...</span>
          </div>
        )}

        {!loading && activeTab === 'objectives' && (
          <div className="space-y-2">
            {objectives.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                Highlight text in this chapter to get personalized objectives
              </p>
            ) : (
              objectives.map((obj) => (
                <button
                  key={obj.id}
                  onClick={() => onToggleObjective(obj.id)}
                  className={`w-full text-left flex items-start gap-3 p-3 rounded-lg transition-colors ${
                    obj.completed
                      ? 'bg-emerald-50 dark:bg-emerald-900/20'
                      : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className={`flex-shrink-0 mt-0.5 ${obj.completed ? 'text-emerald-500' : 'text-gray-300'}`}>
                    {obj.completed ? (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
              <p className="text-sm text-gray-500 text-center py-4">
                Concept checks will appear as you read
              </p>
            ) : (
              checks.map((check) => {
                const isRevealed = revealedAnswers.has(check.id);
                return (
                  <div
                    key={check.id}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                  >
                    <div className="p-3">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        {check.question}
                      </p>
                      {!isRevealed && check.hint && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 italic">
                          Hint: {check.hint}
                        </p>
                      )}
                    </div>
                    {!isRevealed ? (
                      <button
                        onClick={() => onRevealAnswer(check.id)}
                        className="w-full px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-800/30 border-t border-gray-200 dark:border-gray-700 transition-colors"
                      >
                        Reveal Answer
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
                onClick={() => onSaveChecks(checks)}
                className="w-full mt-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Add to Flashcard Review
              </button>
            )}
          </div>
        )}

        {!loading && activeTab === 'mastery' && mastery && (
          <div className="space-y-4">
            {/* Mastery bar */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-600 dark:text-gray-400">Overall Mastery</span>
                <span className="font-medium text-amber-700 dark:text-amber-400">
                  {Math.round(mastery.overallMastery * 100)}%
                </span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${mastery.overallMastery * 100}%` }}
                />
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <div className="text-lg font-bold text-gray-900 dark:text-white">
                  {mastery.chaptersCompleted}/{mastery.totalChapters}
                </div>
                <div className="text-xs text-gray-500">Chapters Read</div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
                  {mastery.cardsDue}
                </div>
                <div className="text-xs text-gray-500">Cards Due</div>
              </div>
            </div>

            {/* Weak/Strong areas */}
            {mastery.strongAreas.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1">Strong Areas</h4>
                <div className="space-y-1">
                  {mastery.strongAreas.slice(0, 3).map((area, i) => (
                    <div key={i} className="text-xs text-gray-600 dark:text-gray-400 truncate">
                      {area.slice(0, 80)}{area.length > 80 ? '...' : ''}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {mastery.weakAreas.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-orange-600 dark:text-orange-400 mb-1">Needs Review</h4>
                <div className="space-y-1">
                  {mastery.weakAreas.slice(0, 3).map((area, i) => (
                    <div key={i} className="text-xs text-gray-600 dark:text-gray-400 truncate">
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
}
