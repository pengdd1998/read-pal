export interface FriendPersona {
  name: string;
  emoji: string;
}

export const FRIEND_PERSONAS: Record<string, FriendPersona> = {
  sage: { name: 'Sage', emoji: '🦉' },
  penny: { name: 'Penny', emoji: '⭐' },
  alex: { name: 'Alex', emoji: '🔍' },
  quinn: { name: 'Quinn', emoji: '🌊' },
  sam: { name: 'Sam', emoji: '🎯' },
};

export const DEFAULT_PERSONA: FriendPersona = { name: 'Penny', emoji: '⭐' };
