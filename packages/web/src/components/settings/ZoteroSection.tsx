'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';

import { UserSettings } from './types';
import { warn } from '@/lib/logger';

interface ZoteroSectionProps {
 initialSettings?: UserSettings | null;
}

export const ZoteroSection = React.memo(function ZoteroSection({ initialSettings }: ZoteroSectionProps) {
 const { toast } = useToast();
 const t = useTranslations('settings_page');
 const [connected, setConnected] = useState(false);
 const [apiKey, setApiKey] = useState('');
 const [userId, setUserId] = useState('');
 const [validating, setValidating] = useState(false);
 const [saving, setSaving] = useState(false);
 const [validationError, setValidationError] = useState<string | null>(null);

 useEffect(() => {
 const s = initialSettings as Record<string, unknown> | null | undefined;
 if (s?.['zoteroApiKey'] && s?.['zoteroUserId']) {
  setConnected(true);
  setUserId(String(s['zoteroUserId']));
 }
 }, [initialSettings]);

 async function handleConnect() {
 if (!apiKey.trim() || !userId.trim()) {
  setValidationError(t('zotero_enter_both'));
  return;
 }
 setValidationError(null);
 setValidating(true);
 try {
  const valRes = await api.post<{ valid: boolean; username?: string; error?: string }>('/api/settings/zotero/validate', {
  apiKey: apiKey.trim(),
  userId: userId.trim(),
  });
  if (!valRes.success || !valRes.data?.valid) {
  setValidationError(valRes.data?.error || t('zotero_invalid_credentials'));
  return;
  }
  const saveRes = await api.patch('/api/settings', {
  zoteroApiKey: apiKey.trim(),
  zoteroUserId: userId.trim(),
  });
  if (saveRes.success) {
  setConnected(true);
  toast(t('zotero_connected') + (valRes.data.username ? ` (${valRes.data.username})` : ''), 'success');
  }
 } catch (err) {
  warn('ZoteroSection: connect failed', err);
  setValidationError(t('zotero_connect_failed'));
 } finally {
  setValidating(false);
 }
 }

 async function handleDisconnect() {
 setSaving(true);
 try {
  await api.patch('/api/settings', { zoteroApiKey: '', zoteroUserId: '' });
  setConnected(false);
  setApiKey('');
  setUserId('');
  toast(t('zotero_disconnected'), 'success');
 } catch (err) {
  warn('ZoteroSection: disconnect failed', err);
  toast(t('zotero_disconnect_failed'), 'error');
 } finally {
  setSaving(false);
 }
 }

 if (connected) {
 return (
  <div className="space-y-3">
  <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
   <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <polyline points="20 6 9 17 4 12" />
   </svg>
   {t('zotero_connected_label')} {userId && <span className="text-gray-500">{t('zotero_user_label', { userId })}</span>}
  </div>
  <p className="text-xs text-gray-500">
   {t('zotero_export_desc')}
  </p>
  <button type="button"
   onClick={handleDisconnect}
   disabled={saving}
   className="min-h-[44px] px-4 py-2 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
  >
   {saving ? t('zotero_disconnecting') : t('zotero_disconnect')}
  </button>
  </div>
 );
 }

 return (
 <div className="space-y-3">
  <div className="space-y-2">
  <div>
   <label htmlFor="zotero-api-key" className="block text-xs font-medium text-gray-600 mb-1">{t('zotero_api_key_label')}</label>
   <input
   id="zotero-api-key"
   type="password"
   value={apiKey}
   onChange={(e) => { setApiKey(e.target.value); setValidationError(null); }}
   placeholder={t('zotero_api_key_placeholder')}
   aria-invalid={validationError ? true : undefined}
   aria-describedby={validationError ? 'zotero-error' : undefined}
   className="w-full px-3 py-2.5 rounded-lg border border-surface-3 bg-surface-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none min-h-[44px]"
   />
  </div>
  <div>
   <label htmlFor="zotero-user-id" className="block text-xs font-medium text-gray-600 mb-1">{t('zotero_user_id')}</label>
   <input
   id="zotero-user-id"
   type="text"
   value={userId}
   onChange={(e) => { setUserId(e.target.value); setValidationError(null); }}
   placeholder={t('zotero_user_id_placeholder')}
   aria-invalid={validationError ? true : undefined}
   aria-describedby={validationError ? 'zotero-error' : undefined}
   className="w-full px-3 py-2.5 rounded-lg border border-surface-3 bg-surface-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none min-h-[44px]"
   />
  </div>
  </div>
  {validationError && (
  <p id="zotero-error" role="alert" className="text-xs text-red-600 dark:text-red-400">
   {validationError}
  </p>
  )}
  <p className="text-[10px] text-gray-500">
  {t('zotero_get_key')} <span className="text-blue-500">zotero.org/settings/keys</span>
  </p>
  <button type="button"
  onClick={handleConnect}
  disabled={validating || !apiKey.trim() || !userId.trim()}
  className="min-h-[44px] px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
  >
  {validating ? t('zotero_validating') : t('zotero_connect')}
  </button>
 </div>
 );
});
