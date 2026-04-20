'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { authFetch } from '@/lib/auth-fetch';
import { Check } from '@/components/icons';
import type { Book } from '@read-pal/shared';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/lib/auth';

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
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [selectedPersona, setSelectedPersona] = useState<string>('penny');

  // Auto-redirect returning users who already completed onboarding
  useEffect(() => {
    const alreadyOnboarded = localStorage.getItem(ONBOARDING_KEY) === 'true';
    if (isAuthenticated && alreadyOnboarded) {
      router.replace('/library');
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    // Skip data fetching if user is already onboarded (redirecting anyway)
    const alreadyOnboarded = localStorage.getItem(ONBOARDING_KEY) === 'true';
    if (isAuthenticated && alreadyOnboarded) return;

    (async () => {
      try {
        const res = await api.get<Book[]>('/api/books');
        if (res.success && res.data) {
          const books = (res.data) || [];
          // Find the sample book — prefer metadata.source, fallback to title matching
          const sample = books.find(
            (b) => (b.metadata as Record<string, string>)?.source === 'sample',
          ) ?? books.find(
            (b) => b.title?.includes("Alice's Adventures") || b.title?.includes('Art of Reading') || b.author === 'read-pal',
          );
          if (sample) setBook(sample);
          else if (books.length > 0) setBook(books[0]);
        }
      } catch {
        // Continue without book
      }
      setLoading(false);
    })();
  }, [isAuthenticated]);

  // Auto-advance through intro steps
  useEffect(() => {
    if (loading) return;
    const timers = [
      setTimeout(() => setStep(1), 600),
      setTimeout(() => setStep(2), 1800),
    ];
    return () => timers.forEach(clearTimeout);
  }, [loading]);

  const handleFinish = async () => {
    // Save persona preference
    try {
      await authFetch('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({ friendPersona: selectedPersona }),
      });
    } catch {
      // Non-blocking — persona can be changed later
    }
    // Mark onboarding as complete so the dashboard walkthrough is skipped
    try { localStorage.setItem(ONBOARDING_KEY, 'true'); } catch { /* ignore */ }

    if (book) {
      router.push(`/read/${book.id}`);
    } else {
      router.push('/library');
    }
  };

  const persona = PERSONAS.find((p) => p.id === selectedPersona) ?? PERSONAS[1];

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="max-w-lg w-full text-center">
        {/* Step 0: Welcome */}
        <div
          className={`transition-all duration-700 ${
            step >= 0 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          {/* Penny avatar */}
          <div className="w-24 h-24 mx-auto mb-6 relative">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-200 to-teal-200 dark:from-amber-800/40 dark:to-teal-800/40 rounded-3xl rotate-6 scale-95" />
            <div className="absolute inset-0 bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/30 dark:to-teal-900/30 rounded-3xl flex items-center justify-center shadow-sm">
              <span className="text-4xl">{persona.emoji}</span>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 text-gray-500">
              <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              {t('preparing')}
            </div>
          ) : (
            <>
              <h1 className="text-3xl font-bold mb-2">{t('greeting', { name: persona.name })}</h1>
              <p className="text-gray-600 dark:text-gray-400 text-lg leading-relaxed">
                {t('intro')}
              </p>
            </>
          )}
        </div>

        {/* Step 1: What we'll do */}
        {step >= 1 && !loading && (
          <div
            className={`mt-8 transition-all duration-700 ${
              step >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 text-left space-y-4">
              <h2 className="font-semibold text-lg text-center">{t('what_we_do_title')}</h2>
              {[
                { icon: '📖', titleKey: 'read_together', descKey: 'read_together_desc' },
                { icon: '💬', titleKey: 'chat_ideas', descKey: 'chat_ideas_desc' },
                { icon: '🌱', titleKey: 'build_knowledge', descKey: 'build_knowledge_desc' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-xl mt-0.5">{item.icon}</span>
                  <div>
                    <div className="font-medium text-sm">{t(item.titleKey)}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{t(item.descKey)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Persona picker + sample book ready */}
        {step >= 2 && !loading && (
          <div
            className={`mt-6 transition-all duration-700 ${
              step >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            {/* Persona selection */}
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                {t('pick_companion')}
              </h3>
              <div className="grid grid-cols-1 gap-1.5 text-left">
                {PERSONAS.map((p) => {
                  const isSelected = selectedPersona === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPersona(p.id)}
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all duration-200 text-left ${
                        isSelected
                          ? 'border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/15 ring-1 ring-amber-400/30'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      }`}
                    >
                      <span className="text-xl">{p.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-gray-900 dark:text-white">{p.name}</span>
                          <span className="text-[10px] text-gray-400">{t(p.personalityKey)}</span>
                        </div>
                      </div>
                      {isSelected && (
                        <div className="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0">
                          <Check className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sample book card */}
            <div className="bg-gradient-to-br from-amber-50 to-teal-50 dark:from-amber-900/20 dark:to-teal-900/20 rounded-2xl border border-amber-200/50 dark:border-amber-800/30 p-5">
              <div className="flex items-center gap-3 text-left">
                <div className="w-12 h-16 rounded-lg bg-gradient-to-br from-amber-200 to-amber-300 dark:from-amber-800 dark:to-amber-700 flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">{'📖'}</span>
                </div>
                <div>
                  <div className="font-semibold text-sm">
                    {book?.title || "Alice's Adventures in Wonderland"}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {t('sample_book_ready')}
                  </div>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="mt-6">
              <button
                onClick={handleFinish}
                className="btn btn-primary py-3.5 px-8 rounded-2xl text-lg hover:scale-105 active:scale-95 transition-transform duration-200"
              >
                {t('start_reading', { name: persona.name })}
              </button>
              <div className="mt-4">
                <button
                  onClick={() => {
                    try { localStorage.setItem(ONBOARDING_KEY, 'true'); } catch { /* ignore */ }
                    router.push('/dashboard');
                  }}
                  className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  {t('go_dashboard')}
                </button>
                {!book && (
                  <button
                    onClick={async () => {
                      try {
                        const res = await api.post<{ book: { id: string } }>('/api/books/seed-sample');
                        if (res.success && res.data) {
                          const data = res.data;
                          try { localStorage.setItem(ONBOARDING_KEY, 'true'); } catch { /* ignore */ }
                          router.push(`/read/${data.book.id}`);
                        }
                      } catch {
                        router.push('/library');
                      }
                    }}
                    className="text-sm text-amber-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors ml-4"
                  >
                    {t('load_sample')}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
