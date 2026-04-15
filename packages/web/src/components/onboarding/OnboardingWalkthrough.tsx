'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from '@/components/icons';
import { authFetch } from '@/lib/auth-fetch';

const STORAGE_KEY = 'read-pal-onboarding-complete';

const PERSONAS = [
  { id: 'sage', name: 'Sage', emoji: '\uD83E\uDD89', personality: 'Thoughtful & patient', desc: 'Asks deep questions that make you think.' },
  { id: 'penny', name: 'Penny', emoji: '\u2B50', personality: 'Warm & curious', desc: 'Gets excited about ideas and connections.' },
  { id: 'alex', name: 'Alex', emoji: '\uD83D\uDD0D', personality: 'Sharp & challenging', desc: 'Pushes your thinking in new directions.' },
  { id: 'quinn', name: 'Quinn', emoji: '\uD83C\uDF0A', personality: 'Quiet & wise', desc: 'Speaks only when it matters most.' },
  { id: 'sam', name: 'Sam', emoji: '\uD83C\uDFAF', personality: 'Practical & focused', desc: 'Helps you get the most from every page.' },
] as const;

type Step = 'welcome' | 'companion' | 'ready';

/**
 * Lightweight onboarding for users who land on the dashboard directly
 * (e.g., returning users on a new device). If the user has already
 * completed the welcome page flow, this is skipped entirely.
 */
export function OnboardingWalkthrough() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [mounted, setMounted] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<string>('penny');
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up pending timers on unmount
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

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
      // localStorage unavailable
    }
  }, []);

  const complete = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // ignore
    }
    setOverlayVisible(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setMounted(false);
      timerRef.current = null;
    }, 300);
  }, []);

  const goTo = useCallback((next: Step) => {
    setTransitioning(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setStep(next);
      setTransitioning(false);
      timerRef.current = null;
    }, 150);
  }, []);

  const handleFinish = useCallback(async () => {
    // Save persona preference
    setSaving(true);
    try {
      await authFetch('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({ friendPersona: selectedPersona }),
      });
    } catch {
      // Non-blocking — persona can be changed later
    }
    complete();
  }, [selectedPersona, complete]);

  // Redirect to the full welcome page for a complete onboarding experience
  const goToWelcome = useCallback(() => {
    complete();
    router.push('/welcome');
  }, [complete, router]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!mounted) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        complete();
      }
    },
    [mounted, complete],
  );

  useEffect(() => {
    if (mounted) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [mounted, handleKeyDown]);

  if (!mounted) return null;

  const fadeClass = transitioning ? 'opacity-0 scale-95' : 'opacity-100 scale-100';
  const persona = PERSONAS.find((p) => p.id === selectedPersona) ?? PERSONAS[1];

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-300 ease-out ${
        overlayVisible ? 'opacity-100' : 'opacity-0'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to read-pal"
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
          overlayVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={complete}
      />

      {/* Card */}
      <div
        className={`relative w-full max-w-lg mx-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ease-out ${
          overlayVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Skip */}
        <button
          onClick={complete}
          className="absolute top-4 right-4 text-xs font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors z-10"
        >
          Skip
        </button>

        {/* Content */}
        <div className={`px-8 pt-10 pb-8 transition-all duration-300 ease-out ${fadeClass}`}>
          {/* Step 1: Welcome */}
          {step === 'welcome' && (
            <div className="text-center">
              <div className="text-6xl mb-6">{'\uD83D\uDCDA'}</div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                Welcome to read-pal
              </h2>
              <p className="text-gray-500 dark:text-gray-400 leading-relaxed max-w-sm mx-auto mb-8">
                Your AI reading companion. Upload any book, highlight passages, and chat with a friend who reads alongside you.
              </p>
              <button
                onClick={() => goTo('companion')}
                className="px-8 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold transition-all duration-200 hover:shadow-lg hover:shadow-amber-500/25 active:scale-[0.98]"
              >
                Let&apos;s go
              </button>
            </div>
          )}

          {/* Step 2: Choose Companion */}
          {step === 'companion' && (
            <div>
              <div className="text-center mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  Pick your reading companion
                </h2>
                <p className="text-sm text-gray-500">
                  Each one has their own style. You can change this anytime.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 mb-6">
                {PERSONAS.map((p) => {
                  const isSelected = selectedPersona === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPersona(p.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 text-left ${
                        isSelected
                          ? 'border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/15 ring-1 ring-amber-400/30'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      }`}
                    >
                      <span className="text-2xl">{p.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-gray-900 dark:text-white">{p.name}</span>
                          <span className="text-xs text-gray-400">{p.personality}</span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{p.desc}</p>
                      </div>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => goTo('welcome')}
                  className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => goTo('ready')}
                  className="px-8 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold transition-all duration-200 hover:shadow-lg hover:shadow-amber-500/25 active:scale-[0.98]"
                >
                  Continue with {persona.name}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Ready */}
          {step === 'ready' && (
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/30 dark:to-teal-900/30 flex items-center justify-center shadow-sm">
                <span className="text-4xl">{persona.emoji}</span>
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                {persona.name} is ready to read with you
              </h2>
              <p className="text-sm text-gray-500 mb-8 max-w-sm mx-auto">
                Head to your library to upload a book or try a sample. {persona.name} will be right there with you.
              </p>
              <div className="flex flex-col gap-3 max-w-xs mx-auto">
                <button
                  onClick={goToWelcome}
                  className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold transition-all duration-200 hover:shadow-lg hover:shadow-amber-500/25 active:scale-[0.98] text-center"
                >
                  Get Started
                </button>
                <button
                  onClick={handleFinish}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  {saving ? 'Saving...' : 'Skip for now'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Step indicator */}
        <div className="px-8 pb-6 flex items-center justify-center gap-2">
          {(['welcome', 'companion', 'ready'] as Step[]).map((s, i) => {
            const steps: Step[] = ['welcome', 'companion', 'ready'];
            const currentIndex = steps.indexOf(step);
            const thisIndex = i;
            const isCompleted = thisIndex < currentIndex;
            const isCurrent = thisIndex === currentIndex;

            return (
              <div
                key={s}
                className={`rounded-full transition-all duration-300 ${
                  isCurrent
                    ? 'w-6 h-2 bg-amber-500'
                    : isCompleted
                      ? 'w-2 h-2 bg-amber-400'
                      : 'w-2 h-2 bg-gray-200 dark:bg-gray-700'
                }`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
