'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth';
import { LoadingSpinner } from '@/components/ui';
import { usePageTitle } from '@/hooks/usePageTitle';
import { AuthForm } from '@/components/auth/AuthForm';
import { routing } from '@/i18n/routing';

type AuthMode = 'login' | 'register';

/** Strip locale prefix from a path so next-intl's router.push doesn't double-prefix. */
function stripLocale(path: string): string {
 for (const locale of routing.locales) {
  if (path.startsWith(`/${locale}/`) || path === `/${locale}`) {
   return path.slice(`/${locale}`.length) || '/';
  }
 }
 return path;
}

function AuthPageContent() {
 const t = useTranslations('auth');
 const router = useRouter();
 const searchParams = useSearchParams();
 const { isAuthenticated } = useAuth();
 const initialMode = (searchParams?.get('mode') === 'login' ? 'login' : 'register') as AuthMode;
 const [mode, setMode] = useState<AuthMode>(initialMode);
 usePageTitle(mode === 'login' ? t('page_title_login') : t('page_title_register'));

 // Sync mode when URL param changes
 useEffect(() => {
 const m = searchParams?.get('mode');
 if (m === 'login' || m === 'register') setMode(m);
 }, [searchParams]);

 const justRegisteredRef = useRef(false);
 const redirectingRef = useRef(false);

 // Redirect if already authenticated (e.g., page refresh or direct visit)
 useEffect(() => {
 if (isAuthenticated && !justRegisteredRef.current && !redirectingRef.current) {
  redirectingRef.current = true;
  const next = searchParams?.get('next') || '/dashboard';
  router.push(stripLocale(next));
 }
 }, [isAuthenticated, router, searchParams]);

 const switchMode = (newMode: AuthMode) => {
 setMode(newMode);
 const params = new URLSearchParams(searchParams?.toString() || '');
 params.set('mode', newMode);
 router.replace(`/auth?${params.toString()}`, { scroll: false });
 };

 const handleSuccess = () => {
 if (redirectingRef.current) return;
 redirectingRef.current = true;
 if (mode === 'register') {
  justRegisteredRef.current = true;
  router.push('/welcome');
 } else {
  const next = searchParams?.get('next') || '/dashboard';
  router.push(stripLocale(next));
 }
 };

 return (
 <div className="min-h-[80vh] lg:min-h-screen grid lg:grid-cols-[1fr_520px] xl:grid-cols-[1fr_560px] animate-fade-in">
  {/* Left -- Brand panel (desktop) -- full bleed with gradient */}
  <div className="hidden lg:flex flex-col justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 dark:from-surface-3 dark:via-surface-2 dark:to-amber-950 px-12 xl:px-20 2xl:px-28 relative overflow-hidden">
  <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '24px 24px' }} />
  <div className="relative z-10 max-w-lg">
   <Link href="/" className="inline-flex items-center gap-3 mb-10">
   <span className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
    r
   </span>
   <span className="text-2xl font-display font-bold text-gray-900">read-pal</span>
   </Link>
   <h2 className="text-4xl xl:text-5xl font-bold font-display text-gray-900 leading-tight mb-5">
   {mode === 'login' ? t('login_title') : t('register_title')}
   </h2>
   <p className="text-lg text-gray-600 leading-relaxed">
   {mode === 'login'
    ? t('login_subtitle_alt')
    : t('register_subtitle_alt')}
   </p>
   <div className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-8">
   {[
    { emoji: '📖', label: t('feature_smart_reader') },
    { emoji: '🤖', label: t('feature_ai_companion') },
    { emoji: '💡', label: t('feature_knowledge_graph') },
   ].map((f) => (
    <div key={f.label} className="text-center p-4 rounded-2xl bg-surface-2/60 backdrop-blur-sm">
    <div className="text-3xl mb-3"><span aria-hidden="true">{f.emoji}</span></div>
    <div className="text-sm text-gray-600 font-semibold">{f.label}</div>
    </div>
   ))}
   </div>
  </div>
  </div>

  {/* Right -- Form panel */}
  <div className="flex flex-col justify-center px-6 sm:px-10 lg:px-12 xl:px-16 py-10 lg:py-0 bg-surface-0">
  {/* Mobile brand */}
  <div className="lg:hidden text-center mb-6">
   <Link href="/" className="inline-flex items-center gap-2 mb-4">
   <span className="w-12 h-12 rounded-xl bg-primary-600 flex items-center justify-center text-white text-xl font-bold shadow-soft" aria-hidden="true">
    r
   </span>
   </Link>
   <h1 className="text-2xl font-bold font-display text-gray-900">
   {mode === 'login' ? t('login_title') : t('register_title')}
   </h1>
   <p className="text-sm text-gray-600 mt-1">
   {mode === 'login' ? t('login_subtitle_alt') : t('register_subtitle_alt')}
   </p>
  </div>

  {/* Mode Toggle */}
  <div className="flex bg-surface-2 rounded-xl p-1 mb-6" role="tablist">
   <button
   type="button"
   role="tab"
   aria-selected={mode === 'register'}
   onClick={() => switchMode('register')}
   className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 min-h-[44px] focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 ${
    mode === 'register'
    ? 'bg-surface-0 text-gray-900 shadow-xs'
    : 'text-gray-500 hover:text-gray-700'
   }`}
   >
   {t('sign_up_tab')}
   </button>
   <button
   type="button"
   role="tab"
   aria-selected={mode === 'login'}
   onClick={() => switchMode('login')}
   className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 min-h-[44px] focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 ${
    mode === 'login'
    ? 'bg-surface-0 text-gray-900 shadow-xs'
    : 'text-gray-500 hover:text-gray-700'
   }`}
   >
   {t('sign_in_tab')}
   </button>
  </div>

  <AuthForm mode={mode} onSuccess={handleSuccess} />

  <p className="mt-6 text-center text-xs text-gray-500">
   {t('terms_agreement')}
  </p>
  </div>
 </div>
 );
}

export default function AuthPage() {
 const tc = useTranslations('common');
 return (
 <div className="min-h-screen"><Suspense fallback={
  <div className="min-h-[80vh] flex items-center justify-center">
  <div className="flex items-center gap-2 text-gray-500">
   <LoadingSpinner />
   {tc('loading')}
  </div>
  </div>
 }>
  <AuthPageContent />
 </Suspense></div>
 );
}
