'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { authFetch } from '@/lib/auth-fetch';
import { WelcomeStep } from '@/components/onboarding/WelcomeStep';
import { CompanionStep } from '@/components/onboarding/CompanionStep';
import { ReadyStep } from '@/components/onboarding/ReadyStep';
import { StepIndicator } from '@/components/onboarding/StepIndicator';

const STORAGE_KEY = 'read-pal-onboarding-complete';

export const PERSONAS = [
  { id: 'sage', name: 'Sage', emoji: '🦉', personalityKey: 'persona_sage_personality', descKey: 'persona_sage_desc' },
  { id: 'penny', name: 'Penny', emoji: '⭐', personalityKey: 'persona_penny_personality', descKey: 'persona_penny_desc' },
  { id: 'alex', name: 'Alex', emoji: '🔍', personalityKey: 'persona_alex_personality', descKey: 'persona_alex_desc' },
  { id: 'quinn', name: 'Quinn', emoji: '🌊', personalityKey: 'persona_quinn_personality', descKey: 'persona_quinn_desc' },
  { id: 'sam', name: 'Sam', emoji: '🎯', personalityKey: 'persona_sam_personality', descKey: 'persona_sam_desc' },
] as const;

type Step = 'welcome' | 'companion' | 'ready';
const STEPS: Step[] = ['welcome', 'companion', 'ready'];

/**
 * Lightweight onboarding for users who land on the dashboard directly
 * (e.g., returning users on a new device). If the user has already
 * completed the welcome page flow, this is skipped entirely.
 */
export function OnboardingWalkthrough() {
  const router = useRouter();
  const t = useTranslations('welcome');
  const [step, setStep] = useState<Step>('welcome');
  const [mounted, setMounted] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<string>('penny');
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    } catch (err) {
      console.warn('Storage error:', err);
    }
  }, []);

  const complete = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch (err) {
      console.warn('Storage error:', err);
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
    setSaving(true);
    try {
      await authFetch('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({ friendPersona: selectedPersona }),
      });
    } catch (err) {
      console.warn('Onboarding: failed to save persona preference', err);
    }
    complete();
  }, [selectedPersona, complete]);

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
      aria-label={t('onboarding_aria_label')}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
          overlayVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={complete}
        onKeyDown={(e) => { if (e.key === 'Escape') complete(); }}
      />

      {/* Card */}
      <div
        className={`relative w-full max-w-lg mx-4 bg-surface-0 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ease-out ${
          overlayVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Skip */}
        <button
          onClick={complete}
          className="absolute top-4 right-4 text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors z-10"
        >
          {t('onboarding_skip')}
        </button>

        {/* Content */}
        <div className={`px-8 pt-10 pb-8 transition-all duration-300 ease-out ${fadeClass}`}>
          {step === 'welcome' && (
            <WelcomeStep onContinue={() => goTo('companion')} />
          )}
          {step === 'companion' && (
            <CompanionStep
              personas={PERSONAS}
              selectedPersona={selectedPersona}
              personaName={persona.name}
              onSelect={setSelectedPersona}
              onBack={() => goTo('welcome')}
              onContinue={() => goTo('ready')}
            />
          )}
          {step === 'ready' && (
            <ReadyStep
              personaEmoji={persona.emoji}
              personaName={persona.name}
              saving={saving}
              onFinish={handleFinish}
              onGoToWelcome={goToWelcome}
            />
          )}
        </div>

        <StepIndicator steps={STEPS} currentStep={step} />
      </div>
    </div>
  );
}
