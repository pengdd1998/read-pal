'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { TracesBrowser } from '@/components/ops/TracesBrowser';

/**
 * Trace browsing page (P-B): shares the ops key with /ops/llm via
 * sessionStorage (never the URL — P7.2). Redirect-less gate: without a
 * key it renders a hint linking back to the main ops page rather than
 * duplicating the unlock form.
 */
export default function OpsLlmTracesPage() {
  const t = useTranslations('opsLlm');
  const [opsKey, setOpsKey] = useState<string | null>(null);

  useEffect(() => {
    setOpsKey(sessionStorage.getItem('ops-key'));
  }, []);

  return (
    <div className="container-content px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">🔍 {t('traces_title')}</h1>
      {opsKey ? (
        <TracesBrowser opsKey={opsKey} />
      ) : (
        <p className="text-sm text-gray-500">
          {t('traces_locked')} <a href="/ops/llm" className="text-primary-600 hover:underline">{t('traces_go_main')}</a>
        </p>
      )}
    </div>
  );
}
