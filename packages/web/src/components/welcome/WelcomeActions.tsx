'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';

const ONBOARDING_KEY = 'read-pal-onboarding-complete';

interface WelcomeActionsProps {
  personaName: string;
  finishing: boolean;
  hasBook: boolean;
  onFinish: () => void;
}

export const WelcomeActions = React.memo(function WelcomeActions({
  personaName,
  finishing,
  hasBook,
  onFinish,
}: WelcomeActionsProps) {
  const t = useTranslations('welcome');
  const router = useRouter();

  return (
    <div className="mt-6">
      <button
        onClick={onFinish}
        disabled={finishing}
        className="btn btn-primary py-3.5 px-8 rounded-2xl text-lg hover:scale-105 active:scale-95 transition-transform duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {finishing ? '...' : t('start_reading', { name: personaName })}
      </button>
      <div className="mt-4">
        <button
          onClick={() => {
            try { localStorage.setItem(ONBOARDING_KEY, 'true'); } catch (err) { console.warn('WelcomeActions: localStorage write failed', err); }
            router.push('/dashboard');
          }}
          className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors min-h-[44px] inline-flex items-center"
        >
          {t('go_dashboard')}
        </button>
        {!hasBook && (
          <SeedButton />
        )}
      </div>
    </div>
  );
});

function SeedButton() {
  const t = useTranslations('welcome');
  const router = useRouter();
  const { toast } = useToast();
  const [seeding, setSeeding] = React.useState(false);
  const [seedError, setSeedError] = React.useState(false);

  const handleClick = async () => {
    setSeeding(true);
    setSeedError(false);
    try {
      const res = await api.post<{ book: { id: string } }>('/api/books/seed-sample');
      if (res.success && res.data) {
        try { localStorage.setItem(ONBOARDING_KEY, 'true'); } catch (err) { console.warn('WelcomeActions: localStorage write failed', err); }
        router.push(`/read/${res.data.book.id}`);
      }
    } catch (err) {
      console.warn('Welcome: failed to seed sample book', err);
      setSeedError(true);
      toast(t('seed_error'), 'error');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={seeding}
        className="text-sm text-amber-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors ml-4 disabled:opacity-50"
      >
        {seeding ? '...' : t('load_sample')}
      </button>
      {seedError && (
        <div className="text-xs text-red-500 mt-1 ml-4">{t('seed_error')}</div>
      )}
    </div>
  );
}
