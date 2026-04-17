'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { authFetch } from '@/lib/auth-fetch';
import { LoadingSpinner, ErrorAlert, getUserFriendlyError } from '@/components/ui';

type AuthMode = 'login' | 'register';

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, register, isAuthenticated } = useAuth();
  const [mode, setMode] = useState<AuthMode>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [googleConfigured, setGoogleConfigured] = useState(false);

  // Check if Google OAuth is available
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/auth/google/status`)
      .then((r) => r.json())
      .then((d) => setGoogleConfigured(d?.data?.configured ?? false))
      .catch(() => setGoogleConfigured(false));
  }, []);

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

    if (mode === 'register' && password !== confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

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
    setConfirmPassword('');
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
            </div>

            {/* Confirm Password — register only */}
            {mode === 'register' && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  className="input"
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                />
                {confirmPassword.length > 0 && password !== confirmPassword && (
                  <p className="text-xs text-red-500 mt-1" role="alert">Passwords do not match</p>
                )}
              </div>
            )}

            {mode === 'login' && (
              <div className="text-right -mt-2">
                <Link
                  href="/forgot-password"
                  className="text-sm text-amber-700 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
                >
                  Forgot password?
                </Link>
              </div>
            )}

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

          {/* Google OAuth */}
          {googleConfigured && (
            <>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white dark:bg-gray-900 px-2 text-gray-400">or</span>
                </div>
              </div>
              <a
                href={`${process.env.NEXT_PUBLIC_API_URL || ''}/api/auth/google`}
                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm font-medium"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </a>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
          By continuing, you agree to our terms of service and privacy policy.
        </p>
      </div>
    </main>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={
      <main className="min-h-[80vh] flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-500">
          <LoadingSpinner />
          Loading...
        </div>
      </main>
    }>
      <AuthForm />
    </Suspense>
  );
}
