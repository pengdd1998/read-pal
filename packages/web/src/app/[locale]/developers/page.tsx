'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { warn } from '@/lib/logger';
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
 const tRef = useRef(t);
 tRef.current = t;
 usePageTitle(t('page_title'));
 const { user } = useAuth();
 const [apiKeyHint, setApiKeyHint] = useState<string | null>(null);
 const [apiKeyLoading, setApiKeyLoading] = useState(false);
 const [apiKeyError, setApiKeyError] = useState<string | null>(null);
 const [apiKeyFetchKey, setApiKeyFetchKey] = useState(0);
 const retryApiKeys = useCallback(() => setApiKeyFetchKey((k) => k + 1), []);

 useEffect(() => {
 if (!user) return;

 let stale = false;
 setApiKeyLoading(true);
 setApiKeyError(null);
 api.get<Array<{ keyPrefix: string }>>('/api/api-keys')
  .then((res) => {
  if (stale) return;
  if (res.success && res.data && res.data.length > 0) {
   setApiKeyHint(res.data[0].keyPrefix + '...');
  } else if (!res.success) {
   setApiKeyError(tRef.current('api_key_fetch_error'));
  }
  })
  .catch((err) => {
  if (stale) return;
  warn('Developers: API key fetch failed', err);
  setApiKeyError(tRef.current('api_key_fetch_error'));
  })
  .finally(() => {
  if (!stale) setApiKeyLoading(false);
  });
 return () => { stale = true; };
 }, [user, apiKeyFetchKey]);

 return (
 <div className="min-h-screen bg-surface-1">
  {/* Header */}
  <header className="bg-amber-800 dark:bg-amber-900 text-white">
  <div className="px-4 sm:px-6 lg:px-8 py-8">
   <Link href="/dashboard" prefetch={false} className="text-amber-200 hover:text-white text-sm mb-2 inline-block min-h-[44px] leading-[44px] focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none rounded">
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
	   <div role="alert" className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-300 flex items-center justify-between">
	   <span>{apiKeyError}</span>
	   <button type="button" onClick={retryApiKeys} className="ml-3 underline hover:text-red-800 dark:hover:text-red-200 min-h-[44px] inline-flex items-center focus-visible:ring-2 focus-visible:ring-amber-400 rounded">
	    {t('retry')}
	   </button>
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
