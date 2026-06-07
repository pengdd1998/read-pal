'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { FRIEND_PERSONAS, DEFAULT_PERSONA } from '@/lib/companion-personas';

interface UseCompanionPersonaReturn {
  friendName: string;
  friendEmoji: string;
  friendPersonaKey: string | undefined;
  companionMode: 'casual' | 'scholar' | 'socratic';
  error: string | null;
  setFriendName: (name: string) => void;
  setFriendEmoji: (emoji: string) => void;
  setFriendPersonaKey: (key: string | undefined) => void;
  setCompanionMode: (mode: 'casual' | 'scholar' | 'socratic') => void;
}

export function useCompanionPersona(): UseCompanionPersonaReturn {
  const [friendName, setFriendName] = useState<string>(DEFAULT_PERSONA.name);
  const [friendEmoji, setFriendEmoji] = useState<string>(DEFAULT_PERSONA.emoji);
  const [friendPersonaKey, setFriendPersonaKey] = useState<string | undefined>(undefined);
  const [companionMode, setCompanionMode] = useState<'casual' | 'scholar' | 'socratic'>('casual');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadPersona = async () => {
      try {
        const result = await api.get<{ friendPersona?: string; companionMode?: string }>('/api/settings');
        if (!cancelled && result.success && result.data) {
          const data = result.data;
          const personaKey = data.friendPersona ?? '';
          const persona = FRIEND_PERSONAS[personaKey] ?? DEFAULT_PERSONA;
          setFriendName(persona.name);
          setFriendEmoji(persona.emoji);
          setFriendPersonaKey(personaKey || undefined);
          if (data.companionMode === 'scholar' || data.companionMode === 'casual' || data.companionMode === 'socratic') {
            setCompanionMode(data.companionMode);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load companion persona';
        if (!cancelled) setError(message);
      }
    };
    loadPersona();
    return () => { cancelled = true; };
  }, []);

  return {
    friendName,
    friendEmoji,
    friendPersonaKey,
    companionMode,
    error,
    setFriendName,
    setFriendEmoji,
    setFriendPersonaKey,
    setCompanionMode,
  };
}
