'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { ProfileSection } from '@/components/settings/ProfileSection';
import { ReadingPrefsSection } from '@/components/settings/ReadingPrefsSection';
import { NotificationsSection } from '@/components/settings/NotificationsSection';
import { DeveloperSection } from '@/components/settings/DeveloperSection';
import { AccountSection } from '@/components/settings/AccountSection';
import type { UserSettings } from '@/components/settings/types';

export default function SettingsPage() {
  usePageTitle('Settings');
  const { toast } = useToast();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear debounce timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const res = await api.get<UserSettings>('/api/settings');
      if (res.success && res.data) {
        setSettings(res.data);
      } else {
        setError('Failed to load settings');
      }
      // Load user profile
      const meRes = await api.get<{ user: { name: string; email: string } }>('/api/auth/me');
      if (meRes.success && meRes.data) {
        const d = meRes.data;
        setUserName(d.user?.name || '');
        setUserEmail(d.user?.email || '');
      }
    } catch {
      setError('Failed to load settings. Please try again.');
    }
    setLoading(false);
  }

  async function saveSettings(updates: Partial<UserSettings>) {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await api.patch<UserSettings>('/api/settings', updates as Record<string, unknown>);
      if (res.success && res.data) {
        setSettings(res.data);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(res.error?.message || 'Failed to save settings');
      }
    } catch {
      setError('Failed to save settings. Please try again.');
    }
    setSaving(false);
  }

  // Debounced save for slider controls (font size, daily minutes)
  const debouncedSave = useCallback((updates: Partial<UserSettings>) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveSettings(updates), 400);
  }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update local settings state for optimistic UI updates
  function handleSettingsUpdate(updates: Partial<UserSettings>) {
    if (!settings) return;
    setSettings({ ...settings, ...updates });
    debouncedSave(updates);
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 animate-fade-in">
        {/* Header skeleton */}
        <div className="mb-8">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg w-32 animate-pulse" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-lg w-56 mt-2 animate-pulse" />
        </div>

        {/* Section skeleton */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse" />
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded-lg w-32 animate-pulse" />
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
              <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-24 animate-pulse" />
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="h-10 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
                ))}
              </div>
              <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-20 animate-pulse" />
              <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center animate-scale-in">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-lg font-semibold mb-4">Failed to load settings</p>
          {error && <p className="text-sm text-gray-500 mb-4">{error}</p>}
          <button onClick={loadSettings} className="btn btn-primary">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-3 sm:px-6 py-8 sm:py-12 animate-fade-in">
      {/* Header */}
      <div className="mb-6 sm:mb-8 animate-slide-up">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1">Customize your reading experience</p>
      </div>

      {/* Saving indicator */}
      {(saving || saved) && (
        <div role="status" aria-live="polite" className={`mb-6 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium animate-slide-up transition-all ${
          saved
            ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800'
            : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
        }`}>
          {saved ? (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Settings saved
            </>
          ) : (
            <>
              <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          )}
        </div>
      )}

      {error && (
        <div role="alert" className="mb-6 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm animate-slide-up">
          {error}
        </div>
      )}

      {/* Sections */}
      <ProfileSection userName={userName} userEmail={userEmail} />
      <ReadingPrefsSection settings={settings} saving={saving} onSave={handleSettingsUpdate} />
      <NotificationsSection settings={settings} saving={saving} onSave={handleSettingsUpdate} />
      <DeveloperSection />
      <AccountSection />

      {/* Back link */}
      <div className="mt-8 animate-slide-up stagger-4">
        <a
          href="/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-700"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </a>
      </div>
    </main>
  );
}
