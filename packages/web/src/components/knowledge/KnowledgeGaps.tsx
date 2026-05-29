'use client';

import React from 'react';
import type { KnowledgeGap } from '@/types/knowledge';

interface KnowledgeGapsProps {
  gaps: KnowledgeGap[];
  t: (key: string, params?: Record<string, string | number>) => string;
}

export function KnowledgeGaps({ gaps, t }: KnowledgeGapsProps) {
  return (
    <div className="bg-surface-0 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <h3 className="font-semibold text-gray-900 dark:text-white mb-3">{t('knowledge_gaps_title')}</h3>
      {gaps.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('knowledge_gaps_empty')}</p>
      ) : (
        <div className="space-y-3">
          {gaps.map((gap) => (
            <div key={gap.concept} className="rounded-lg border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10 p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                <p className="text-sm font-medium text-gray-900 dark:text-white">{gap.concept}</p>
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-400 mb-1">{gap.reason}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                <span className="font-medium">{t('gap_suggestion')}:</span> {gap.suggestion}
              </p>
              {gap.suggested_action && (
                <p className="text-xs text-teal-700 dark:text-teal-400 flex items-start gap-1">
                  <span aria-hidden="true" className="shrink-0 mt-px">&#x2192;</span>
                  <span>
                    <span className="font-medium">{t('gap_action')}:</span> {gap.suggested_action}
                  </span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
