'use client';

import { ReactNode, useState, useEffect, useRef } from 'react';
import { Link } from '@/i18n/navigation';
import { usePathname } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth';
import { safeSetItem } from '@/lib/safe-storage';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastProvider, useToast } from '@/components/Toast';
import { PageTransition } from '@/components/PageTransition';
import { useTranslations } from 'next-intl';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { OfflineBanner } from '@/components/ui';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { MobileAuthGuard } from '@/components/MobileAuthGuard';
import { isCapacitor } from '@/lib/capacitor';
import { useStatusBar } from '@/hooks/useStatusBar';
import { initializeNotifications } from '@/lib/notifications';
import { NAV_ITEMS } from '@/lib/nav-config';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { Footer } from '@/components/layout/Footer';

export function AppShell({ children }: { children: ReactNode }) {
 return (
 <ToastProvider>
  <AppShellInner>{children}</AppShellInner>
 </ToastProvider>
 );
}

function AppShellInner({ children }: { children: ReactNode }) {
 const { user, isAuthenticated, logout } = useAuth();
 const pathname = usePathname();
 const isNative = isCapacitor();
 const [mobileOpen, setMobileOpen] = useState(false);
 const [mounted, setMounted] = useState(false);
 const { isOnline } = useOnlineStatus();
 const { toast } = useToast();
 const t = useTranslations('nav');
 const tc = useTranslations('common');
 const notificationsInitialized = useRef(false);

 const NAV_FULL_THRESHOLD = 1360;
 const NAV_ICONS_THRESHOLD = 700;
 const [navMode, setNavMode] = useState<'full' | 'icons' | 'mobile'>('mobile');

 useEffect(() => {
 if (!mounted || !isAuthenticated) return;
 const update = () => {
  const w = window.innerWidth;
  if (w >= NAV_FULL_THRESHOLD) setNavMode('full');
  else if (w >= NAV_ICONS_THRESHOLD) setNavMode('icons');
  else setNavMode('mobile');
 };
 update();
 window.addEventListener('resize', update);
 return () => window.removeEventListener('resize', update);
 }, [mounted, isAuthenticated]);

 useEffect(() => { setMounted(true); }, []);
 useStatusBar('LIGHT', '#fefdfb');

 useEffect(() => {
 if (isAuthenticated && isNative && !notificationsInitialized.current) {
  notificationsInitialized.current = true;
  initializeNotifications((msg, type) => toast(msg, type));
 }
 }, [isAuthenticated, isNative, toast]);

 const isReading = pathname.startsWith('/read/');
 const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');
 const handleMobileNav = () => setMobileOpen(false);

 return (
 <div className="min-h-screen flex flex-col bg-surface-1">
  {!isReading && (
  <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-amber-500 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium">
   {tc('skip_to_content')}
  </a>
  )}

  {/* Header */}
  {!isReading && <header className="sticky top-0 z-40 border-b border-surface-2 bg-surface-1/95 backdrop-blur-lg safe-area-top">
  <div className="px-4 sm:px-6 lg:px-8">
   <div className="flex items-center justify-between h-14 sm:h-16">
   <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
    <Link href="/dashboard" prefetch={false} className="flex items-center gap-2 text-base sm:text-lg font-display font-bold tracking-tight text-gray-900 dark:text-gray-100 shrink-0">
    <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary-500 flex items-center justify-center text-white text-xs sm:text-sm font-bold">r</span>
    <span className="hidden sm:inline">read-pal</span>
    </Link>
    {mounted && isAuthenticated && navMode !== 'mobile' && (
    <nav className="flex items-center gap-0.5 min-w-0" aria-label={tc('main_navigation')}>
     {NAV_ITEMS.map((item) => {
     const active = isActive(item.href);
     return (
      <Link key={item.href} href={item.href} prefetch={false} title={t(item.labelKey)} aria-current={active ? 'page' : undefined}
      className={`nav-link relative px-2 py-2 rounded-lg text-sm font-sans font-medium transition-all duration-200 ease-out shrink-0 ${
       active
       ? 'nav-link-active text-primary-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40'
       : 'text-gray-500 dark:text-gray-400 hover:text-primary-700 hover:bg-surface-2/60'
      }`}>
      <span className="flex items-center gap-1.5">
       <svg aria-hidden="true" className={`w-4 h-4 transition-all duration-200 shrink-0 ${active ? 'text-amber-600 dark:text-amber-400' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
       <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
       </svg>
       {navMode === 'full' && <span className="whitespace-nowrap">{t(item.labelKey)}</span>}
      </span>
      </Link>
     );
     })}
    </nav>
    )}
   </div>

   <div className="flex items-center gap-1 sm:gap-3 min-w-0">
    {mounted && isAuthenticated ? (
    <>
     <Link href="/search" prefetch={false} className="hidden md:min-w-[44px] md:min-h-[44px] md:flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none" aria-label={t('nav_search')}>
     <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
     </svg>
     </Link>
     <div className="hidden md:block"><LanguageSwitcher /></div>
     <button type="button" onClick={() => { if (typeof window === 'undefined') return; const isDark = document.documentElement.classList.toggle('dark'); safeSetItem('theme', isDark ? 'dark' : 'light'); }}
     className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1" aria-label={tc('toggle_dark_mode')}>
     <svg aria-hidden="true" className="w-4 h-4 dark:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
     <svg aria-hidden="true" className="w-4 h-4 hidden dark:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
     </button>
     <NotificationBell />
     {navMode === 'full' && (
     <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate max-w-[160px]">{user?.name || user?.email}</span>
     )}
     <button type="button" onClick={logout} className="hidden md:inline-flex btn btn-ghost text-xs sm:text-sm text-gray-500 dark:text-gray-400 hover:text-primary-700 dark:hover:text-white focus-visible:ring-2 focus-visible:ring-amber-500">{tc('logout')}</button>
    </>
    ) : (
    <Link href="/auth?mode=login" className="btn btn-secondary text-sm">{tc('login')}</Link>
    )}
    {mounted && isAuthenticated && navMode === 'mobile' && (
    <button type="button" onClick={() => setMobileOpen(!mobileOpen)} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-surface-2 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
     aria-label={mobileOpen ? tc('close_menu') : tc('open_menu')} aria-expanded={mobileOpen}>
     <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     {mobileOpen
      ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />}
     </svg>
    </button>
    )}
   </div>
   </div>
  </div>

  {mounted && isAuthenticated && mobileOpen && navMode === 'mobile' && (
   <nav className="border-t border-surface-2 bg-surface-1 animate-slide-up" aria-label={tc('mobile_navigation')}>
   <div className="px-4 py-3 space-y-1">
    {NAV_ITEMS.map((item) => {
    const active = isActive(item.href);
    return (
     <Link key={item.href} href={item.href} prefetch={false} onClick={handleMobileNav} aria-current={active ? 'page' : undefined}
     className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-sans font-medium transition-all duration-200 ease-out ${
      active
      ? 'text-primary-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-l-2 border-amber-500'
      : 'text-gray-500 dark:text-gray-400 hover:bg-surface-2/60'
     }`}>
     <svg aria-hidden="true" className={`w-4 h-4 transition-colors duration-200 ${active ? 'text-amber-600 dark:text-amber-400' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
     </svg>
     {t(item.labelKey)}
     </Link>
    );
    })}
    <div className="flex items-center justify-between pt-2 mt-2 border-t border-surface-2">
    <LanguageSwitcher />
    <button type="button" onClick={() => { handleMobileNav(); logout(); }} className="px-3 py-2 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:bg-surface-2/60 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 min-h-[44px]">
     {tc('logout')}
    </button>
    </div>
   </div>
   </nav>
  )}
  </header>}

  <main id="main-content" className={`flex-1 ${isReading ? '' : 'pb-16 md:pb-0'}`} tabIndex={-1}>
  <ErrorBoundary>
   <MobileAuthGuard>
   <PageTransition>{children}</PageTransition>
   </MobileAuthGuard>
  </ErrorBoundary>
  </main>

  {mounted && isAuthenticated && !isReading && <MobileBottomNav />}
  {!isOnline && !isReading && <OfflineBanner />}
  {!isReading && !isNative && <Footer />}
 </div>
 );
}
