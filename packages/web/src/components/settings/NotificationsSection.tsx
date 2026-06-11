'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/Toast';
import type { UserSettings } from '@/components/settings/types';
import { isCapacitor } from '@/lib/capacitor';
import { isPushEnabled, setPushEnabled } from '@/lib/notifications';
import { warn } from '@/lib/logger';

interface NotificationsSectionProps {
 settings: UserSettings;
 saving: boolean;
 onSave: (updates: Partial<UserSettings>) => void;
}

function ToggleSwitch({
 checked,
 onChange,
 disabled,
 size = 'default',
 label,
}: {
 checked: boolean;
 onChange: () => void;
 disabled: boolean;
 size?: 'default' | 'large';
 label?: string;
}) {
 const isLarge = size === 'large';
 const width = isLarge ? 'w-12' : 'w-11';
 const height = isLarge ? 'h-7' : 'h-6';
 const dotSize = isLarge ? 'w-6 h-6' : 'w-5 h-5';
 const translateX = isLarge ? 'translate-x-5' : 'translate-x-5';

 return (
 <button type="button"
  onClick={onChange}
  disabled={disabled}
  role="switch"
  aria-checked={checked}
  aria-label={label}
  className={`relative ${width} ${height} rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${
  checked ? 'bg-amber-500' : 'bg-surface-3'
  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
 >
  <span className={`absolute top-0.5 left-0.5 ${dotSize} rounded-full bg-white shadow-sm transition-transform duration-200 ${
  checked ? translateX : 'translate-x-0'
  }`} />
 </button>
 );
}

export const NotificationsSection = React.memo(function NotificationsSection({ settings, saving, onSave }: NotificationsSectionProps) {
 const { toast } = useToast();
 const t = useTranslations('settings_page');
 const [pushEnabled, setPushState] = useState(false);
 const [pushLoading, setPushLoading] = useState(false);
 const nativeApp = isCapacitor();

 useEffect(() => {
 if (!nativeApp) return;
 let stale = false;
 isPushEnabled().then((enabled) => { if (!stale) setPushState(enabled); }).catch((err) => { warn('NotificationsSection: push status check failed', err); });
 return () => { stale = true; };
 }, [nativeApp]);

 async function handlePushToggle() {
 if (pushLoading) return;
 setPushLoading(true);
 try {
  const next = !pushEnabled;
  const ok = await setPushEnabled(next);
  setPushState(next && ok);
 } catch (err) {
  warn("NotificationsSection: push toggle failed", err);
  toast(t('push_toggle_failed'), 'error');
 } finally {
  setPushLoading(false);
 }
 }

 return (
 <section className="mb-6 animate-slide-up stagger-2">
  <div className="flex items-center gap-3 mb-4">
  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/40 dark:to-indigo-900/40 flex items-center justify-center">
   <svg aria-hidden="true" className="w-[1.125rem] h-[1.125rem] text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
   </svg>
  </div>
  <h2 className="text-lg font-semibold">{t('notifications_title')}</h2>
  </div>
  <div className="bg-surface-0 rounded-2xl border border-surface-3 p-6 space-y-4">
  {/* Push Notifications -- native only */}
  {nativeApp && (
   <div className="flex items-center justify-between">
   <div>
    <label className="text-sm font-medium">{t('push_notifications_label')}</label>
    <p className="text-xs text-gray-500 mt-0.5">{t('push_notifications_desc')}</p>
   </div>
   <ToggleSwitch
    checked={pushEnabled}
    onChange={handlePushToggle}
    disabled={pushLoading}
    label={t('push_notifications_label')}
   />
   </div>
  )}

  {/* Reading Reminders */}
  <div className={nativeApp ? 'pt-3 border-t border-surface-2' : ''}>
   <div className="flex items-center justify-between">
   <div>
    <label className="text-sm font-medium">{t('reading_reminders_label')}</label>
    <p className="text-xs text-gray-500 mt-0.5">{t('reading_reminders_desc')}</p>
   </div>
   <ToggleSwitch
    checked={settings.notificationsEnabled}
    onChange={() => onSave({ notificationsEnabled: !settings.notificationsEnabled })}
    disabled={saving}
    label={t('reading_reminders_label')}
   />
   </div>
  </div>

  {/* Streak Alerts */}
  <div className="pt-3 border-t border-surface-2">
   <div className="flex items-center justify-between">
   <div>
    <label className="text-sm font-medium">{t('streak_milestones_label')}</label>
    <p className="text-xs text-gray-500 mt-0.5">{t('streak_milestones_desc')}</p>
   </div>
   <ToggleSwitch
    checked={settings.streakAlerts !== false}
    onChange={() => onSave({ streakAlerts: !settings.streakAlerts })}
    disabled={saving}
    size="large"
    label={t('streak_milestones_label')}
   />
   </div>
  </div>

  {/* Friend Messages */}
  <div className="pt-3 border-t border-surface-2">
   <div className="flex items-center justify-between">
   <div>
    <label className="text-sm font-medium">{t('friend_messages_label')}</label>
    <p className="text-xs text-gray-500 mt-0.5">{t('friend_messages_desc')}</p>
   </div>
   <ToggleSwitch
    checked={settings.friendMessages !== false}
    onChange={() => onSave({ friendMessages: !settings.friendMessages })}
    disabled={saving}
    size="large"
    label={t('friend_messages_label')}
   />
   </div>
  </div>
  </div>
 </section>
 );
});
