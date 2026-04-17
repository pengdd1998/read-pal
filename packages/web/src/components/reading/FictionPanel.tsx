'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { renderSimpleMarkdown } from '@/lib/markdown';

// ---------------------------------------------------------------------------
// Character extraction heuristics
// ---------------------------------------------------------------------------

interface Character {
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

function extractCharacters(html: string, maxChars = 8): Character[] {
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

type MoodType = 'tense' | 'joyful' | 'sad' | 'romantic' | 'mysterious' | 'neutral';

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

const MOOD_COLORS: Record<MoodType, string> = {
  tense: 'bg-red-400',
  joyful: 'bg-yellow-400',
  sad: 'bg-blue-400',
  romantic: 'bg-pink-400',
  mysterious: 'bg-purple-400',
  neutral: 'bg-gray-300 dark:bg-gray-600',
};

const MOOD_ICONS: Record<MoodType, string> = {
  tense: '⚡',
  joyful: '☀',
  sad: '💧',
  romantic: '♥',
  mysterious: '🌙',
  neutral: '○',
};

function detectMood(html: string): MoodType {
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface FictionPanelProps {
  chapterContent: string;
  chapterIndex: number;
  onAskAboutCharacter?: (name: string) => void;
}

export function FictionPanel({
  chapterContent,
  chapterIndex,
  onAskAboutCharacter,
}: FictionPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);

  const characters = useMemo(
    () => extractCharacters(chapterContent),
    [chapterContent],
  );

  const mood = useMemo(() => detectMood(chapterContent), [chapterContent]);

  // Reset selection when chapter changes
  useEffect(() => {
    setSelectedCharacter(null);
  }, [chapterIndex]);

  const handleCharacterClick = useCallback((name: string) => {
    if (selectedCharacter === name) {
      setSelectedCharacter(null);
    } else {
      setSelectedCharacter(name);
    }
  }, [selectedCharacter]);

  const handleAskCompanion = useCallback((name: string) => {
    onAskAboutCharacter?.(name);
    setIsOpen(false);
  }, [onAskAboutCharacter]);

  if (!chapterContent) return null;

  return (
    <>
      {/* Floating button — positioned near the companion chat button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 left-6 z-40 flex items-center gap-2 px-3 py-2.5 rounded-full shadow-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 hover:scale-105 active:scale-95 transition-all"
          aria-label="Character tracker and mood"
        >
          <span className="text-sm">👥</span>
          {characters.length > 0 && (
            <span className="text-xs font-medium">{characters.length}</span>
          )}
        </button>
      )}

      {/* Panel */}
      {isOpen && (
        <>
          {/* Mobile backdrop */}
          <div
            className="fixed inset-0 z-40 md:hidden bg-black/10"
            onClick={() => setIsOpen(false)}
          />

          <div className="fixed left-0 bottom-0 z-50 w-full md:left-6 md:bottom-20 md:w-80 md:max-h-[70vh] bg-white dark:bg-gray-800 shadow-2xl rounded-t-2xl md:rounded-2xl border border-purple-200/50 dark:border-purple-800/30 flex flex-col animate-slide-in-up md:animate-fade-in max-h-[60vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-purple-200/50 dark:border-purple-900/30">
              <div className="flex items-center gap-2">
                <span className="text-sm">👥</span>
                <h3 className="font-semibold text-sm text-purple-900 dark:text-purple-100">
                  Story Tracker
                </h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Close character tracker"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Mood indicator */}
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Chapter Mood
              </p>
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${MOOD_COLORS[mood]}`} />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {MOOD_ICONS[mood]} {mood.charAt(0).toUpperCase() + mood.slice(1)}
                </span>
              </div>
            </div>

            {/* Characters list */}
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Characters in This Chapter
              </p>

              {characters.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
                  No characters detected yet. Keep reading!
                </p>
              ) : (
                <div className="space-y-2">
                  {characters.map((char) => (
                    <div key={char.name}>
                      <button
                        onClick={() => handleCharacterClick(char.name)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl transition-all ${
                          selectedCharacter === char.name
                            ? 'bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700'
                            : 'bg-gray-50 dark:bg-gray-900/50 border border-transparent hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                            {char.name}
                          </span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {char.mentions}x
                          </span>
                        </div>
                        {selectedCharacter === char.name && (
                          <div className="mt-2 space-y-2">
                            <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                              &ldquo;{char.context}&rdquo;
                            </p>
                            {onAskAboutCharacter && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAskCompanion(char.name);
                                }}
                                className="text-xs font-medium text-purple-600 dark:text-purple-400 hover:underline"
                              >
                                Ask companion about {char.name.split(' ')[0]} →
                              </button>
                            )}
                          </div>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
