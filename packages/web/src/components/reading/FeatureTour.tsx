'use client';

import { useState, useEffect, useCallback } from 'react';

const TOUR_KEY = 'read-pal-tour-complete';
const TOUR_STEP_KEY = 'read-pal-tour-step';

export interface TourStep {
  targetId: string;
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

const STEPS: TourStep[] = [
  {
    targetId: 'tour-ai-companion',
    title: 'Your AI Reading Companion',
    description: 'Chat with your AI companion about the book. Ask questions, get explanations, or discuss themes as you read.',
    position: 'left',
  },
  {
    targetId: 'tour-annotations',
    title: 'Highlights & Notes',
    description: 'Select any text to highlight it, add notes, or ask AI about it. All your annotations are saved automatically.',
    position: 'bottom',
  },
  {
    targetId: 'tour-progress',
    title: 'Track Your Progress',
    description: 'Your reading session is tracked automatically. When you\'re done, you\'ll get an AI summary of what you covered.',
    position: 'bottom',
  },
];

/**
 * Lightweight feature tour for first-time readers.
 * Shows sequential tooltips pointing to key UI elements.
 * Persists completion in localStorage so it only shows once.
 */
export function FeatureTour() {
  const [step, setStep] = useState<number | null>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const completed = localStorage.getItem(TOUR_KEY);
    if (completed === 'true') return;

    // Restore saved step or start at 0
    const savedStep = localStorage.getItem(TOUR_STEP_KEY);
    const startStep = savedStep ? parseInt(savedStep, 10) : 0;
    if (startStep >= STEPS.length) {
      localStorage.setItem(TOUR_KEY, 'true');
      return;
    }

    // Wait for layout to settle, then start tour
    const timer = setTimeout(() => setStep(startStep), 1500);
    return () => clearTimeout(timer);
  }, []);

  // Update target position when step changes
  useEffect(() => {
    if (step === null) return;

    const el = document.getElementById(STEPS[step].targetId);
    if (!el) {
      // Target not rendered yet — retry after a short delay
      const t = setTimeout(() => {
        const retry = document.getElementById(STEPS[step].targetId);
        if (retry) setTargetRect(retry.getBoundingClientRect());
      }, 500);
      return () => clearTimeout(t);
    }

    setTargetRect(el.getBoundingClientRect());

    // Re-position on resize
    const onResize = () => setTargetRect(el.getBoundingClientRect());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [step]);

  const handleNext = useCallback(() => {
    const next = step !== null ? step + 1 : 0;
    if (next >= STEPS.length) {
      localStorage.setItem(TOUR_KEY, 'true');
      localStorage.removeItem(TOUR_STEP_KEY);
      setStep(null);
    } else {
      localStorage.setItem(TOUR_STEP_KEY, String(next));
      setStep(next);
    }
  }, [step]);

  const handleSkip = useCallback(() => {
    localStorage.setItem(TOUR_KEY, 'true');
    localStorage.removeItem(TOUR_STEP_KEY);
    setStep(null);
  }, []);

  if (step === null || !targetRect) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  // Compute tooltip position
  const gap = 12;
  let top = 0;
  let left = 0;

  switch (current.position) {
    case 'bottom':
      top = targetRect.bottom + gap;
      left = targetRect.left + targetRect.width / 2;
      break;
    case 'top':
      top = targetRect.top - gap;
      left = targetRect.left + targetRect.width / 2;
      break;
    case 'left':
      top = targetRect.top + targetRect.height / 2;
      left = targetRect.left - gap;
      break;
    case 'right':
      top = targetRect.top + targetRect.height / 2;
      left = targetRect.right + gap;
      break;
  }

  // Alignment classes
  const alignClass = current.position === 'bottom' || current.position === 'top'
    ? '-translate-x-1/2'
    : current.position === 'left'
      ? '-translate-x-full -translate-y-1/2'
      : '-translate-y-1/2';

  return (
    <>
      {/* Spotlight overlay */}
      <div className="fixed inset-0 z-[60] pointer-events-auto" onClick={handleSkip}>
        {/* Dark overlay with cutout */}
        <div className="absolute inset-0 bg-black/40 animate-fade-in" />
        {/* Highlight ring around target */}
        <div
          className="absolute rounded-lg ring-2 ring-amber-400 ring-offset-2 ring-offset-transparent shadow-[0_0_20px_rgba(251,191,36,0.3)] transition-all duration-300"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
          }}
        />
      </div>

      {/* Tooltip card */}
      <div
        className={`fixed z-[70] w-72 pointer-events-auto animate-scale-in ${alignClass}`}
        style={{ top, left }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="px-4 pt-3 pb-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 text-[10px] font-bold">
                {step + 1}
              </span>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{current.title}</h4>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{current.description}</p>
          </div>

          <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between border-t border-gray-100 dark:border-gray-700">
            <button
              onClick={handleSkip}
              className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              Skip tour
            </button>

            <div className="flex items-center gap-2">
              {/* Step dots */}
              <div className="flex gap-1 mr-2">
                {STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${
                      i === step ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  />
                ))}
              </div>

              <button
                onClick={handleNext}
                className="px-3 py-1 rounded-lg text-[11px] font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors"
              >
                {isLast ? 'Got it!' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
