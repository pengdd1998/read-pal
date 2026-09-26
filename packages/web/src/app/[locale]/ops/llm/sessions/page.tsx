'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { SessionsBrowser } from '@/components/ops/SessionsBrowser';
import { readOpsKey } from '@/lib/ops-key';

/**
 * Synthetic sessions page (H5b): same unlock convention as the traces
 * page — ops key from sessionStorage, hint links back to the overview.
 */
export default function OpsLlmSessionsPage() {
  const t = useTranslations('opsLlm');
  const [opsKey, setOpsKey] = useState<string | null>(null);

  useEffect(() => {
    setOpsKey(readOpsKey());
    const onKey = () => setOpsKey(readOpsKey());
    window.addEventListener('ops-key-changed', onKey);
    return () => window.removeEventListener('ops-key-changed', onKey);
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">🧵 {t('sessions_title')}</h1>
      {opsKey ? (
        <SessionsBrowser opsKey={opsKey} />
      ) : (
        <p className="text-sm text-gray-500">
          {t('traces_locked')} <Link href="/ops/llm" className="text-primary-600 hover:underline">{t('traces_go_main')}</Link>
        </p>
      )}
    </div>
  );
}
