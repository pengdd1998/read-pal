'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

interface Breakthrough {
  title: string;
  narrative: string;
  reader_question: string;
  insight: string;
}

interface ConversationsSectionProps {
  data: Record<string, unknown>;
}

export default React.memo(function ConversationsSection({ data }: ConversationsSectionProps) {
  const t = useTranslations('readingMirror');
  const breakthroughs = (data.breakthroughs as Breakthrough[]) || [];
  const summary = data.summary as string | undefined;

  if (breakthroughs.length === 0) {
    return (
      <div className="py-8 text-center">
        <span className="text-2xl">💬</span>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 italic">{t('no_conversations')}</p>
      </div>
    );
  }

  return (
    <div className="py-8 space-y-6">
      {summary && (
        <p className="text-gray-600 dark:text-gray-400 text-base italic leading-relaxed max-w-[65ch]">
          {summary}
        </p>
      )}

      <div className="space-y-5">
        {breakthroughs.map((bt, i) => (
          <div
            key={i}
            className="bg-surface-0 border border-amber-100 dark:border-amber-900/40 rounded-xl p-5 space-y-3"
          >
            <h4 className="font-serif text-lg font-semibold text-gray-900 dark:text-gray-100 m-0">
              {bt.title}
            </h4>

            <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed m-0">
              {bt.narrative}
            </p>

            {bt.reader_question && (
              <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                <span className="text-amber-600 dark:text-amber-400 text-xs font-semibold mt-0.5 shrink-0">Q</span>
                <p className="text-sm text-amber-900 dark:text-amber-200 m-0 italic">
                  {bt.reader_question}
                </p>
              </div>
            )}

            {bt.insight && (
              <div className="flex items-start gap-2 bg-teal-50 dark:bg-teal-900/20 rounded-lg px-3 py-2">
                <span className="text-teal-600 dark:text-teal-400 text-xs font-semibold mt-0.5 shrink-0">✦</span>
                <p className="text-sm text-teal-900 dark:text-teal-200 m-0">
                  {bt.insight}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});
