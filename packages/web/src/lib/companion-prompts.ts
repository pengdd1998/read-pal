/**
 * Genre-aware prompt templates for the Companion Chat.
 *
 * Each genre category provides:
 *  - `greeting`: contextual first-time greeting (used on auto-open)
 *  - `returnGreeting`: greeting for returning readers (>30 min gap)
 *  - `suggestedPrompts`: 3 suggested questions shown in the empty chat state
 *
 * The "genre" is derived from book metadata (`metadata.genre`), falling back
 * to heuristic keyword matching on the book title when no metadata is present.
 *
 * All user-facing strings use translation keys via a TranslateFn parameter.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BookGenre = 'fiction' | 'nonfiction' | 'technical' | 'academic' | 'default';

export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

interface GenreTemplate {
  greeting: (t: TranslateFn, friendName: string, bookTitle?: string) => string;
  returnGreeting: (t: TranslateFn, friendName: string) => string;
  suggestedPrompts: (t: TranslateFn, bookTitle?: string) => string[];
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/** Pick a random element from an array. */
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const TEMPLATES: Record<BookGenre, GenreTemplate> = {
  fiction: {
    greeting: (t, name, title) =>
      title
        ? t('prompts_fiction_greeting_with_title', { name, title })
        : t('prompts_fiction_greeting', { name }),
    returnGreeting: (t, name) =>
      pickRandom([
        t('prompts_fiction_return_1'),
        t('prompts_fiction_return_2', { name }),
        t('prompts_fiction_return_3'),
      ]),
    suggestedPrompts: (t, title) => [
      title
        ? t('prompts_fiction_suggest_1_with_title', { title })
        : t('prompts_fiction_suggest_1'),
      t('prompts_fiction_suggest_2'),
      t('prompts_fiction_suggest_3'),
    ],
  },

  nonfiction: {
    greeting: (t, name, title) =>
      title
        ? t('prompts_nonfiction_greeting_with_title', { name, title })
        : t('prompts_nonfiction_greeting', { name }),
    returnGreeting: (t, name) =>
      pickRandom([
        t('prompts_nonfiction_return_1'),
        t('prompts_nonfiction_return_2', { name }),
        t('prompts_nonfiction_return_3'),
      ]),
    suggestedPrompts: (t, title) => [
      title
        ? t('prompts_nonfiction_suggest_1_with_title', { title })
        : t('prompts_nonfiction_suggest_1'),
      t('prompts_nonfiction_suggest_2'),
      t('prompts_nonfiction_suggest_3'),
    ],
  },

  technical: {
    greeting: (t, name, title) =>
      title
        ? t('prompts_technical_greeting_with_title', { name, title })
        : t('prompts_technical_greeting', { name }),
    returnGreeting: (t, name) =>
      pickRandom([
        t('prompts_technical_return_1'),
        t('prompts_technical_return_2', { name }),
        t('prompts_technical_return_3'),
      ]),
    suggestedPrompts: (t, title) => [
      title
        ? t('prompts_technical_suggest_1_with_title', { title })
        : t('prompts_technical_suggest_1'),
      t('prompts_technical_suggest_2'),
      t('prompts_technical_suggest_3'),
    ],
  },

  academic: {
    greeting: (t, name, title) =>
      title
        ? t('prompts_academic_greeting_with_title', { name, title })
        : t('prompts_academic_greeting', { name }),
    returnGreeting: (t, name) =>
      pickRandom([
        t('prompts_academic_return_1'),
        t('prompts_academic_return_2', { name }),
        t('prompts_academic_return_3'),
      ]),
    suggestedPrompts: (t, title) => [
      title
        ? t('prompts_academic_suggest_1_with_title', { title })
        : t('prompts_academic_suggest_1'),
      t('prompts_academic_suggest_2'),
      t('prompts_academic_suggest_3'),
    ],
  },

  default: {
    greeting: (t, name, title) =>
      title
        ? t('prompts_default_greeting_with_title', { name, title })
        : t('prompts_default_greeting', { name }),
    returnGreeting: (t, name) =>
      pickRandom([
        t('prompts_default_return_1'),
        t('prompts_default_return_2', { name }),
        t('prompts_default_return_3'),
      ]),
    suggestedPrompts: (t, title) => [
      title
        ? t('prompts_default_suggest_1_with_title', { title })
        : t('prompts_default_suggest_1'),
      t('prompts_default_suggest_2'),
      title
        ? t('prompts_default_suggest_3_with_title', { title })
        : t('prompts_default_suggest_3'),
    ],
  },
};

