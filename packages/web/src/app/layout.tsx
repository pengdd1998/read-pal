import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'read-pal - Your AI Reading Companion',
  description: 'Transform passive reading into active, social, and memorable learning with AI companions.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen flex flex-col">
          {/* Header */}
          <header className="border-b border-gray-200 dark:border-gray-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <h1 className="text-2xl font-bold text-primary-600">read-pal</h1>
                <nav className="hidden md:flex space-x-6">
                  <a href="/dashboard" className="text-gray-700 dark:text-gray-300 hover:text-primary-600">
                    Dashboard
                  </a>
                  <a href="/library" className="text-gray-700 dark:text-gray-300 hover:text-primary-600">
                    Library
                  </a>
                  <a href="/read" className="text-gray-700 dark:text-gray-300 hover:text-primary-600">
                    Read
                  </a>
                  <a href="/knowledge" className="text-gray-700 dark:text-gray-300 hover:text-primary-600">
                    Knowledge
                  </a>
                </nav>
              </div>
              <div className="flex items-center space-x-4">
                <button className="btn btn-secondary">Sign In</button>
              </div>
            </div>
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
      </body>
    </html>
  );
}
