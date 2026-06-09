'use client';

import React from 'react';

interface StepIndicatorProps {
  steps: string[];
  currentStep: string;
}

export const StepIndicator = React.memo(function StepIndicator({
  steps,
  currentStep,
}: StepIndicatorProps) {
  const currentIndex = steps.indexOf(currentStep);

  return (
    <div className="px-8 pb-6 flex items-center justify-center gap-2">
      {steps.map((s, i) => {
        const isCompleted = i < currentIndex;
        const isCurrent = i === currentIndex;

        return (
          <div
            key={s}
            className={`rounded-full transition-all duration-300 ${
              isCurrent
                ? 'w-6 h-2 bg-amber-500'
                : isCompleted
                  ? 'w-2 h-2 bg-amber-400'
                  : 'w-2 h-2 bg-surface-2'
            }`}
          />
        );
      })}
    </div>
  );
});
