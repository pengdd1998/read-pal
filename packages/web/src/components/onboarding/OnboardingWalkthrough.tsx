'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'read-pal-onboarding-complete';

interface Step {
  emoji: string;
  title: string;
  description: string;
}

const STEPS: Step[] = [
  {
    emoji: '\uD83D\uDCD6',
    title: 'Welcome to read-pal',
    description:
      'Your AI reading companion that transforms passive reading into an active, social, and memorable learning journey. Discover insights, build knowledge, and make every page count.',
  },
  {
    emoji: '\uD83D\uDCE4',
    title: 'Your Library',
    description:
      'Upload EPUB or PDF books to your personal library. Organize your collection, track your reading progress, and pick up right where you left off. Sample books are available to get you started.',
  },
  {
    emoji: '\uD83D\uDCD7',
    title: 'Reading Experience',
    description:
      'Enjoy a beautifully crafted reading interface with customizable themes, fonts, and layouts. Highlight passages, add notes, and bookmark your favorite moments as you read.',
  },
  {
    emoji: '\uD83E\uDD16',
    title: 'AI Companion',
    description:
      'Chat with intelligent AI agents while you read. Five specialized agents provide explanations, research, coaching, synthesis, and a reading friend that grows with you over time.',
  },
  {
    emoji: '\uD83D\uDE80',
    title: 'Ready to Read!',
    description:
      'Your journey starts now. Head to your library, pick a book, and let read-pal enhance every page. Happy reading!',
  },
];

export function OnboardingWalkthrough() {
  const [currentStep, setCurrentStep] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'none' | 'left' | 'right'>('none');
  const [animating, setAnimating] = useState(false);

  // Auto-detect: show if onboarding not yet completed
  useEffect(() => {
    try {
      const completed = localStorage.getItem(STORAGE_KEY);
      if (completed !== 'true') {
        setMounted(true);
        requestAnimationFrame(() => {
          setOverlayVisible(true);
        });
      }
    } catch {
      // localStorage unavailable, don't show
    }
  }, []);

  const complete = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // localStorage unavailable, ignore
    }
    setOverlayVisible(false);
    setTimeout(() => {
      setMounted(false);
      setCurrentStep(0);
    }, 300);
  }, []);

  const goToStep = useCallback(
    (nextStep: number) => {
      if (animating || nextStep === currentStep) return;
      setSlideDirection(nextStep > currentStep ? 'left' : 'right');
      setAnimating(true);

      setTimeout(() => {
        setCurrentStep(nextStep);
        setSlideDirection('none');
        setTimeout(() => setAnimating(false), 300);
      }, 150);
    },
    [animating, currentStep],
  );

  const handleNext = useCallback(() => {
    if (currentStep < STEPS.length - 1) {
      goToStep(currentStep + 1);
    } else {
      complete();
    }
  }, [currentStep, goToStep, complete]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      goToStep(currentStep - 1);
    }
  }, [currentStep, goToStep]);

  const handleSkip = useCallback(() => {
    complete();
  }, [complete]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!mounted) return;
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleBack();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleSkip();
      }
    },
    [mounted, handleNext, handleBack, handleSkip],
  );

  useEffect(() => {
    if (mounted) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [mounted, handleKeyDown]);

  if (!mounted) return null;

  const step = STEPS[currentStep];
  const isLastStep = currentStep === STEPS.length - 1;
  const progress = ((currentStep + 1) / STEPS.length) * 100;

  // Slide animation classes
  const contentSlideClass =
    slideDirection === 'left'
      ? 'opacity-0 -translate-x-8'
      : slideDirection === 'right'
        ? 'opacity-0 translate-x-8'
        : 'opacity-100 translate-x-0';

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-300 ease-out ${
        overlayVisible ? 'opacity-100' : 'opacity-0'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Onboarding walkthrough"
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          overlayVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleSkip}
      />

      {/* Card */}
      <div
        className={`relative w-full max-w-md mx-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ease-out ${
          overlayVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        {/* Progress bar */}
        <div className="h-1 bg-gray-100 dark:bg-gray-800">
          <div
            className="h-full bg-amber-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Skip button */}
        {!isLastStep && (
          <button
            onClick={handleSkip}
            className="absolute top-4 right-4 text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors duration-200 z-10"
          >
            Skip
          </button>
        )}

        {/* Step content */}
        <div className="px-8 pt-10 pb-6">
          {/* Step counter */}
          <div className="text-center text-[10px] font-semibold text-amber-500/70 uppercase tracking-widest mb-4">
            Step {currentStep + 1} of {STEPS.length}
          </div>
          <div
            className={`text-center transition-all duration-300 ease-out ${contentSlideClass}`}
          >
            {/* Emoji */}
            <div className="text-5xl mb-5" role="img" aria-hidden="true">
              {step.emoji}
            </div>

            {/* Title */}
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
              {step.title}
            </h2>

            {/* Description */}
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-sm mx-auto">
              {step.description}
            </p>
          </div>
        </div>

        {/* Navigation */}
        <div className="px-8 pb-8">
          {/* Buttons */}
          <div className="flex items-center justify-between gap-3">
            {/* Back button */}
            {currentStep > 0 ? (
              <button
                onClick={handleBack}
                disabled={animating}
                className="px-4 py-2.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors duration-200 disabled:opacity-50"
              >
                Back
              </button>
            ) : (
              <div />
            )}

            {/* Next / Start Reading button */}
            {isLastStep ? (
              <Link
                href="/library"
                onClick={complete}
                className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-all duration-200 hover:shadow-lg hover:shadow-amber-500/25 active:scale-[0.98]"
              >
                Start Reading!
              </Link>
            ) : (
              <button
                onClick={handleNext}
                disabled={animating}
                className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-all duration-200 hover:shadow-lg hover:shadow-amber-500/25 active:scale-[0.98] disabled:opacity-50 disabled:hover:shadow-none"
              >
                Next
              </button>
            )}
          </div>

          {/* Step indicator dots */}
          <div className="flex items-center justify-center gap-2 mt-6">
            {STEPS.map((_, index) => {
              const isCompleted = index < currentStep;
              const isCurrent = index === currentStep;

              if (isCompleted) {
                return (
                  <button
                    key={index}
                    onClick={() => goToStep(index)}
                    className="w-2 h-2 rounded-full bg-amber-500/50 transition-all duration-300 hover:bg-amber-500"
                    aria-label={`Go to step ${index + 1} (completed)`}
                  />
                );
              }

              if (isCurrent) {
                return (
                  <div
                    key={index}
                    className="w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-amber-500/30 transition-all duration-300"
                    aria-label={`Step ${index + 1} (current)`}
                    aria-current="step"
                  />
                );
              }

              return (
                <button
                  key={index}
                  onClick={() => goToStep(index)}
                  className="w-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700 ring-2 ring-gray-200 dark:ring-gray-700 transition-all duration-300 hover:bg-amber-300 dark:hover:bg-amber-700 hover:ring-amber-300/50 dark:hover:ring-amber-700/50"
                  aria-label={`Go to step ${index + 1}`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
