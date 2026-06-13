'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { warn } from '@/lib/logger';
import { FRIEND_PERSONAS, DEFAULT_PERSONA } from '@/lib/companion-personas';

interface UseCompanionPersonaReturn {
  friendName: string;
  friendEmoji: string;
  friendPersonaKey: string | undefined;
  companionMode: 'casual' | 'scholar' | 'socratic';
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
        warn('useCompanionPersona: load failed', err);
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
    setFriendName,
    setFriendEmoji,
    setFriendPersonaKey,
    setCompanionMode,
  };
}
