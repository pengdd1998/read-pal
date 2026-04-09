'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface FriendSettings {
  friendPersona: string;
  friendFrequency: string;
}

interface FriendStats {
  totalChats: number;
  booksDiscussed: number;
  firstChat: string | null;
}

const PERSONAS: Record<string, { name: string; emoji: string; personality: string; greeting: string }> = {
  sage: { name: 'Sage', emoji: '\uD83E\uDD89', personality: 'Thoughtful, patient, deep', greeting: 'Every book holds a secret waiting to be discovered.' },
  penny: { name: 'Penny', emoji: '\u2B50', personality: 'Enthusiastic, curious, warm', greeting: 'I\'m so glad you\'re here! Let\'s explore together.' },
  alex: { name: 'Alex', emoji: '\uD83D\uDD0D', personality: 'Challenging, direct, sharp', greeting: 'Ready to push your thinking? Let\'s go.' },
  quinn: { name: 'Quinn', emoji: '\uD83C\uDF0A', personality: 'Calm, minimalist, wise', greeting: 'Silence has its own wisdom. I speak when it matters.' },
  sam: { name: 'Sam', emoji: '\uD83C\uDFAF', personality: 'Practical, focused, helpful', greeting: 'Let\'s make the most of your reading time.' },
};

export default function FriendPage() {
  const [settings, setSettings] = useState<FriendSettings | null>(null);
  const [stats, setStats] = useState<FriendStats>({ totalChats: 0, booksDiscussed: 0, firstChat: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<FriendSettings>('/api/settings');
        if (res.success && res.data) {
          setSettings(res.data as unknown as FriendSettings);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const persona = settings ? PERSONAS[settings.friendPersona] || PERSONAS.penny : PERSONAS.penny;
  const frequencyLabel = settings?.friendFrequency === 'minimal' ? 'Quiet Mode' : settings?.friendFrequency === 'frequent' ? 'Active Companion' : 'Friendly';

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 animate-fade-in">
      {/* Back link */}
      <div className="mb-8 animate-slide-up">
        <Link href="/dashboard" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Dashboard
        </Link>
      </div>

      {/* Friend card */}
      <div className="text-center mb-10 animate-slide-up stagger-1">
        <div className="w-24 h-24 mx-auto mb-4 relative">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-200 to-teal-200 dark:from-amber-800/40 dark:to-teal-800/40 rounded-3xl rotate-6 scale-95" />
          <div className="absolute inset-0 bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/30 dark:to-teal-900/30 rounded-3xl flex items-center justify-center shadow-sm">
            <span className="text-5xl">{persona.emoji}</span>
          </div>
        </div>
        <h1 className="text-3xl font-bold mb-1">{loading ? '...' : persona.name}</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">{persona.personality}</p>
        <p className="text-gray-600 dark:text-gray-300 text-sm mt-3 max-w-md mx-auto leading-relaxed italic">
          &ldquo;{persona.greeting}&rdquo;
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3 mb-8 animate-slide-up stagger-2">
        {[
          { label: 'Status', value: frequencyLabel, accent: 'text-amber-600 dark:text-amber-400' },
          { label: 'Mode', value: settings?.friendFrequency === 'minimal' ? 'Listener' : settings?.friendFrequency === 'frequent' ? 'Proactive' : 'Balanced', accent: 'text-teal-600 dark:text-teal-400' },
          { label: 'Style', value: persona.name, accent: 'text-amber-600 dark:text-amber-400' },
        ].map((item) => (
          <div key={item.label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 text-center">
            <div className={`text-sm font-semibold ${item.accent}`}>{item.value}</div>
            <div className="text-xs text-gray-400 mt-1">{item.label}</div>
          </div>
        ))}
      </div>

      {/* Personality selector */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-6 animate-slide-up stagger-3">
        <h2 className="font-semibold mb-4">Choose Your Companion</h2>
        <div className="grid grid-cols-1 gap-2">
          {Object.entries(PERSONAS).map(([id, p]) => {
            const isSelected = settings?.friendPersona === id;
            return (
              <button
                key={id}
                onClick={async () => {
                  try {
                    const res = await api.patch('/api/settings', { friendPersona: id });
                    if (res.success) setSettings((prev) => prev ? { ...prev, friendPersona: id } : prev);
                  } catch {}
                }}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all duration-200 ${
                  isSelected
                    ? 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/10'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50'
                }`}
              >
                <span className="text-2xl">{p.emoji}</span>
                <div className="text-left flex-1">
                  <div className="font-medium text-sm">{p.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{p.personality}</div>
                </div>
                {isSelected && (
                  <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Interaction frequency */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-6 animate-slide-up stagger-4">
        <h2 className="font-semibold mb-4">Interaction Style</h2>
        <div className="grid grid-cols-3 gap-2">
          {([
            ['minimal', 'Listener', 'I wait for you to ask'],
            ['normal', 'Balanced', 'I nudge when helpful'],
            ['frequent', 'Proactive', 'I share ideas often'],
          ] as const).map(([value, label, desc]) => (
            <button
              key={value}
              onClick={async () => {
                try {
                  const res = await api.patch('/api/settings', { friendFrequency: value });
                  if (res.success) setSettings((prev) => prev ? { ...prev, friendFrequency: value } : prev);
                } catch {}
              }}
              className={`py-3 px-2 rounded-xl text-center transition-all duration-200 border ${
                settings?.friendFrequency === value
                  ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 shadow-xs'
                  : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className={`text-sm font-medium ${settings?.friendFrequency === value ? 'text-amber-700 dark:text-amber-300' : 'text-gray-600 dark:text-gray-400'}`}>
                {label}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Quick links */}
      <div className="flex items-center justify-center gap-4 mt-8 animate-slide-up stagger-5">
        <Link href="/settings" className="text-sm text-gray-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
          All Settings
        </Link>
        <span className="text-gray-300 dark:text-gray-600">|</span>
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
          Dashboard
        </Link>
      </div>
    </div>
  );
}
