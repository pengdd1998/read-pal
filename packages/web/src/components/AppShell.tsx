'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { href: '/library', label: 'Library', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
  { href: '/chat', label: 'AI Chat', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
  { href: '/knowledge', label: 'Knowledge', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
  { href: '/search', label: 'Search', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
  { href: '/settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, logout } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  // Close mobile menu on navigation
  const handleMobileNav = () => setMobileOpen(false);

  return (
    <div className="min-h-screen flex flex-col bg-[#f9f5f0] dark:bg-gray-950">
      {/* Skip to main content for accessibility */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-amber-500 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium">
        Skip to main content
      </a>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-[#f0e9e0] dark:border-gray-800 bg-[#f9f5f0]/95 dark:bg-gray-950/95 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Logo */}
            <div className="flex items-center gap-4 sm:gap-6">
              <Link
                href={isAuthenticated ? '/dashboard' : '/'}
                className="flex items-center gap-2 text-base sm:text-lg font-display font-bold tracking-tight text-[#1e3a5f] dark:text-white"
              >
                <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#d97706] flex items-center justify-center text-white text-xs sm:text-sm font-bold">
                  r
                </span>
                read-pal
              </Link>

              {/* Desktop Nav */}
              {isAuthenticated && (
                <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
                  {NAV_ITEMS.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={`nav-link relative px-3 py-2 rounded-lg text-sm font-sans font-medium transition-all duration-200 ease-out ${
                          active
                            ? 'nav-link-active text-[#1e3a5f] dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40'
                            : 'text-[#5c5c5c] dark:text-gray-400 hover:text-[#1e3a5f] dark:hover:text-gray-200 hover:bg-[#f0e9e0]/60 dark:hover:bg-gray-800'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <svg className={`w-4 h-4 transition-all duration-200 ${active ? 'text-amber-600 dark:text-amber-400' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                          </svg>
                          {item.label}
                        </span>
                      </Link>
                    );
                  })}
                </nav>
              )}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2 sm:gap-3">
              {isAuthenticated ? (
                <>
                  <span className="text-xs sm:text-sm text-[#5c5c5c] dark:text-gray-400 hidden sm:inline truncate max-w-[160px]">
                    {user?.name || user?.email}
                  </span>
                  <button
                    onClick={logout}
                    className="btn btn-ghost text-xs sm:text-sm text-[#5c5c5c] dark:text-gray-400 hover:text-[#1e3a5f] dark:hover:text-white"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <Link href="/login" className="btn btn-secondary text-sm">
                  Sign In
                </Link>
              )}

              {/* Mobile menu button */}
              {isAuthenticated && (
                <button
                  onClick={() => setMobileOpen(!mobileOpen)}
                  className="md:hidden p-2 rounded-lg text-[#5c5c5c] dark:text-gray-400 hover:bg-[#f0e9e0] dark:hover:bg-gray-800 transition-colors"
                  aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
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

        {/* Mobile Nav */}
        {isAuthenticated && mobileOpen && (
          <nav className="md:hidden border-t border-[#f0e9e0] dark:border-gray-800 bg-[#f9f5f0] dark:bg-gray-950 animate-slide-up" aria-label="Mobile navigation">
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
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main id="main-content" className="flex-1" tabIndex={-1}>
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#f0e9e0] dark:border-gray-800 py-8 sm:py-10 mt-auto bg-[#f9f5f0] dark:bg-gray-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-[#d97706] flex items-center justify-center text-white text-xs font-bold">
              r
            </span>
            <span className="text-xs sm:text-sm text-[#5c5c5c] dark:text-gray-400 font-sans">
              &copy; 2026 read-pal. Your AI reading companion.
            </span>
          </div>
          <div className="flex items-center gap-4 sm:gap-6">
            <Link href="/search" className="text-xs sm:text-sm text-[#5c5c5c] dark:text-gray-400 hover:text-[#d97706] dark:hover:text-amber-400 transition-colors duration-200 font-sans">Explore</Link>
            <Link href="/settings" className="text-xs sm:text-sm text-[#5c5c5c] dark:text-gray-400 hover:text-[#d97706] dark:hover:text-amber-400 transition-colors duration-200 font-sans">Settings</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
