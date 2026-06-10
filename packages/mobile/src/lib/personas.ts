export type PersonaKey = 'sage' | 'penny' | 'alex' | 'quinn' | 'sam';

export interface PersonaConfig {
  key: PersonaKey;
  name: string;
  tagline: string;
  description: string;
  icon: string;
  color: string;
  avatarBg: string;
  textColor: string;
}

export const PERSONAS: Record<PersonaKey, PersonaConfig> = {
  sage: {
    key: 'sage',
    name: 'Sage',
    tagline: 'Wise & patient',
    description: 'A wise, philosophical companion who asks deep questions and references great literature. Thoughtful and unhurried.',
    icon: 'leaf-outline',
    color: '#d97706',
    avatarBg: 'rgba(217,119,6,0.12)',
    textColor: '#92400e',
  },
  penny: {
    key: 'penny',
    name: 'Penny',
    tagline: 'Curious & energetic',
    description: 'An enthusiastic explorer of ideas who celebrates milestones and approaches every topic with upbeat curiosity.',
    icon: 'bulb-outline',
    color: '#e85d75',
    avatarBg: 'rgba(232,93,117,0.12)',
    textColor: '#9b2c3e',
  },
  alex: {
    key: 'alex',
    name: 'Alex',
    tagline: 'Analytical & direct',
    description: 'A structured thinker who creates summaries, systematic approaches, and clear frameworks for understanding.',
    icon: 'analytics-outline',
    color: '#2b8a94',
    avatarBg: 'rgba(43,138,148,0.12)',
    textColor: '#1a5f66',
  },
  quinn: {
    key: 'quinn',
    name: 'Quinn',
    tagline: 'Creative & imaginative',
    description: 'A creative spirit who makes unexpected connections, suggests writing exercises, and sees patterns everywhere.',
    icon: 'color-palette-outline',
    color: '#7c5cbf',
    avatarBg: 'rgba(124,92,191,0.12)',
    textColor: '#4a3580',
  },
  sam: {
    key: 'sam',
    name: 'Sam',
    tagline: 'Friendly & casual',
    description: 'A relaxed study buddy who keeps conversations light and practical, like chatting at a cafe with a good friend.',
    icon: 'heart-outline',
    color: '#4caf50',
    avatarBg: 'rgba(76,175,80,0.12)',
    textColor: '#2e7d32',
  },
};

export const PERSONA_LIST: PersonaConfig[] = Object.values(PERSONAS);
