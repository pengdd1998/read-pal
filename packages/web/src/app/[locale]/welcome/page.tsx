'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { warn } from '@/lib/logger';
import { authFetch } from '@/lib/auth-fetch';
import type { Book } from '@read-pal/shared';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/lib/auth';
import { safeGetItem, safeSetItem } from '@/lib/safe-storage';
import { useToast } from '@/components/Toast';
import { WelcomeIntro } from '@/components/welcome/WelcomeIntro';
import { WhatWeDoSection } from '@/components/welcome/WhatWeDoSection';
import { PersonaPicker } from '@/components/welcome/PersonaPicker';
import { SampleBookCard } from '@/components/welcome/SampleBookCard';
import { WelcomeActions } from '@/components/welcome/WelcomeActions';

const ONBOARDING_KEY = 'read-pal-onboarding-complete';

const PERSONAS = [
  { id: 'sage', name: 'Sage', emoji: '🦉', personalityKey: 'persona_sage_personality', descKey: 'persona_sage_desc' },
  { id: 'penny', name: 'Penny', emoji: '⭐', personalityKey: 'persona_penny_personality', descKey: 'persona_penny_desc' },
  { id: 'alex', name: 'Alex', emoji: '🔍', personalityKey: 'persona_alex_personality', descKey: 'persona_alex_desc' },
  { id: 'quinn', name: 'Quinn', emoji: '🌊', personalityKey: 'persona_quinn_personality', descKey: 'persona_quinn_desc' },
  { id: 'sam', name: 'Sam', emoji: '🎯', personalityKey: 'persona_sam_personality', descKey: 'persona_sam_desc' },
] as const;

export default function WelcomePage() {
  const t = useTranslations('welcome');
  usePageTitle(t('page_title'));
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [selectedPersona, setSelectedPersona] = useState<string>('penny');
  const [finishing, setFinishing] = useState(false);

  // Auto-redirect returning users who already completed onboarding
  useEffect(() => {
    const alreadyOnboarded = safeGetItem(ONBOARDING_KEY) === 'true';
    if (isAuthenticated && alreadyOnboarded) {
      router.replace('/library');
    }
  }, [isAuthenticated, router]);

  const fetchBooks = useCallback(async (signal: { stale: boolean }) => {
    try {
      const res = await api.get<Book[]>('/api/books');
      if (signal.stale) return;
      if (res.success && res.data) {
        const books = res.data || [];
        const sample = books.find(
          (b) => (b.metadata as Record<string, string>)?.source === 'sample',
        ) ?? books.find(
          (b) => b.title?.includes("Alice's Adventures") || b.title?.includes('Art of Reading') || b.author === 'read-pal',
        );
        if (sample) setBook(sample);
        else if (books.length > 0) setBook(books[0]);
      }
    } catch (err) {
      if (signal.stale) return;
      warn('Welcome: failed to load sample book list', err);
      setError(t('book_load_error'));
    }
    setLoading(false);
  }, [t]);

  useEffect(() => {
    const alreadyOnboarded = safeGetItem(ONBOARDING_KEY) === 'true';
    if (isAuthenticated && alreadyOnboarded) return;

    const signal = { stale: false };
    fetchBooks(signal);
    return () => { signal.stale = true; };
  }, [isAuthenticated, fetchBooks]);

  // Auto-advance through intro steps
  useEffect(() => {
    if (loading || error) return;
    const timers = [
      setTimeout(() => setStep(1), 600),
      setTimeout(() => setStep(2), 1800),
    ];
    return () => timers.forEach(clearTimeout);
  }, [loading, error]);

  const handleFinish = async () => {
    setFinishing(true);
    try {
      await authFetch('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({ friendPersona: selectedPersona }),
      });
    } catch (err) {
      warn('Welcome: failed to save persona preference', err);
      toast(t('persona_save_error'), 'error');
    }
    safeSetItem(ONBOARDING_KEY, 'true');

    if (book) {
      router.push(`/read/${book.id}`);
    } else {
      router.push('/library');
    }
  };

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    const signal = { stale: false };
    fetchBooks(signal);
  };

  const persona = PERSONAS.find((p) => p.id === selectedPersona) ?? PERSONAS[1];

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="max-w-lg w-full text-center">
        {/* Step 0: Welcome */}
        <WelcomeIntro
          personaEmoji={persona.emoji}
          personaName={persona.name}
          loading={loading}
          error={error}
          onRetry={handleRetry}
        />

        {/* Step 1: What we'll do */}
        <WhatWeDoSection visible={step >= 1 && !loading && !error} />

        {/* Step 2: Persona picker + sample book ready */}
        {step >= 2 && !loading && !error && (
          <div
            className={`mt-6 transition-all duration-700 ${
              step >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <PersonaPicker
              personas={PERSONAS}
              selectedPersona={selectedPersona}
              onSelect={setSelectedPersona}
            />

            <SampleBookCard bookTitle={book?.title} />

            <WelcomeActions
              personaName={persona.name}
              finishing={finishing}
              hasBook={!!book}
              onFinish={handleFinish}
            />
          </div>
        )}
      </div>
    </div>
  );
}