// ---------------------------------------------------------------------------
// Genre detection
// ---------------------------------------------------------------------------

/** Keywords that signal fiction content. */
const FICTION_KEYWORDS = [
  'novel', 'fiction', 'story', 'fantasy', 'mystery', 'romance', 'thriller',
  'adventure', 'fairy tale', 'science fiction', 'sci-fi', 'young adult',
  'drama', 'horror', 'crime', 'literary fiction',
];

/** Keywords that signal technical content. */
const TECHNICAL_KEYWORDS = [
  'programming', 'software', 'algorithm', 'computer', 'engineering',
  'javascript', 'python', 'typescript', 'rust', 'go', 'java',
  'machine learning', 'data science', 'web development', 'devops',
  'database', 'api', 'framework', 'coding', 'developer',
];

/** Keywords that signal academic content. */
const ACADEMIC_KEYWORDS = [
  'research', 'study', 'thesis', 'dissertation', 'journal', 'paper',
  'university', 'academic', 'peer-reviewed', 'methodology', 'phd',
  'proceedings', 'monograph', 'scholarly',
];

/**
 * Detect the book genre from metadata or title.
 *
 * Priority:
 *  1. Explicit `metadata.genre` strings
 *  2. Heuristic keyword match on book title + description
 *  3. Default fallback
 */
export function detectGenre(
  genreMetadata?: string[] | string,
  title?: string,
  description?: string,
): BookGenre {
  // Normalize: genre may be a string or string[] from different book sources
  const genreList = typeof genreMetadata === 'string'
    ? [genreMetadata]
    : Array.isArray(genreMetadata)
      ? genreMetadata
      : undefined;

  // 1. Check explicit genre metadata
  if (genreList && genreList.length > 0) {
    const combined = genreList.join(' ').toLowerCase();
    if (FICTION_KEYWORDS.some((k) => combined.includes(k))) return 'fiction';
    if (TECHNICAL_KEYWORDS.some((k) => combined.includes(k))) return 'technical';
    if (ACADEMIC_KEYWORDS.some((k) => combined.includes(k))) return 'academic';
    // Genre exists but doesn't match specific categories → nonfiction
    return 'nonfiction';
  }

  // 2. Heuristic from title + description
  const searchText = `${title || ''} ${description || ''}`.toLowerCase();
  if (FICTION_KEYWORDS.some((k) => searchText.includes(k))) return 'fiction';
  if (TECHNICAL_KEYWORDS.some((k) => searchText.includes(k))) return 'technical';
  if (ACADEMIC_KEYWORDS.some((k) => searchText.includes(k))) return 'academic';

  // 3. Default
  return 'default';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Get the template for a given genre. */
export function getGenreTemplate(genre: BookGenre): GenreTemplate {
  return TEMPLATES[genre] || TEMPLATES.default;
}

/** Whether auto-open is appropriate for this genre. */
export function shouldAutoOpen(genre: BookGenre): boolean {
  // Fiction: don't auto-open — it breaks immersion
  // All other genres: auto-open with contextual greeting
  return genre !== 'fiction';
}

// ---------------------------------------------------------------------------
// Socratic mode prompts
// ---------------------------------------------------------------------------

/**
 * Suggested prompts for Socratic companion mode.
 *
 * Socratic mode is genre-independent — it guides the reader to discover
 * meaning through questions rather than providing direct answers.
 */
export function getSocraticPrompts(t: TranslateFn, bookTitle?: string): string[] {
  return [
    bookTitle
      ? t('prompts_socratic_1_with_title', { title: bookTitle })
      : t('prompts_socratic_1'),
    t('prompts_socratic_2'),
    t('prompts_socratic_3'),
  ];
}
