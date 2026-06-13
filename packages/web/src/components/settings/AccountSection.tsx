'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { API_BASE_URL } from '@/lib/api';
import { authFetch } from '@/lib/auth-fetch';
import { safeGetItem, safeRemoveItem } from '@/lib/safe-storage';
import { useToast } from '@/components/Toast';
import { warn } from '@/lib/logger';

export const AccountSection = React.memo(function AccountSection() {
 useToast();
 const t = useTranslations('settings_page');
 const [deleting, setDeleting] = useState(false);
 const [showDeleteModal, setShowDeleteModal] = useState(false);
 const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
 const [confirmPassword, setConfirmPassword] = useState('');
 const [deleteError, setDeleteError] = useState('');

 const router = useRouter();
 async function handleDeleteAccount() {
  if (!confirmPassword.trim()) {
   setDeleteError(t('account_delete_password_required'));
   return;
  }
  setDeleting(true);
  setDeleteError('');
  try {
   const refreshToken = safeGetItem('refresh_token') || undefined;
   const res = await authFetch(`${API_BASE_URL}/api/auth/account`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: confirmPassword, refresh_token: refreshToken }),
   });
   if (res.ok) {
   safeRemoveItem('auth_token');
   safeRemoveItem('refresh_token');
   router.push('/');
   } else {
    let detail = '';
    try { const data = await res.json(); detail = data?.detail || ''; } catch { /* non-JSON response */ }
    setDeleteError(detail || t('account_delete_failed'));
   }
  } catch (err) {
   warn('AccountSection: account deletion failed', err);
   setDeleteError(t('account_delete_failed'));
  } finally {
   setDeleting(false);
  }
 }

 function handleSignOut() {
 safeRemoveItem('auth_token');
 safeRemoveItem('refresh_token');
 router.push('/auth?mode=login');
 }

 return (
 <section className="mt-10 animate-slide-up stagger-3">
  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
  <svg aria-hidden="true" className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
  {t('account_title')}
  </h2>
  <div className="bg-surface-0 rounded-2xl border border-surface-3 p-6">
  <div className="space-y-4">
   <div className="pt-3 border-t border-surface-2">
   <button type="button"
    onClick={() => setShowSignOutConfirm(true)}
    className="min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800/30 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
   >
    {t('account_sign_out')}
   </button>
   </div>
   <div className="pt-3 border-t border-surface-2">
   <details className="group">
    <summary className="cursor-pointer text-xs text-gray-600 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors list-none flex items-center gap-1.5 min-h-[44px]">
    <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
    {t('account_delete_heading')}
    </summary>
    <div role="alert" className="mt-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30">
    <p className="text-xs text-red-600 dark:text-red-400 mb-3">
     {t('account_delete_warning')}
    </p>
    <button type="button"
     onClick={() => setShowDeleteModal(true)}
     className="min-h-[44px] px-4 py-2 rounded-lg text-xs font-medium text-white bg-red-600 hover:bg-red-700 transition-colors focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2"
    >
     {t('account_delete_button')}
    </button>
    </div>
   </details>
   </div>
  </div>
  </div>

  {/* Password confirmation modal */}
  {showDeleteModal && (
  <div
   role="dialog"
   aria-modal="true"
   aria-label={t('account_delete_heading')}
   className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in"
   onClick={() => { setShowDeleteModal(false); setConfirmPassword(''); setDeleteError(''); }}
   onKeyDown={(e) => { if (e.key === 'Escape') { setShowDeleteModal(false); setConfirmPassword(''); setDeleteError(''); } }}
  >
   <div
    className="bg-surface-0 rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-scale-in"
    onClick={(e) => e.stopPropagation()}
   >
    <h3 className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">{t('account_delete_heading')}</h3>
    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{t('account_delete_confirm_password')}</p>
    <input
     type="password"
     value={confirmPassword}
     onChange={(e) => setConfirmPassword(e.target.value)}
     className="w-full px-3 py-2 border border-surface-3 rounded-lg text-sm bg-surface-0 focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-red-500 dark:focus:border-red-400 outline-none mb-3"
     placeholder={t('account_delete_password_placeholder')}
     autoFocus
     aria-label={t('account_delete_password_placeholder')}
    />
    {deleteError && <p role="alert" className="text-xs text-red-600 dark:text-red-400 mb-3">{deleteError}</p>}
    <div className="flex gap-2 justify-end">
     <button type="button"
      onClick={() => { setShowDeleteModal(false); setConfirmPassword(''); setDeleteError(''); }}
      disabled={deleting}
      className="px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400 bg-surface-1 hover:bg-surface-2 transition-colors disabled:opacity-50 min-h-[44px] focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
     >
      {t('account_delete_cancel')}
     </button>
     <button type="button"
      onClick={handleDeleteAccount}
      disabled={deleting || !confirmPassword.trim()}
      className="px-4 py-2 rounded-lg text-sm text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
     >
      {deleting ? (
       <span className="flex items-center gap-1.5">
       <svg aria-hidden="true" className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
       </svg>
       {t('account_deleting')}
       </span>
      ) : t('account_delete_button')}
     </button>
    </div>
   </div>
  </div>
  )}

  {/* Sign-out confirmation modal */}
  {showSignOutConfirm && (
  <div
   role="dialog"
   aria-modal="true"
   aria-labelledby="sign-out-dialog-title"
   className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in"
   onClick={() => setShowSignOutConfirm(false)}
   onKeyDown={(e) => { if (e.key === 'Escape') setShowSignOutConfirm(false); }}
  >
   <div
    className="bg-surface-0 rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-scale-in"
    onClick={(e) => e.stopPropagation()}
   >
    <h3 id="sign-out-dialog-title" className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">{t('sign_out_confirm_title')}</h3>
    <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{t('sign_out_confirm_message')}</p>
    <div className="flex gap-2 justify-end">
     <button type="button"
      onClick={() => setShowSignOutConfirm(false)}
      className="px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400 bg-surface-1 hover:bg-surface-2 transition-colors min-h-[44px] focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none"
     >
      {t('cancel')}
     </button>
     <button type="button"
      onClick={() => { setShowSignOutConfirm(false); handleSignOut(); }}
      className="px-4 py-2 rounded-lg text-sm text-white bg-red-600 hover:bg-red-700 transition-colors min-h-[44px] focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none"
     >
      {t('account_sign_out')}
     </button>
    </div>
   </div>
  </div>
  )}
 </section>
 );
});
