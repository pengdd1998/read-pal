'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { authFetch } from '@/lib/auth-fetch';
import { LoadingSpinner, ErrorAlert, getUserFriendlyError } from '@/components/ui';

type AuthMode = 'login' | 'register';

export default function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, register, isAuthenticated } = useAuth();
  const [mode, setMode] = useState<AuthMode>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Read mode from URL param, default to register for new users
  useEffect(() => {
    const m = searchParams.get('mode');
    if (m === 'login') setMode('login');
    else if (m === 'register') setMode('register');
  }, [searchParams]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const next = searchParams.get('next') || '/dashboard';
      router.push(next);
    }
  }, [isAuthenticated, router, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
        const next = searchParams.get('next') || '/dashboard';
        router.push(next);
      } else {
        await register(name, email, password);
        // Auto-seed a sample book for the magic first experience
        try {
          await authFetch((process.env.NEXT_PUBLIC_API_URL || '') + '/api/books/seed-sample', {
            method: 'POST',
          });
        } catch {
          // Non-blocking
        }
        router.push('/welcome');
      }
    } catch (err: unknown) {
      setError(getUserFriendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setError('');
    setPassword('');
    // Update URL without navigation
    const params = new URLSearchParams(searchParams.toString());
    params.set('mode', newMode);
    router.replace(`/auth?${params.toString()}`, { scroll: false });
  };

  return (
    <main className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="max-w-sm w-full animate-fade-in">
        {/* Brand */}
        <header className="text-center mb-6">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            <span className="w-12 h-12 rounded-xl bg-primary-600 flex items-center justify-center text-white text-xl font-bold shadow-soft" aria-hidden="true">
              r
            </span>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {mode === 'login' ? 'Welcome back' : 'Start your reading journey'}
          </h1>
          <p className="text-sm text-gray-600 mt-1 dark:text-gray-400">
            {mode === 'login'
              ? 'Sign in to continue reading'
              : 'Create a free account to meet your AI reading friend'}
          </p>
        </header>

        {/* Mode Toggle */}
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 mb-6">
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
              mode === 'register'
                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-xs'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Sign Up
          </button>
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
              mode === 'login'
                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-xs'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Sign In
          </button>
        </div>

        <div className="card shadow-soft">
          <form onSubmit={handleSubmit} className="space-y-4" aria-label={mode === 'login' ? 'Login form' : 'Registration form'}>
            {/* Name field — register only */}
            {mode === 'register' && (
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="input"
                  placeholder="Your name"
                  autoComplete="name"
                  autoFocus
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input"
                placeholder="you@example.com"
                autoComplete={mode === 'login' ? 'email' : 'email'}
                autoFocus={mode === 'login'}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={mode === 'register' ? 8 : undefined}
                  className="input pr-10"
                  placeholder={mode === 'register' ? 'Min. 8 characters' : '••••••••'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    {showPassword ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    ) : (
                      <>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
              {mode === 'register' && password.length > 0 && password.length < 8 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1" role="alert">
                  Password must be at least 8 characters
                </p>
              )}
              {mode === 'login' && (
                <div className="mt-1.5 text-right">
                  <Link
                    href="/forgot-password"
                    className="text-sm text-amber-700 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
                  >
                    Forgot password?
                  </Link>
                </div>
              )}
            </div>

            {error && <ErrorAlert message={error} />}

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full py-2.5 rounded-xl"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <LoadingSpinner />
                  {mode === 'login' ? 'Signing in...' : 'Creating account...'}
                </span>
              ) : (
                mode === 'login' ? 'Sign In' : 'Create Account'
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
          By continuing, you agree to our terms of service and privacy policy.
        </p>
      </div>
    </main>
  );
}
