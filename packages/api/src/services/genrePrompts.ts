/**
 * Genre-aware prompt additions for the AI companion.
 *
 * Mirrors the frontend's companion-prompts genre detection logic
 * so the backend GLM agent also adapts its behavior by genre.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BookGenre = 'fiction' | 'nonfiction' | 'technical' | 'academic' | 'default';

// ---------------------------------------------------------------------------
// Keyword lists (kept in sync with packages/web/src/lib/companion-prompts.ts)
// ---------------------------------------------------------------------------

const FICTION_KEYWORDS = [
  'novel', 'fiction', 'story', 'fantasy', 'mystery', 'romance', 'thriller',
  'adventure', 'fairy tale', 'science fiction', 'sci-fi', 'young adult',
  'drama', 'horror', 'crime', 'literary fiction',
];

const TECHNICAL_KEYWORDS = [
  'programming', 'software', 'algorithm', 'computer', 'engineering',
  'javascript', 'python', 'typescript', 'rust', 'go', 'java',
  'machine learning', 'data science', 'web development', 'devops',
  'database', 'api', 'framework', 'coding', 'developer',
];

const ACADEMIC_KEYWORDS = [
  'research', 'study', 'thesis', 'dissertation', 'journal', 'paper',
  'university', 'academic', 'peer-reviewed', 'methodology', 'phd',
  'proceedings', 'monograph', 'scholarly',
];

// ---------------------------------------------------------------------------
// Genre-specific prompt instructions
// ---------------------------------------------------------------------------

const GENRE_INSTRUCTIONS: Record<BookGenre, string> = {
  fiction: `## Genre-Specific Approach (Fiction)
- Focus on narrative craft: character development, plot structure, themes, and literary devices.
- Appreciate beautiful prose and point out stylistic choices when asked.
- Be careful with spoilers — if the reader is early in the book, discuss what's happened so far without revealing later events.
- Help them notice foreshadowing, symbolism, and subtext.
- Ask about character motivations and emotional arcs.
- Connect scenes to larger themes when patterns emerge.`,

  nonfiction: `## Genre-Specific Approach (Nonfiction)
- Focus on the author's arguments, evidence quality, and logical structure.
- Help the reader evaluate claims: "How strong is the evidence for this?"
- Draw out practical takeaways and real-world applications.
- When concepts are abstract, use concrete examples and analogies.
- Note when the author's bias or perspective shapes the argument.
- Summarize key ideas after dense sections.`,

  technical: `## Genre-Specific Approach (Technical)
- Explain concepts step-by-step, building from prerequisites.
- Use concrete analogies to map unfamiliar tech ideas to everyday concepts.
- When code appears, walk through what each part does — don't skip steps.
- Check understanding before layering on more complexity.
- Connect new concepts to the reader's existing knowledge.
- If the reader seems stuck, rephrase rather than repeat.`,

  academic: `## Genre-Specific Approach (Academic)
- Analyze methodology: sampling, controls, statistical methods, potential biases.
- Identify key findings and distinguish them from the author's interpretation.
- Connect to the broader field — what other research supports or contradicts this?
- Help evaluate the strength of evidence and limitations of the study design.
- Clarify discipline-specific jargon without oversimplifying.
- Encourage critical thinking: "What would a counter-argument look like?"`,

  default: '',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect book genre from metadata or title+description.
 * Priority: explicit genre metadata → keyword heuristic → default.
 */
export function detectGenre(
  genreMetadata?: string[],
  title?: string,
  description?: string,
): BookGenre {
  if (genreMetadata && genreMetadata.length > 0) {
    const combined = genreMetadata.join(' ').toLowerCase();
    if (FICTION_KEYWORDS.some((k) => combined.includes(k))) return 'fiction';
    if (TECHNICAL_KEYWORDS.some((k) => combined.includes(k))) return 'technical';
    if (ACADEMIC_KEYWORDS.some((k) => combined.includes(k))) return 'academic';
    return 'nonfiction';
  }

  const searchText = `${title || ''} ${description || ''}`.toLowerCase();
  if (FICTION_KEYWORDS.some((k) => searchText.includes(k))) return 'fiction';
  if (TECHNICAL_KEYWORDS.some((k) => searchText.includes(k))) return 'technical';
  if (ACADEMIC_KEYWORDS.some((k) => searchText.includes(k))) return 'academic';

  return 'default';
}

/**
 * Get the genre-specific prompt instructions to append to a system prompt.
 * Returns an empty string for 'default' genre (no-op).
 */
export function getGenreInstructions(genre: BookGenre): string {
  return GENRE_INSTRUCTIONS[genre] || '';
}
