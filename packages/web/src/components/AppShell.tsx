'use client';

import { ReactNode, useState, useEffect, useRef } from 'react';
import { Link } from '@/i18n/navigation';
import { usePathname } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth';
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
import { hapticLight } from '@/hooks/useHaptics';
import { initializeNotifications } from '@/lib/notifications';
import { useLocale } from 'next-intl';

const NAV_ITEMS = [
  { href: '/dashboard', labelKey: 'nav_dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { href: '/library', labelKey: 'nav_library', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
  { href: '/knowledge', labelKey: 'nav_knowledge', icon: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z' },
  { href: '/flashcards', labelKey: 'nav_flashcards', icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z' },
  { href: '/stats', labelKey: 'nav_stats', icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z' },
  { href: '/synthesis', labelKey: 'nav_synthesis', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' },
  { href: '/settings', labelKey: 'nav_settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
] as const;

// Bottom nav items for mobile (5 items max)
const BOTTOM_NAV_ITEMS = [
  { href: '/dashboard', labelKey: 'nav_dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { href: '/library', labelKey: 'nav_library', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
  { href: '/knowledge', labelKey: 'nav_knowledge', icon: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z' },
  { href: '/flashcards', labelKey: 'nav_flashcards', icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z' },
  { href: '/settings', labelKey: 'nav_settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
] as const;

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

  // Fixed-threshold nav layout — no DOM measurement, no flicker
  // 'full' (≥1360px): icons + text labels + username
  // 'icons' (≥700px): icons only, no username
  // 'mobile' (<700px): hamburger menu
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

  // Defer auth-dependent rendering to avoid SSR/client hydration mismatch
  useEffect(() => { setMounted(true); }, []);

  // Configure native status bar (no-op on web)
  useStatusBar('LIGHT', '#fefdfb');

  // Initialize push notifications once when authenticated in Capacitor
  useEffect(() => {
    if (isAuthenticated && isNative && !notificationsInitialized.current) {
      notificationsInitialized.current = true;
      initializeNotifications((msg, type) => toast(msg, type));
    }
  }, [isAuthenticated, isNative, toast]);

  // Immersive reading mode — hide all AppShell chrome
  const isReading = pathname.startsWith('/read/');

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  // Close mobile menu on navigation
  const handleMobileNav = () => setMobileOpen(false);

  return (
    <div className="min-h-screen flex flex-col bg-[#f9f5f0] dark:bg-gray-950">
      {/* Skip to main content for accessibility */}
      {!isReading && (
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-amber-500 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium">
          {tc('skip_to_content')}
        </a>
      )}

      {/* Header */}
      {!isReading && <header className="sticky top-0 z-40 border-b border-[#f0e9e0] dark:border-gray-800 bg-[#f9f5f0]/95 dark:bg-gray-950/95 backdrop-blur-lg safe-area-top">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">

            {/* Logo */}
            <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
              <Link
                href="/dashboard"
                className="flex items-center gap-2 text-base sm:text-lg font-display font-bold tracking-tight text-[#1e3a5f] dark:text-white shrink-0"
              >
                <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#d97706] flex items-center justify-center text-white text-xs sm:text-sm font-bold">
                  r
                </span>
                <span className="hidden sm:inline">read-pal</span>
              </Link>

              {/* Desktop Nav — JS-controlled visibility */}
              {mounted && isAuthenticated && navMode !== 'mobile' && (
                <nav className="flex items-center gap-0.5 min-w-0" aria-label={tc('main_navigation')}>
                  {NAV_ITEMS.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={t(item.labelKey)}
                        aria-current={active ? 'page' : undefined}
                        className={`nav-link relative px-2 py-2 rounded-lg text-sm font-sans font-medium transition-all duration-200 ease-out shrink-0 ${
                          active
                            ? 'nav-link-active text-[#1e3a5f] dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40'
                            : 'text-[#5c5c5c] dark:text-gray-400 hover:text-[#1e3a5f] dark:hover:text-gray-200 hover:bg-[#f0e9e0]/60 dark:hover:bg-gray-800'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <svg className={`w-4 h-4 transition-all duration-200 shrink-0 ${active ? 'text-amber-600 dark:text-amber-400' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
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

            {/* Right side */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {mounted && isAuthenticated ? (
                <>
                  <Link
                    href="/search"
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                    aria-label={t('nav_search')}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </Link>
                  <LanguageSwitcher />
                  {/* Dark mode toggle */}
                  <button
                    onClick={() => {
                      if (typeof window === 'undefined') return;
                      const isDark = document.documentElement.classList.toggle('dark');
                      localStorage.setItem('theme', isDark ? 'dark' : 'light');
                    }}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                    aria-label={tc('toggle_dark_mode')}
                  >
                    <svg className="w-4 h-4 dark:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                    <svg className="w-4 h-4 hidden dark:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  </button>
                  <NotificationBell />
                  {navMode === 'full' && (
                    <span className="text-xs sm:text-sm text-[#5c5c5c] dark:text-gray-400 truncate max-w-[160px]">
                      {user?.name || user?.email}
                    </span>
                  )}
                  <button
                    onClick={logout}
                    className="btn btn-ghost text-xs sm:text-sm text-[#5c5c5c] dark:text-gray-400 hover:text-[#1e3a5f] dark:hover:text-white"
                  >
                    {tc('logout')}
                  </button>
                </>
              ) : (
                <Link href="/auth?mode=login" className="btn btn-secondary text-sm">
                  {tc('login')}
                </Link>
              )}

              {/* Mobile menu button — shown when navMode === 'mobile' */}
              {mounted && isAuthenticated && navMode === 'mobile' && (
                <button
                  onClick={() => setMobileOpen(!mobileOpen)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[#5c5c5c] dark:text-gray-400 hover:bg-[#f0e9e0] dark:hover:bg-gray-800 transition-colors"
                  aria-label={mobileOpen ? tc('close_menu') : tc('open_menu')}
                  aria-expanded={mobileOpen}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    {mobileOpen ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                    )}
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Nav dropdown */}
        {mounted && isAuthenticated && mobileOpen && navMode === 'mobile' && (
          <nav className="border-t border-[#f0e9e0] dark:border-gray-800 bg-[#f9f5f0] dark:bg-gray-950 animate-slide-up" aria-label={tc('mobile_navigation')}>
            <div className="px-4 py-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={handleMobileNav}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-sans font-medium transition-all duration-200 ease-out ${
                      active
                        ? 'text-[#1e3a5f] dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-l-2 border-amber-500'
                        : 'text-[#5c5c5c] dark:text-gray-400 hover:bg-[#f0e9e0]/60 dark:hover:bg-gray-800'
                    }`}
                  >
                    <svg className={`w-4 h-4 transition-colors duration-200 ${active ? 'text-amber-600 dark:text-amber-400' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                    </svg>
                    {t(item.labelKey)}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </header>}

      {/* Main Content */}
      <main id="main-content" className={`flex-1 ${isReading ? '' : 'pb-16 md:pb-0'}`} tabIndex={-1}>
        <ErrorBoundary>
          <MobileAuthGuard>
            <PageTransition>{children}</PageTransition>
          </MobileAuthGuard>
        </ErrorBoundary>
      </main>

      {/* Mobile Bottom Nav */}
      {mounted && isAuthenticated && !isReading && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg border-t border-gray-200 dark:border-gray-800 safe-area-bottom" aria-label={tc('bottom_navigation')}>
          <div className="flex items-center justify-around">
            {BOTTOM_NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    if (!active) hapticLight();
                  }}
                  aria-current={active ? 'page' : undefined}
                  className={`flex flex-col items-center justify-center gap-0.5 flex-1 min-h-[48px] py-1.5 transition-colors ${
                    active
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-gray-400 dark:text-gray-500'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                  </svg>
                  <span className="text-[10px] font-medium">{t(item.labelKey)}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      {/* Offline Banner */}
      {!isOnline && !isReading && <OfflineBanner />}

      {/* Footer */}
      {!isReading && !isNative && <footer className="border-t border-[#f0e9e0] dark:border-gray-800 py-8 sm:py-10 mt-auto bg-[#f9f5f0] dark:bg-gray-950">
        <div className="px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-[#d97706] flex items-center justify-center text-white text-xs font-bold">
              r
            </span>
            <span className="text-xs sm:text-sm text-[#5c5c5c] dark:text-gray-400 font-sans">
              &copy; 2026 read-pal. {t('footer_companion')}
            </span>
          </div>
          <div className="flex items-center gap-4 sm:gap-6">
            <Link href="/terms" className="text-xs sm:text-sm text-[#5c5c5c] dark:text-gray-400 hover:text-[#d97706] dark:hover:text-amber-400 transition-colors duration-200 font-sans">{tc('terms')}</Link>
            <Link href="/privacy" className="text-xs sm:text-sm text-[#5c5c5c] dark:text-gray-400 hover:text-[#d97706] dark:hover:text-amber-400 transition-colors duration-200 font-sans">{tc('privacy')}</Link>
            <Link href="/settings" className="text-xs sm:text-sm text-[#5c5c5c] dark:text-gray-400 hover:text-[#d97706] dark:hover:text-amber-400 transition-colors duration-200 font-sans">{t('nav_settings')}</Link>
          </div>
        </div>
      </footer>}
    </div>
  );
}