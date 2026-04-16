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
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BookGenre = 'fiction' | 'nonfiction' | 'technical' | 'academic' | 'default';

interface GenreTemplate {
  greeting: (friendName: string, bookTitle?: string) => string;
  returnGreeting: (friendName: string, bookTitle?: string) => string;
  suggestedPrompts: (bookTitle?: string) => string[];
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const TEMPLATES: Record<BookGenre, GenreTemplate> = {
  fiction: {
    greeting: (name, title) => {
      const bookRef = title ? ` for "${title}"` : '';
      return `Hi there! I'm ${name}, your reading companion${bookRef}. I'll be quietly here while you enjoy the story — tap me anytime you want to discuss a character, a twist, or a beautiful line.`;
    },
    returnGreeting: (name) => {
      const options = [
        "Welcome back! Where were we in the story?",
        `${name} here — ready to dive back in?`,
        "Hey! Good to see you again. The story awaits.",
      ];
      return options[Math.floor(Math.random() * options.length)];
    },
    suggestedPrompts: (title) => [
      title
        ? `What motivates the main character in "${title}"?`
        : 'What motivates the main character here?',
      'Is there foreshadowing in this passage?',
      'What symbolism do you see in this chapter?',
    ],
  },

  nonfiction: {
    greeting: (name, title) => {
      const bookRef = title ? ` for "${title}"` : '';
      return `Hi! I'm ${name}${bookRef}. I can help you understand key arguments, evaluate evidence, and pull out practical takeaways. Ask me anything!`;
    },
    returnGreeting: (name) => {
      const options = [
        "Welcome back! Want to pick up where we left off?",
        `${name} here — shall we continue exploring the ideas?`,
        "Good to see you again! Ready for more insights?",
      ];
      return options[Math.floor(Math.random() * options.length)];
    },
    suggestedPrompts: (title) => [
      title
        ? `What are the core arguments in "${title}"?`
        : 'What are the core arguments here?',
      'How strong is the evidence for this claim?',
      'What are the practical takeaways from this chapter?',
    ],
  },

  technical: {
    greeting: (name, title) => {
      const bookRef = title ? ` for "${title}"` : '';
      return `Hey! I'm ${name}${bookRef}. I can explain concepts step-by-step, walk through code examples, and help you understand the technical details. What are you working through?`;
    },
    returnGreeting: (name) => {
      const options = [
        "Welcome back! Still working through that section?",
        `${name} here — ready to tackle the next concept?`,
        "Good to see you! Let's continue.",
      ];
      return options[Math.floor(Math.random() * options.length)];
    },
    suggestedPrompts: (title) => [
      title
        ? `Explain the key concepts in "${title}" step by step`
        : 'Explain the key concepts here step by step',
      'Walk me through this code example',
      'What are the prerequisites for understanding this?',
    ],
  },

  academic: {
    greeting: (name, title) => {
      const bookRef = title ? ` for "${title}"` : '';
      return `Hello! I'm ${name}${bookRef}. I can help you analyze methodology, identify key findings, and connect this research to other work in the field. What would you like to explore?`;
    },
    returnGreeting: (name) => {
      const options = [
        "Welcome back! Shall we continue the analysis?",
        `${name} here — ready to dig deeper?`,
        "Good to see you. Let's continue our discussion.",
      ];
      return options[Math.floor(Math.random() * options.length)];
    },
    suggestedPrompts: (title) => [
      title
        ? `What is the thesis of "${title}"?`
        : 'What is the main thesis here?',
      'How does the author support their argument?',
      'What are the limitations of this methodology?',
    ],
  },

  default: {
    greeting: (name, title) => {
      const bookRef = title ? ` for "${title}"` : '';
      return `Hi there! I'm ${name}, your reading companion${bookRef}. I'll be here while you read — ask me anything about the text, or try selecting a passage to get started!`;
    },
    returnGreeting: (name) => {
      const options = [
        "Welcome back! Ready to pick up where we left off?",
        `Hey! ${name} here — good to see you again.`,
        "You're back! I was thinking about our last discussion...",
      ];
      return options[Math.floor(Math.random() * options.length)];
    },
    suggestedPrompts: (title) => [
      title
        ? `What should I know before starting "${title}"?`
        : "What's the main idea of this chapter?",
      'Summarize this chapter so far',
      title
        ? 'What questions should I ask while reading this?'
        : 'What should I pay attention to next?',
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
  genreMetadata?: string[],
  title?: string,
  description?: string,
): BookGenre {
  // 1. Check explicit genre metadata
  if (genreMetadata && genreMetadata.length > 0) {
    const combined = genreMetadata.join(' ').toLowerCase();
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
