'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { ApiQuickStart } from './ApiQuickStart';
import { ApiAuthSection } from './ApiAuthSection';
import { ApiRateLimits } from './ApiRateLimits';
import { ApiResponseFormat } from './ApiResponseFormat';
import { ApiEndpointTable } from './ApiEndpointTable';
import { ApiExportFormats } from './ApiExportFormats';
import { ApiWebhooksSection } from './ApiWebhooksSection';
import { ApiCodeExamples } from './ApiCodeExamples';

export default function DevelopersPage() {
 const t = useTranslations('developers');
 usePageTitle(t('page_title'));
 const { user } = useAuth();
 const [apiKeyHint, setApiKeyHint] = useState<string | null>(null);
 const [apiKeyLoading, setApiKeyLoading] = useState(false);
 const [apiKeyError, setApiKeyError] = useState<string | null>(null);

 useEffect(() => {
 if (!user) return;

 let stale = false;
 setApiKeyLoading(true);
 setApiKeyError(null);
 api.get<Array<{ keyPrefix: string }>>('/api/api-keys')
  .then((res) => {
  if (stale) return;
  const keys = res.data;
  if (keys && keys.length > 0) {
   setApiKeyHint(keys[0].keyPrefix + '...');
  }
  })
  .catch((err) => {
  if (stale) return;
  console.warn('Developers: API key fetch failed', err);
  setApiKeyError(t('api_key_fetch_error'));
  })
  .finally(() => {
  if (!stale) setApiKeyLoading(false);
  });
 return () => { stale = true; };
 }, [user, t]);

 return (
 <div className="min-h-screen bg-surface-1">
  {/* Header */}
  <header className="bg-amber-800 dark:bg-amber-900 text-white">
  <div className="px-4 sm:px-6 lg:px-8 py-8">
   <Link href="/dashboard" className="text-amber-200 hover:text-white text-sm mb-2 inline-block min-h-[44px] leading-[44px]">
   {t('back_dashboard')}
   </Link>
   <h1 className="text-3xl font-bold font-serif">{t('header_title')}</h1>
   <p className="text-amber-200 mt-2">
   {t('header_subtitle')}
   </p>
  </div>
  </header>

  <div className="px-4 sm:px-6 lg:px-8 py-8 space-y-10">
  <ApiQuickStart />
  <ApiAuthSection />
  <ApiRateLimits />
  <ApiResponseFormat />
  <ApiEndpointTable />
  <ApiExportFormats />
  <ApiWebhooksSection />
  <ApiCodeExamples />

  {/* Status indicator */}
  {apiKeyLoading && (
   <div className="bg-surface-2 rounded-xl p-4 text-sm text-gray-500 dark:text-gray-400 animate-pulse">
   {t('api_key_loading')}
   </div>
  )}
  {apiKeyError && (
   <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-300">
   {apiKeyError}
   </div>
  )}
  {apiKeyHint && (
   <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 text-sm text-emerald-800 dark:text-emerald-300">
   {t('api_key_active', { code: apiKeyHint })}
   <Link href="/settings" className="underline ml-1">{t('api_key_manage')}</Link>
   </div>
  )}
  </div>
 </div>
 );
}
