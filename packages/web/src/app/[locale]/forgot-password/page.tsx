'use client';

import { useState, FormEvent } from 'react';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { LoadingSpinner, ErrorAlert } from '@/components/ui';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useTranslations } from 'next-intl';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth');
  usePageTitle(t('forgot_page_title'));
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.post('/api/auth/forgot-password', { email });
      setSubmitted(true);
    } catch {
      // Gracefully handle any error — still show success
      // to avoid leaking whether an email exists in our system
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="max-w-sm w-full animate-fade-in">
        {/* Brand */}
        <header className="text-center mb-8">
          <div className="inline-flex w-12 h-12 rounded-xl bg-primary-600 items-center justify-center text-white text-xl font-bold mb-4 shadow-soft" aria-hidden="true">
            r
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {submitted ? t('forgot_title_submitted') : t('forgot_title_default')}
          </h1>
          <p className="text-sm text-gray-600 mt-1 dark:text-gray-400">
            {submitted
              ? t('forgot_desc_submitted')
              : t('forgot_desc_default')}
          </p>
        </header>

        <div className="card shadow-soft">
          {submitted ? (
            <div className="text-center py-4" role="status" aria-live="polite">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/40 mb-4" aria-hidden="true">
                <svg className="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('forgot_resend_text')}{' '}
                <button
                  type="button"
                  onClick={() => { setSubmitted(false); setEmail(''); }}
                  className="text-amber-700 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300 font-medium"
                >
                  {t('forgot_resend_link')}
                </button>
                .
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5" aria-label={t('forgot_form_label')}>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  {t('email_label')}
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="input"
                  placeholder={t('email_placeholder')}
                  autoComplete="email"
                />
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
                    {t('forgot_sending')}
                  </span>
                ) : (
                  t('forgot_send_button')
                )}
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
          <Link href="/auth?mode=login" className="text-amber-700 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300 font-medium">
            {t('back_to_login')}
          </Link>
        </p>
      </div>
    </main>
  );
}
