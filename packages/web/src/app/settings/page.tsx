'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface UserSettings {
  theme: string;
  fontSize: number;
  fontFamily: string;
  readingGoal: number;
  notificationsEnabled: boolean;
  friendPersona: string;
  friendFrequency: string;
}

const PERSONAS = [
  { id: 'sage', name: 'Sage', description: 'Wise and thoughtful', emoji: '\u{1F9D9}' },
  { id: 'penny', name: 'Penny', description: 'Enthusiastic and curious', emoji: '\u2728' },
  { id: 'alex', name: 'Alex', description: 'Challenging and direct', emoji: '\u{1F3AF}' },
  { id: 'quinn', name: 'Quinn', description: 'Calm and minimalist', emoji: '\u{1F343}' },
  { id: 'sam', name: 'Sam', description: 'Practical and focused', emoji: '\u{1F4DA}' },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const res = await api.get('/api/settings');
      if (res.success && res.data) setSettings(res.data as UserSettings);
    } catch {
      /* empty */
    }
    setLoading(false);
  }

  async function saveSettings(updates: Partial<UserSettings>) {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await api.patch('/api/settings', updates);
      if (res.success && res.data) setSettings(res.data as UserSettings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      /* empty */
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Failed to load settings</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">Settings</h1>

        {/* Appearance */}
        <section className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Appearance</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Theme</label>
              <select
                value={settings.theme}
                onChange={(e) => saveSettings({ theme: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-gray-700 focus:ring-2 focus:ring-blue-500"
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Font Size: {settings.fontSize}px
              </label>
              <input
                type="range"
                min="12"
                max="32"
                value={settings.fontSize}
                onChange={(e) => saveSettings({ fontSize: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Font Family</label>
              <select
                value={settings.fontFamily}
                onChange={(e) => saveSettings({ fontFamily: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-gray-700 focus:ring-2 focus:ring-blue-500"
              >
                <option value="Inter">Inter</option>
                <option value="Georgia">Georgia</option>
                <option value="Merriweather">Merriweather</option>
                <option value="system-ui">System Default</option>
              </select>
            </div>
          </div>
        </section>

        {/* Reading Goals */}
        <section className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Reading Goals</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Books per week</label>
            <input
              type="number"
              min="1"
              max="10"
              value={settings.readingGoal}
              onChange={(e) => saveSettings({ readingGoal: parseInt(e.target.value) || 1 })}
              className="w-24 border rounded-lg px-3 py-2 text-gray-700 focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </section>

        {/* Reading Friend */}
        <section className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Reading Friend</h2>
          <div className="grid grid-cols-1 gap-3 mb-4">
            {PERSONAS.map((p) => (
              <button
                key={p.id}
                onClick={() => saveSettings({ friendPersona: p.id })}
                className={`flex items-center gap-3 p-3 rounded-lg border-2 transition ${
                  settings.friendPersona === p.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="text-2xl">{p.emoji}</span>
                <div className="text-left">
                  <div className="font-medium text-gray-900">{p.name}</div>
                  <div className="text-sm text-gray-500">{p.description}</div>
                </div>
              </button>
            ))}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Interaction frequency
            </label>
            <select
              value={settings.friendFrequency}
              onChange={(e) => saveSettings({ friendFrequency: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-gray-700 focus:ring-2 focus:ring-blue-500"
            >
              <option value="minimal">Minimal - Only when asked</option>
              <option value="normal">Normal - Helpful nudges</option>
              <option value="frequent">Frequent - Active companion</option>
            </select>
          </div>
        </section>

        {saving && <p className="text-sm text-gray-500">Saving...</p>}
        {saved && <p className="text-sm text-green-600">Settings saved!</p>}
      </div>
    </div>
  );
}
