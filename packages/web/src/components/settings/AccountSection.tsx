'use client';

import { API_BASE_URL } from '@/lib/api';
import { authFetch } from '@/lib/auth-fetch';
import { useToast } from '@/components/Toast';

export function AccountSection() {
  const { toast } = useToast();

  async function handleDeleteAccount() {
    if (!confirm('Are you sure you want to delete your account? This cannot be undone.')) return;
    try {
      const res = await authFetch(`${API_BASE_URL}/api/auth/account`, {
        method: 'DELETE',
      });
      if (res.ok) {
        localStorage.removeItem('auth_token');
        window.location.href = '/';
      }
    } catch {
      toast('Failed to delete account. Please try again.', 'error');
    }
  }

  function handleSignOut() {
    localStorage.removeItem('auth_token');
    window.location.href = '/auth?mode=login';
  }

  return (
    <section className="mt-10 animate-slide-up stagger-3">
      <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        Account
      </h2>
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
        <div className="space-y-4">
          <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={handleSignOut}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800/30 transition-colors"
            >
              Sign Out
            </button>
          </div>
          <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
            <details className="group">
              <summary className="cursor-pointer text-xs text-gray-600 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors list-none flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete account
              </summary>
              <div className="mt-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30">
                <p className="text-xs text-red-600 dark:text-red-400 mb-3">
                  This will permanently delete your account and all your data, including books, highlights, and reading history. This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDeleteAccount}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
                  >
                    Delete my account
                  </button>
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}
