'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

export type GenerationStep =
 | 'idle'
 | 'collecting'
 | 'analyzing'
 | 'curating'
 | 'synthesizing'
 | 'rendering'
 | 'finishing'
 | 'done'
 | 'error';

const STEPS: readonly GenerationStep[] = [
 'collecting',
 'analyzing',
 'curating',
 'synthesizing',
 'rendering',
 'finishing',
] as const;

interface GeneratingStateProps {
 genStep: GenerationStep;
}

export default React.memo(function GeneratingState({ genStep }: GeneratingStateProps) {
 const t = useTranslations('memoryBooks');

 const stepLabels: Record<GenerationStep, string> = {
 idle: t('starting'),
 collecting: t('stepCollecting'),
 analyzing: t('stepAnalyzing'),
 curating: t('stepCurating'),
 synthesizing: t('stepSynthesizing'),
 rendering: t('stepRendering'),
 finishing: t('stepFinishing'),
 done: t('stepDone'),
 error: t('stepError'),
 };

 return (
 <div className="max-w-md mx-auto px-4 py-20 text-center animate-fade-in">
  <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/30 dark:to-amber-800/30 flex items-center justify-center">
  <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" role="status" aria-label={t('creatingTitle')} />
  </div>
  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{t('creatingTitle')}</h2>
  <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('creatingDesc')}</p>
  <div className="space-y-2" aria-live="polite">
  {STEPS.map((step, idx) => {
    const currentIdx = STEPS.indexOf(genStep as typeof STEPS[number]);
    const isCompleted = idx < currentIdx;
    const isActive = genStep === step;
    return (
   <div
   key={step}
   className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg transition-all ${
    isActive
    ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 font-medium'
    : isCompleted
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-gray-500 dark:text-gray-400'
   }`}
   >
   {isActive ? (
    <div aria-hidden="true" className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
   ) : isCompleted ? (
    <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
     <polyline points="20 6 9 17 4 12" />
    </svg>
   ) : (
    <div className="w-4 h-4 rounded-full bg-surface-2" />
   )}
   {stepLabels[step]}
   </div>
    );
   })}
  </div>
 </div>
 );
});
