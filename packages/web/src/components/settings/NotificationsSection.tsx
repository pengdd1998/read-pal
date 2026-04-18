'use client';

import type { UserSettings } from '@/components/settings/types';

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
}: {
  checked: boolean;
  onChange: () => void;
  disabled: boolean;
  size?: 'default' | 'large';
}) {
  const isLarge = size === 'large';
  const width = isLarge ? 'w-12' : 'w-11';
  const height = isLarge ? 'h-7' : 'h-6';
  const dotSize = isLarge ? 'w-6 h-6' : 'w-5 h-5';
  const translateX = isLarge ? 'translate-x-5' : 'translate-x-5';

  return (
    <button
      onClick={onChange}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      className={`relative ${width} ${height} rounded-full transition-colors duration-200 ${
        checked ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'
      }`}
    >
      <span className={`absolute top-0.5 left-0.5 ${dotSize} rounded-full bg-white shadow-sm transition-transform duration-200 ${
        checked ? translateX : 'translate-x-0'
      }`} />
    </button>
  );
}

export function NotificationsSection({ settings, saving, onSave }: NotificationsSectionProps) {
  return (
    <section className="mb-6 animate-slide-up stagger-2">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/40 dark:to-indigo-900/40 flex items-center justify-center">
          <svg className="w-[1.125rem] h-[1.125rem] text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold">Notifications</h2>
      </div>
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
        {/* Reading Reminders */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium">Reading Reminders</label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Daily nudge when you haven&apos;t read</p>
          </div>
          <ToggleSwitch
            checked={settings.notificationsEnabled}
            onChange={() => onSave({ notificationsEnabled: !settings.notificationsEnabled })}
            disabled={saving}
          />
        </div>

        {/* Streak Alerts */}
        <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">Streak Milestones</label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Celebrate 3, 7, 30-day streaks</p>
            </div>
            <ToggleSwitch
              checked={settings.streakAlerts !== false}
              onChange={() => onSave({ streakAlerts: !settings.streakAlerts })}
              disabled={saving}
              size="large"
            />
          </div>
        </div>

        {/* Friend Messages */}
        <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">Friend Messages</label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Your reading friend&apos;s insights and tips</p>
            </div>
            <ToggleSwitch
              checked={settings.friendMessages !== false}
              onChange={() => onSave({ friendMessages: !settings.friendMessages })}
              disabled={saving}
              size="large"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
