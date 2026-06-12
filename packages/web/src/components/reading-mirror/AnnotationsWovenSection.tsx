'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

interface Phase {
  name: string;
  narrative: string;
  key_notes: string[];
}

interface AnnotationsWovenSectionProps {
  data: Record<string, unknown>;
}

interface KeyNoteChipProps {
  note: string;
}

const KeyNoteChip = React.memo(function KeyNoteChip({ note }: KeyNoteChipProps) {
  return (
    <span className="inline-block px-2.5 py-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg text-xs text-amber-800 dark:text-amber-200 italic">
      {'“'}{note}{'”'}
    </span>
  );
});

interface PhaseTimelineItemProps {
  phase: Phase;
}

const PhaseTimelineItem = React.memo(function PhaseTimelineItem({ phase }: PhaseTimelineItemProps) {
  return (
    <div className="relative">
      {/* Timeline dot */}
      <div className="absolute -left-[calc(1.5rem+5px)] top-0 w-2.5 h-2.5 rounded-full bg-amber-500 ring-4 ring-surface-0" />

      <div className="space-y-2">
        <h4 className="font-serif text-lg font-semibold text-gray-900 dark:text-gray-100 m-0">
          {phase.name}
        </h4>

        <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed m-0">
          {phase.narrative}
        </p>

        {phase.key_notes && phase.key_notes.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {phase.key_notes.map((note, j) => (
              <KeyNoteChip key={j} note={note} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export default React.memo(function AnnotationsWovenSection({ data }: AnnotationsWovenSectionProps) {
  const t = useTranslations('readingMirror');
  const phases = (data.phases as Phase[]) || [];
  const arcSummary = data.arc_summary as string | undefined;

  if (phases.length === 0) {
    return (
      <div className="py-8 text-center">
        <span className="text-2xl">🧵</span>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 italic">{t('no_annotations_woven')}</p>
      </div>
    );
  }

  return (
    <div className="py-8 space-y-6">
      {arcSummary && (
        <p className="text-gray-600 dark:text-gray-400 text-base italic leading-relaxed max-w-[65ch]">
          {arcSummary}
        </p>
      )}

      {/* Phase timeline */}
      <div className="relative pl-6 border-l-2 border-amber-200 dark:border-amber-800 space-y-6">
        {phases.map((phase, i) => (
          <PhaseTimelineItem key={i} phase={phase} />
        ))}
      </div>
    </div>
  );
});
