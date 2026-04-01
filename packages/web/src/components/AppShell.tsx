'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href={isAuthenticated ? '/dashboard' : '/'} className="text-2xl font-bold text-primary-600">
              read-pal
            </Link>
            {isAuthenticated && (
              <nav className="hidden md:flex space-x-6">
                <Link href="/dashboard" className="text-gray-700 dark:text-gray-300 hover:text-primary-600">
                  Dashboard
                </Link>
                <Link href="/library" className="text-gray-700 dark:text-gray-300 hover:text-primary-600">
                  Library
                </Link>
                <Link href="/chat" className="text-gray-700 dark:text-gray-300 hover:text-primary-600">
                  AI Chat
                </Link>
                <Link href="/knowledge" className="text-gray-700 dark:text-gray-300 hover:text-primary-600">
                  Knowledge
                </Link>
                <Link href="/search" className="text-gray-700 dark:text-gray-300 hover:text-primary-600">
                  Search
                </Link>
                <Link href="/settings" className="text-gray-700 dark:text-gray-300 hover:text-primary-600">
                  Settings
                </Link>
              </nav>
            )}
          </div>
          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <>
                <span className="text-sm text-gray-600 dark:text-gray-400 hidden sm:inline">
                  {user?.name || user?.email}
                </span>
                <button onClick={logout} className="btn btn-secondary">
                  Sign Out
                </button>
              </>
            ) : (
              <Link href="/login" className="btn btn-secondary">
                Sign In
              </Link>
            )}
          </div>
        </div>
        {/* Mobile nav */}
        {isAuthenticated && (
          <div className="md:hidden border-t border-gray-200 dark:border-gray-800 px-4 py-2 flex gap-4 overflow-x-auto">
            <Link href="/dashboard" className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">Dashboard</Link>
            <Link href="/library" className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">Library</Link>
            <Link href="/chat" className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">AI Chat</Link>
            <Link href="/knowledge" className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">Knowledge</Link>
            <Link href="/search" className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">Search</Link>
            <Link href="/settings" className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">Settings</Link>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-800 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-600 dark:text-gray-400">
          <p>&copy; 2026 read-pal. Your AI reading companion.</p>
        </div>
      </footer>
    </div>
  );
}
