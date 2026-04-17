'use client';

import { Suspense, useState, FormEvent, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { LoadingSpinner, ErrorAlert } from '@/components/ui';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [tokenValid, setTokenValid] = useState(true);

  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setTokenValid(false);
      setError('Missing reset token. Please request a new password reset link.');
    }
  }, [token]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);

    try {
      const res = await api.post('/api/auth/reset-password', { token, password });
      if (res.success) {
        setSuccess(true);
        setTimeout(() => router.push('/auth?mode=login'), 3000);
      } else {
        setError(res.error?.message || 'Failed to reset password.');
      }
    } catch {
      setError('Failed to reset password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="max-w-sm w-full animate-fade-in">
        <header className="text-center mb-8">
          <div className="inline-flex w-12 h-12 rounded-xl bg-primary-600 items-center justify-center text-white text-xl font-bold mb-4 shadow-soft" aria-hidden="true">
            r
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {success ? 'Password updated' : 'Set new password'}
          </h1>
          <p className="text-sm text-gray-600 mt-1 dark:text-gray-400">
            {success
              ? 'Redirecting to sign in...'
              : 'Enter your new password below.'}
          </p>
        </header>

        <div className="card shadow-soft">
          {success ? (
            <div className="text-center py-4" role="status" aria-live="polite">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/40 mb-4" aria-hidden="true">
                <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Your password has been reset. You can now{' '}
                <Link href="/auth?mode=login" className="text-amber-700 hover:text-amber-800 dark:text-amber-400 font-medium">
                  sign in
                </Link>.
              </p>
            </div>
          ) : !tokenValid ? (
            <div className="text-center py-4">
              <ErrorAlert message={error} />
              <Link
                href="/forgot-password"
                className="inline-block mt-4 text-amber-700 hover:text-amber-800 dark:text-amber-400 font-medium text-sm"
              >
                Request a new reset link
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5" aria-label="New password form">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="input"
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
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

              {error && <ErrorAlert message={error} />}

              <button
                type="submit"
                disabled={loading || password !== confirmPassword}
                className="btn btn-primary w-full py-2.5 rounded-xl disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <LoadingSpinner />
                    Resetting...
                  </span>
                ) : (
                  'Reset Password'
                )}
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
          <Link href="/auth?mode=login" className="text-amber-700 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300 font-medium">
            Back to Login
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <main className="min-h-[80vh] flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-500">
          <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          Loading...
        </div>
      </main>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
