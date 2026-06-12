'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { authFetch } from '@/lib/auth-fetch';
import { safeGetItem, safeSetItem } from '@/lib/safe-storage';
import { useToast } from '@/components/Toast';
import { WelcomeStep } from '@/components/onboarding/WelcomeStep';
import { CompanionStep } from '@/components/onboarding/CompanionStep';
import { ReadyStep } from '@/components/onboarding/ReadyStep';
import { StepIndicator } from '@/components/onboarding/StepIndicator';
import { warn } from '@/lib/logger';

const STORAGE_KEY = 'read-pal-onboarding-complete';

export const PERSONAS = [
  { id: 'sage', name: 'Sage', emoji: '🦉', personalityKey: 'persona_sage_personality', descKey: 'persona_sage_desc' },
  { id: 'penny', name: 'Penny', emoji: 'star', personalityKey: 'persona_penny_personality', descKey: 'persona_penny_desc' },
  { id: 'alex', name: 'Alex', emoji: 'search', personalityKey: 'persona_alex_personality', descKey: 'persona_alex_desc' },
  { id: 'quinn', name: 'Quinn', emoji: '🌊', personalityKey: 'persona_quinn_personality', descKey: 'persona_quinn_desc' },
  { id: 'sam', name: 'Sam', emoji: 'target', personalityKey: 'persona_sam_personality', descKey: 'persona_sam_desc' },
] as const;

type Step = 'welcome' | 'companion' | 'ready';
const STEPS: Step[] = ['welcome', 'companion', 'ready'];

/**
 * Lightweight onboarding for users who land on the dashboard directly
 * (e.g., returning users on a new device). If the user has already
 * completed the welcome page flow, this is skipped entirely.
 */

export const PersonaIcon = React.memo(function PersonaIcon({ type, className }: { type: string; className?: string }) {
  const size = className ?? 'w-6 h-6';
  switch (type) {
    case 'star':
      return (
        <svg aria-hidden="true" className={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
        </svg>
      );
    case 'search':
      return (
        <svg aria-hidden="true" className={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
      );
    case 'target':
      return (
        <svg aria-hidden="true" className={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
        </svg>
      );
    default:
      return <span className="text-2xl">{type}</span>;
  }
});

export const OnboardingWalkthrough = React.memo(function OnboardingWalkthrough() {
  const router = useRouter();
  const t = useTranslations('welcome');
  const { toast } = useToast();
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
      const completed = safeGetItem(STORAGE_KEY);
      if (completed !== 'true') {
        setMounted(true);
        requestAnimationFrame(() => {
          setOverlayVisible(true);
        });
      }
    } catch (err) {
      warn('OnboardingWalkthrough: load state failed', err);
    }
  }, []);

  const complete = useCallback(() => {
    try {
      safeSetItem(STORAGE_KEY, 'true');
    } catch (err) {
      warn('OnboardingWalkthrough: save state failed', err);
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
      warn('Onboarding: failed to save persona preference', err);
      toast(t('persona_save_error'), 'error');
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
        tabIndex={-1}
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
        <button type="button"
          onClick={complete}
          className="absolute top-4 right-4 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-400 transition-colors z-10"
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
});
