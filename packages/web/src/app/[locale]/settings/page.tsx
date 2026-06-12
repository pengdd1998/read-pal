'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { warn } from '@/lib/logger';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { ProfileSection } from '@/components/settings/ProfileSection';
import { ReadingPrefsSection } from '@/components/settings/ReadingPrefsSection';
import { NotificationsSection } from '@/components/settings/NotificationsSection';
import { InterventionPrefsSection } from '@/components/settings/InterventionPrefsSection';
import { DeveloperSection } from '@/components/settings/DeveloperSection';
import { AccountSection } from '@/components/settings/AccountSection';
import { LanguageSection } from '@/components/settings/LanguageSection';
import { SavingIndicator } from '@/components/settings/SavingIndicator';
import { SettingsSkeleton } from '@/components/settings/SettingsSkeleton';
import type { UserSettings } from '@/components/settings/types';

export default function SettingsPage() {
  const t = useTranslations('settings_page');
  usePageTitle(t('page_title'));
  const router = useRouter();
  const { user: authUser } = useAuth();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUpdatesRef = useRef<{ updates: Partial<UserSettings>; previous?: UserSettings } | null>(null);
  const tRef = useRef(t);
  tRef.current = t;

  // Flush pending saves and clear timers on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        const pending = pendingUpdatesRef.current;
        if (pending) {
          api.patch<UserSettings>('/api/settings', pending.updates as Record<string, unknown>).catch((err) => { warn('SettingsPage: failed to flush pending updates', err); });
        }
      }
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<UserSettings>('/api/settings');
      if (res.success && res.data) {
        setSettings(res.data);
      } else {
        setError(tRef.current('failed_load'));
      }
      const meRes = await api.get<{ name: string; email: string }>('/api/auth/me');
      if (meRes.success && meRes.data) {
        const d = meRes.data;
        if (d.name) setUserName(d.name);
        if (d.email) setUserEmail(d.email);
      }
    } catch (err) {
      warn('Settings: load failed', err);
      setError(tRef.current('failed_load_retry'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authUser) {
      setUserName(authUser.name || '');
      setUserEmail(authUser.email || '');
    }
    let stale = false;
    loadSettings();
    return () => { stale = true; };
  }, [authUser, loadSettings]);

  const saveSettings = useCallback(async (updates: Partial<UserSettings>, previousSettings?: UserSettings) => {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await api.patch<UserSettings>('/api/settings', updates as Record<string, unknown>);
      if (res.success && res.data) {
        setSettings(res.data);
        setSaved(true);
        if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
        savedTimeoutRef.current = setTimeout(() => setSaved(false), 2000);
      } else {
        if (previousSettings) setSettings(previousSettings);
        setError(tRef.current('failed_save'));
      }
    } catch (err) {
      warn('Settings: save failed', err);
      if (previousSettings) setSettings(previousSettings);
      setError(tRef.current('failed_save_retry'));
    }
    setSaving(false);
  }, [settings]);

  const debouncedSave = useCallback((updates: Partial<UserSettings>, previousSettings?: UserSettings) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    pendingUpdatesRef.current = { updates, previous: previousSettings };
    saveTimerRef.current = setTimeout(() => {
      pendingUpdatesRef.current = null;
      saveSettings(updates, previousSettings);
    }, 400);
  }, [saveSettings]);

  function handleSettingsUpdate(updates: Partial<UserSettings>) {
    if (!settings) return;
    const previous = settings;
    setSettings({ ...settings, ...updates });
    debouncedSave(updates, previous);
  }

  function handleLanguageChange(newLocale: 'en' | 'zh') {
    handleSettingsUpdate({ language: newLocale });
    router.replace('/settings');
  }

  if (loading) {
    return <SettingsSkeleton />;
  }

  if (!settings) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center animate-scale-in">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <svg aria-hidden="true" className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-lg font-semibold mb-4">{t('failed_load')}</p>
          {error && <p className="text-sm text-gray-500 mb-4">{error}</p>}
          <button type="button" onClick={loadSettings} className="btn btn-primary min-h-[44px]">{t('retry')}</button>
        </div>
      </div>
    );
  }

  return (
    <section id="main-content" aria-label={t('page_title')} className="px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in">
      {/* Header */}
      <div className="mb-6 sm:mb-8 animate-slide-up">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t('page_title')}</h1>
        <p className="text-sm sm:text-base text-gray-600 mt-1">{t('customize_experience')}</p>
      </div>

      <SavingIndicator
        saving={saving}
        saved={saved}
        savingText={t('saving')}
        savedText={t('settings_saved')}
      />

      {error && (
        <div role="alert" className="mb-6 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm animate-slide-up">
          {error}
        </div>
      )}

      {/* Sections */}
      <ProfileSection userName={userName} userEmail={userEmail} />
      <ReadingPrefsSection settings={settings} saving={saving} onSave={handleSettingsUpdate} />
      <NotificationsSection settings={settings} saving={saving} onSave={handleSettingsUpdate} />
      <InterventionPrefsSection />
      <LanguageSection onLanguageChange={handleLanguageChange} />
      <DeveloperSection settings={settings} />
      <AccountSection />

      {/* Back link */}
      <div className="mt-8 animate-slide-up stagger-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium bg-surface-2 hover:bg-surface-2 transition-colors border border-surface-3"
        >
          <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {t('back_to_dashboard')}
        </Link>
      </div>
    </section>
  );
}
