'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { warn } from '@/lib/logger';

interface InterventionPrefs {
 marathonEnabled: boolean;
 longSessionEnabled: boolean;
 lowEngagementEnabled: boolean;
 welcomeBackEnabled: boolean;
 speedDropEnabled: boolean;
 reReadingEnabled: boolean;
 optimalTimingEnabled: boolean;
 quietHoursStart: number | null;
 quietHoursEnd: number | null;
}

const DEFAULT_PREFS: InterventionPrefs = {
 marathonEnabled: true,
 longSessionEnabled: true,
 lowEngagementEnabled: true,
 welcomeBackEnabled: true,
 speedDropEnabled: true,
 reReadingEnabled: true,
 optimalTimingEnabled: true,
 quietHoursStart: null,
 quietHoursEnd: null,
};

const ToggleSwitch = React.memo(function ToggleSwitch({
 checked,
 onChange,
 disabled,
 label,
}: {
 checked: boolean;
 onChange: () => void;
 disabled: boolean;
 label?: string;
}) {
 return (
 <button type="button"
  onClick={onChange}
  disabled={disabled}
  role="switch"
  aria-checked={checked}
  aria-label={label}
  className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${
  checked ? 'bg-amber-500' : 'bg-surface-3'
  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
 >
  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
  checked ? 'translate-x-5' : 'translate-x-0'
  }`} />
 </button>
 );
}
);

const PREF_KEYS: { key: keyof InterventionPrefs; labelKey: string }[] = [
 { key: 'marathonEnabled', labelKey: 'pref_marathon' },
 { key: 'longSessionEnabled', labelKey: 'pref_long_session' },
 { key: 'lowEngagementEnabled', labelKey: 'pref_low_engagement' },
 { key: 'welcomeBackEnabled', labelKey: 'pref_welcome_back' },
 { key: 'speedDropEnabled', labelKey: 'pref_speed_drop' },
 { key: 'reReadingEnabled', labelKey: 'pref_re_reading' },
 { key: 'optimalTimingEnabled', labelKey: 'pref_optimal_timing' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export const InterventionPrefsSection = React.memo(function InterventionPrefsSection() {
 const t = useTranslations('settings_page');
 const tRef = useRef(t); tRef.current = t;
 const [prefs, setPrefs] = useState<InterventionPrefs>(DEFAULT_PREFS);
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);
 const [saved, setSaved] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
 const inFlightSaveRef = useRef<AbortController | null>(null);
 const mountedRef = useRef(true);
 const prefsRef = useRef<InterventionPrefs>(DEFAULT_PREFS);
 const syncPrefsRef = (next: InterventionPrefs) => { prefsRef.current = next; setPrefs(next); };

 const loadPrefs = useCallback(async (signal?: AbortSignal) => {
 try {
  const res = await api.get<InterventionPrefs>(
  '/api/v1/interventions/preferences'
  );
  if (signal?.aborted || !mountedRef.current) return;
  if (res.success && res.data) {
  syncPrefsRef({ ...DEFAULT_PREFS, ...res.data });
  } else {
  warn('InterventionPrefsSection: load returned success=false', res.error);
  setError(tRef.current('failed_load_retry'));
  }
 } catch (err) {
  if (signal?.aborted || !mountedRef.current) return;
  warn('InterventionPrefsSection: load failed', err);
  setError(tRef.current('failed_load_retry'));
 } finally {
  if (!signal?.aborted && mountedRef.current) setLoading(false);
 }
 }, []);

 useEffect(() => {
 mountedRef.current = true;
 const ac = new AbortController();
 loadPrefs(ac.signal);
 return () => { mountedRef.current = false; ac.abort(); if (savedTimerRef.current) clearTimeout(savedTimerRef.current); if (inFlightSaveRef.current) inFlightSaveRef.current.abort(); };
 }, [loadPrefs]);

 async function savePrefs(updated: InterventionPrefs) {
 // Cancel any in-flight save: last writer wins, and we don't want a stale
 // PUT to land after this one and revert the user's latest toggle.
 if (inFlightSaveRef.current) inFlightSaveRef.current.abort();
 const ac = new AbortController();
 inFlightSaveRef.current = ac;
 setSaving(true);
 setSaved(false);
 setError(null);
 try {
  const res = await api.put<InterventionPrefs>(
  '/api/v1/interventions/preferences',
  updated as unknown as Record<string, unknown>,
  { signal: ac.signal }
  );
  if (ac.signal.aborted || !mountedRef.current) return;
  if (res.success && res.data) {
  syncPrefsRef(res.data);
  setSaved(true);
  { if (savedTimerRef.current) clearTimeout(savedTimerRef.current); savedTimerRef.current = setTimeout(() => { if (mountedRef.current) setSaved(false); }, 2000); }
  } else {
  setError(tRef.current('failed_save'));
  }
 } catch (err) {
  if (ac.signal.aborted || !mountedRef.current) return;
  warn('InterventionPrefsSection: save failed', err);
  setError(tRef.current('failed_save_retry'));
 } finally {
  if (inFlightSaveRef.current === ac) inFlightSaveRef.current = null;
  if (!ac.signal.aborted && mountedRef.current) setSaving(false);
 }
 }

 function handleToggle(key: keyof InterventionPrefs) {
 // Read latest prefs from ref so rapid toggles don't compute `updated`
 // from a stale closure value of `prefs`. Each toggle now flips the
 // most recent state, even if a previous save hasn't completed yet.
 const updated = { ...prefsRef.current, [key]: !prefsRef.current[key] };
 syncPrefsRef(updated);
 savePrefs(updated);
 }

 function handleQuietHoursChange(
 field: 'quietHoursStart' | 'quietHoursEnd',
 value: string
 ) {
 const updated = {
  ...prefsRef.current,
  [field]: value === '' ? null : parseInt(value, 10),
 };
 syncPrefsRef(updated);
 savePrefs(updated);
 }

 if (loading) {
 return (
  <section className="mb-6 animate-slide-up">
  <div className="flex items-center gap-3 mb-4">
   <div className="w-9 h-9 rounded-xl skeleton animate-pulse" />
   <div className="h-5 skeleton rounded-lg w-40 animate-pulse" />
  </div>
  <div className="bg-surface-0 rounded-2xl border border-surface-3 p-6 space-y-4">
   {Array.from({ length: 3 }).map((_, i) => (
   <div key={i} className="h-10 skeleton rounded-xl animate-pulse" />
   ))}
  </div>
  </section>
 );
 }

 return (
 <section className="mb-6 animate-slide-up">
  <div className="flex items-center gap-3 mb-4">
  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/40 dark:to-teal-900/40 flex items-center justify-center">
   <svg aria-hidden="true" className="w-[1.125rem] h-[1.125rem] text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
   </svg>
  </div>
  <div>
   <h2 className="text-lg font-semibold">{t('intervention_prefs_title')}</h2>
   <p className="text-xs text-gray-500 dark:text-gray-400">
   {t('intervention_prefs_desc')}
   </p>
  </div>
  </div>

  <div className="bg-surface-0 rounded-2xl border border-surface-3 p-6 space-y-4">
  {saved && (
   <div role="status" aria-live="polite" className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
   <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <polyline points="20 6 9 17 4 12" />
   </svg>
   {t('prefs_saved')}
   </div>
  )}

  {error && (
   <div role="alert" className="p-3 rounded-xl text-sm bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 flex items-center justify-between">
   <span>{error}</span>
   <button type="button" onClick={() => { setError(null); setLoading(true); loadPrefs(); }} className="ml-3 underline hover:text-red-800 dark:hover:text-red-200 min-h-[44px] inline-flex items-center focus-visible:ring-2 focus-visible:ring-amber-400 rounded">
    {t('retry')}
   </button>
   </div>
  )}

  {PREF_KEYS.map((item, idx) => (
   <div
   key={item.key}
   className={idx > 0 ? 'pt-3 border-t border-surface-2' : ''}
   >
   <div className="flex items-center justify-between">
    <label className="text-sm font-medium">{t(item.labelKey)}</label>
    <ToggleSwitch
    checked={prefs[item.key] as boolean}
    onChange={() => handleToggle(item.key)}
    disabled={saving}
    label={t(item.labelKey)}
    />
   </div>
   </div>
  ))}

  {/* Quiet hours */}
  <div className="pt-3 border-t border-surface-2">
   <label className="text-sm font-medium block mb-2">{t('quiet_hours')}</label>
   <div className="flex items-center gap-3">
   <div className="flex-1">
    <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">
    {t('quiet_hours_start')}
    </span>
    <select
    value={prefs.quietHoursStart ?? ''}
    onChange={(e) => handleQuietHoursChange('quietHoursStart', e.target.value)}
    className="bg-surface-2 border border-surface-3 rounded-lg px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
    aria-label={t('quiet_hours_start')}
    >
    <option value="">--</option>
    {HOURS.map((h) => (
     <option key={h} value={h}>
     {String(h).padStart(2, '0')}:00
     </option>
    ))}
    </select>
   </div>
   <span className="text-gray-500 dark:text-gray-400 text-sm">-</span>
   <div className="flex-1">
    <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">
    {t('quiet_hours_end')}
    </span>
    <select
    value={prefs.quietHoursEnd ?? ''}
    onChange={(e) => handleQuietHoursChange('quietHoursEnd', e.target.value)}
    className="bg-surface-2 border border-surface-3 rounded-lg px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
    aria-label={t('quiet_hours_end')}
    >
    <option value="">--</option>
    {HOURS.map((h) => (
     <option key={h} value={h}>
     {String(h).padStart(2, '0')}:00
     </option>
    ))}
    </select>
   </div>
   </div>
  </div>
  </div>
 </section>
 );
});
