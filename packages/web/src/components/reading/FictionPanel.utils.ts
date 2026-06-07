// ---------------------------------------------------------------------------
// Character extraction heuristics
// ---------------------------------------------------------------------------

export interface Character {
  name: string;
  mentions: number;
  context: string; // first sentence mentioning them
}

const DIALOGUE_VERBS = [
  'said', 'says', 'whispered', 'shouted', 'cried', 'asked', 'replied',
  'answered', 'murmured', 'exclaimed', 'laughed', 'sighed', 'nodded',
  'smiled', 'frowned', 'thought', 'noticed', 'watched', 'turned',
];

const STOP_NAMES = new Set([
  'The', 'This', 'That', 'Then', 'There', 'They', 'Their', 'These',
  'Those', 'When', 'Where', 'What', 'Which', 'While', 'With', 'Will',
  'Chapter', 'Part', 'Book', 'Page', 'Section', 'Note', 'Yes', 'No',
  'Not', 'But', 'And', 'She', 'Her', 'His', 'Him', 'He', 'It',
  'After', 'Before', 'About', 'Into', 'From', 'Over', 'Under',
  'Now', 'Here', 'How', 'Why', 'Who', 'Just', 'Even', 'Still',
  'Only', 'Once', 'Again', 'Between', 'Through', 'During', 'Until',
  'Against', 'Without', 'Within', 'Along', 'Upon', 'Among',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December',
  'Christmas', 'Easter', 'Thanksgiving', 'New Year',
  'English', 'French', 'German', 'Spanish', 'Italian', 'American',
  'European', 'Asian', 'African', 'London', 'Paris', 'New York',
]);

export function extractCharacters(html: string, maxChars = 8): Character[] {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  const namePattern = new RegExp(
    `\\b([A-Z][a-z]{1,15}(?:\\s[A-Z][a-z]{1,15})?)\\s+(?:${DIALOGUE_VERBS.join('|')})\\b`,
    'g',
  );
  const possessivePattern = /\b([A-Z][a-z]{1,15}(?:\s[A-Z][a-z]{1,15})?)'s\b/g;

  const counts = new Map<string, { count: number; context: string }>();

  const addName = (name: string) => {
    const parts = name.split(' ');
    if (parts.some((p) => STOP_NAMES.has(p))) return;
    if (name.length < 2) return;
    const existing = counts.get(name);
    if (existing) {
      existing.count++;
    } else {
      // Get first sentence mentioning this name
      const idx = text.indexOf(name);
      const start = Math.max(0, idx - 20);
      const end = Math.min(text.length, idx + name.length + 60);
      const snippet = text.slice(start, end).trim();
      const context = snippet.length > 80 ? snippet.slice(0, 77) + '...' : snippet;
      counts.set(name, { count: 1, context });
    }
  };

  let match: RegExpExecArray | null;
  while ((match = namePattern.exec(text)) !== null) {
    addName(match[1]);
  }
  while ((match = possessivePattern.exec(text)) !== null) {
    addName(match[1]);
  }

  return Array.from(counts.entries())
    .map(([name, { count, context }]) => ({ name, mentions: count, context }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, maxChars);
}

// ---------------------------------------------------------------------------
// Mood detection
// ---------------------------------------------------------------------------

export type MoodType = 'tense' | 'joyful' | 'sad' | 'romantic' | 'mysterious' | 'neutral';

export const MOOD_COLORS: Record<MoodType, string> = {
  tense: 'bg-red-400',
  joyful: 'bg-yellow-400',
  sad: 'bg-blue-400',
  romantic: 'bg-pink-400',
  mysterious: 'bg-purple-400',
  neutral: 'bg-gray-300',
};

export const MOOD_ICONS: Record<MoodType, string> = {
  tense: '⚡',
  joyful: '☀',
  sad: '💧',
  romantic: '♥',
  mysterious: '🌙',
  neutral: '○',
};

const MOOD_KEYWORDS: Record<MoodType, string[]> = {
  tense: ['danger', 'threat', 'warning', 'shadow', 'dark', 'fear', 'weapon',
    'blood', 'attack', 'fight', 'escape', 'chase', 'suddenly', 'silence', 'frozen'],
  joyful: ['happy', 'joy', 'laugh', 'smile', 'celebrate', 'bright', 'sun',
    'dance', 'cheer', 'delight', 'warm', 'glad', 'wonderful', 'beautiful'],
  sad: ['sad', 'grief', 'loss', 'tears', 'cry', 'alone', 'empty', 'cold',
    'die', 'death', 'funeral', 'miss', 'regret', 'pain', 'hurt', 'broken'],
  romantic: ['heart', 'love', 'kiss', 'embrace', 'touch', 'soft', 'gentle',
    'passion', 'desire', 'warm', 'close', 'whisper', 'tender', 'beloved'],
  mysterious: ['secret', 'hidden', 'ancient', 'unknown', 'fog', 'strange',
    'riddle', 'clue', 'locked', 'forbidden', 'enigma', 'whisper', 'shadow'],
  neutral: [],
};

export function detectMood(html: string): MoodType {
  const text = html.replace(/<[^>]*>/g, ' ').toLowerCase();
  let bestMood: MoodType = 'neutral';
  let bestScore = 0;

  for (const [mood, keywords] of Object.entries(MOOD_KEYWORDS)) {
    const score = keywords.reduce((acc, kw) => acc + (text.includes(kw) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestMood = mood as MoodType;
    }
  }

  return bestScore >= 2 ? bestMood : 'neutral';
}
