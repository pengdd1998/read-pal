'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { safeSetItem } from '@/lib/safe-storage';
import { useToast } from '@/components/Toast';
import { warn } from '@/lib/logger';

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
      <button type="button"
        onClick={onFinish}
        disabled={finishing}
        className="btn btn-primary py-3.5 px-8 rounded-2xl text-lg hover:scale-105 active:scale-95 transition-transform duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {finishing ? '...' : t('start_reading', { name: personaName })}
      </button>
      <div className="mt-4">
        <button type="button"
          onClick={() => {
            safeSetItem(ONBOARDING_KEY, 'true');
            router.push('/dashboard');
          }}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-400 transition-colors min-h-[44px] inline-flex items-center"
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
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const handleClick = async () => {
    setSeeding(true);
    setSeedError(false);
    try {
      const res = await api.post<{ book: { id: string } }>('/api/books/seed-sample');
      if (!mountedRef.current) return;
      if (res.success && res.data) {
        safeSetItem(ONBOARDING_KEY, 'true');
        router.push(`/read/${res.data.book.id}`);
      }
    } catch (err) {
      warn('Welcome: failed to seed sample book', err);
      if (!mountedRef.current) return;
      setSeedError(true);
      toast(t('seed_error'), 'error');
    } finally {
      if (mountedRef.current) setSeeding(false);
    }
  };

  return (
    <div>
      <button type="button"
        onClick={handleClick}
        disabled={seeding}
        className="text-sm text-amber-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors ml-4 disabled:opacity-50"
      >
        {seeding ? '...' : t('load_sample')}
      </button>
      {seedError && (
        <div role="alert" className="text-xs text-red-500 dark:text-red-400 mt-1 ml-4">{t('seed_error')}</div>
      )}
    </div>
  );
}
