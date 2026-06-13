'use client';

import { Suspense, useState, FormEvent, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { warn } from '@/lib/logger';
import { LoadingSpinner, ErrorAlert } from '@/components/ui';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useTranslations } from 'next-intl';

function ResetPasswordForm() {
 const t = useTranslations('auth');
 const tRef = useRef(t);
 tRef.current = t;
 usePageTitle(t('reset_page_title'));
 const router = useRouter();
 const searchParams = useSearchParams();
 const [password, setPassword] = useState('');
 const [confirmPassword, setConfirmPassword] = useState('');
 const [loading, setLoading] = useState(false);
 const [success, setSuccess] = useState(false);
 const [error, setError] = useState('');
 const [tokenValid, setTokenValid] = useState(true);
 const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

 const token = searchParams?.get('token') ?? null;

 useEffect(() => {
 if (!token) {
  setTokenValid(false);
  setError(tRef.current('reset_missing_token'));
 }
 return () => {
  if (redirectTimer.current) clearTimeout(redirectTimer.current);
 };
 }, [token]);

 const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
 e.preventDefault();
 setError('');

 if (password !== confirmPassword) {
  setError(t('passwords_mismatch_period'));
  return;
 }

 if (password.length < 8) {
  setError(t('reset_password_min_error'));
  return;
 }

 setLoading(true);

 try {
  const res = await api.post('/api/auth/reset-password', { token, password });
  if (res.success) {
  setSuccess(true);
  redirectTimer.current = setTimeout(() => router.push('/auth?mode=login'), 3000);
  } else {
  setError(t('reset_failed'));
  }
 } catch (err) {
  warn('ResetPassword: failed', err);
  setError(t('reset_failed_expired'));
 } finally {
  setLoading(false);
 }
 };

 return (
 <div className="min-h-[80vh] flex items-center justify-center px-4">
  <div className="max-w-sm w-full animate-fade-in">
  <header className="text-center mb-8">
   <div className="inline-flex w-12 h-12 rounded-xl bg-primary-600 items-center justify-center text-white text-xl font-bold mb-4 shadow-soft" aria-hidden="true">
   r
   </div>
   <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
   {success ? t('reset_title_success') : t('reset_title_default')}
   </h1>
   <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
   {success
    ? t('reset_desc_success')
    : t('reset_desc_default')}
   </p>
  </header>

  <div className="card shadow-soft">
   {success ? (
   <div className="text-center py-4" role="status" aria-live="polite">
    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/40 mb-4" aria-hidden="true">
    <svg aria-hidden="true" className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
    </div>
    <p className="text-sm text-gray-600 dark:text-gray-400">
    {t('reset_success_text')}{' '}
    <Link href="/auth?mode=login" className="text-amber-700 hover:text-amber-800 dark:text-amber-400 font-medium focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none rounded">
     {t('reset_sign_in_link')}
    </Link>.
    </p>
   </div>
   ) : !tokenValid ? (
   <div className="text-center py-4">
    <ErrorAlert message={error} />
    <Link
    href="/forgot-password"
    className="inline-block mt-4 text-amber-700 hover:text-amber-800 dark:text-amber-400 font-medium text-sm focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none rounded"
    >
    {t('reset_request_new_link')}
    </Link>
   </div>
   ) : (
   <form onSubmit={handleSubmit} className="space-y-5" aria-label={t('reset_form_label')}>
    <div>
    <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
     {t('reset_new_password_label')}
    </label>
    <input
     id="password"
     type="password"
     value={password}
     onChange={(e) => setPassword(e.target.value)}
     required
     minLength={8}
     className="input"
     placeholder={t('password_min_placeholder')}
     autoComplete="new-password"
    />
    </div>

    <div>
    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
     {t('confirm_password_label')}
    </label>
    <input
     id="confirmPassword"
     type="password"
     value={confirmPassword}
     onChange={(e) => setConfirmPassword(e.target.value)}
     required
     minLength={8}
     className="input"
     placeholder={t('reset_repeat_placeholder')}
     autoComplete="new-password"
    />
    {confirmPassword.length > 0 && password !== confirmPassword && (
     <p className="text-xs text-red-500 dark:text-red-400 mt-1" role="alert">{t('passwords_mismatch')}</p>
    )}
    </div>

    {error && <ErrorAlert message={error} />}

    <button
    type="submit"
    disabled={loading || password !== confirmPassword}
    className="btn btn-primary w-full py-2.5 rounded-xl disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
    >
    {loading ? (
     <span className="flex items-center gap-2">
     <LoadingSpinner />
     {t('resetting')}
     </span>
    ) : (
     t('reset_button')
    )}
    </button>
   </form>
   )}
  </div>

  <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
   <Link href="/auth?mode=login" className="text-amber-700 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300 font-medium focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none rounded">
   {t('back_to_login')}
   </Link>
  </p>
  </div>
 </div>
 );
}

export default function ResetPasswordPage() {
 const t = useTranslations('common');
 return (
 <Suspense fallback={
  <div className="min-h-[80vh] flex items-center justify-center">
  <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
   <div aria-hidden="true" className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
   {t('loading')}
  </div>
  </div>
 }>
  <ResetPasswordForm />
 </Suspense>
 );
}
