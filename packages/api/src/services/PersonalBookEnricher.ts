/**
 * Personal Book Enricher
 *
 * Three-phase AI enrichment pipeline that transforms raw reading data
 * (annotations, sessions, chat messages) into structured sections for
 * the Personal Reading Book.
 *
 * Each phase is a focused GLM call to keep outputs clean and within
 * token limits.
 */

import type { Annotation, Book, ReadingSession } from '../models';
import { chatCompletion } from './llmClient';
import { generateId } from '@read-pal/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnrichedCover {
  subtitle: string;
  readingTimeFormatted: string;
}

export interface ReadingMilestone {
  label: string;
  date: string;
  detail?: string;
}

export interface EnrichedJourney {
  milestones: ReadingMilestone[];
  paceComment: string;
}

export interface HighlightContent {
  content: string;
  note?: string;
}

export interface ThemeCluster {
  name: string;
  description: string;
  highlightIds: string[];
  highlights: HighlightContent[];
}

export interface EnrichedHighlights {
  themes: ThemeCluster[];
}

export interface NoteEntry {
  chapterIndex: number;
  content: string;
  note: string;
  tags: string[];
}

export interface EnrichedNotes {
  notes: NoteEntry[];
  emotionalTrajectory: string;
  tagCloud: Record<string, number>;
}

export interface CuratedConversation {
  userMessage: string;
  assistantMessage: string;
  context: string;
  why: string;
}

export interface EnrichedConversations {
  conversations: CuratedConversation[];
}

export interface BookConnection {
  title: string;
  author: string;
  connection: string;
}

export interface UnresolvedQuestion {
  question: string;
  context: string;
}

export interface EnrichedSynthesis {
  insights: Array<{ theme: string; description: string }>;
  connections: BookConnection[];
  recommendations: string[];
  unresolvedQuestions: UnresolvedQuestion[];
  reflectionPrompt: string;
}

export interface EnrichedPersonalBook {
  cover: EnrichedCover;
  journey: EnrichedJourney;
  highlights: EnrichedHighlights;
  notes: EnrichedNotes;
  conversations: EnrichedConversations;
  synthesis: EnrichedSynthesis;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ChatMsg {
  role: string;
  content: string;
  timestamp: Date;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + '...';
}

function parseJson<T>(raw: string): T | null {
  let cleaned = raw.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) cleaned = fence[1].trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Enricher
// ---------------------------------------------------------------------------

export class PersonalBookEnricher {
  private llmAvailable: boolean;

  constructor() {
    this.llmAvailable = !!process.env.GLM_API_KEY;
  }

  async enrich(
    book: Book,
    annotations: Annotation[],
    sessions: ReadingSession[],
    chatMessages: ChatMsg[],
    otherBooks: Array<{ title: string; author: string }>,
  ): Promise<EnrichedPersonalBook> {
    if (!this.llmAvailable) {
      return this.localFallback(annotations, sessions, chatMessages);
    }

    // Phase 1: Structure analysis (themes, journey, cover)
    const structure = await this.analyzeStructure(book, annotations, sessions);

    // Phase 2: Conversation curation
    const conversations = await this.curateConversations(book, chatMessages, annotations);

    // Phase 3: Synthesis (insights, connections, forward look)
    const synthesis = await this.synthesize(book, annotations, chatMessages, otherBooks);

    return {
      cover: structure.cover,
      journey: structure.journey,
      highlights: structure.highlights,
      notes: structure.notes,
      conversations,
      synthesis,
    };
  }

  // -------------------------------------------------------------------------
  // Phase 1: Structure Analysis
  // -------------------------------------------------------------------------

  private async analyzeStructure(
    book: Book,
    annotations: Annotation[],
    sessions: ReadingSession[],
  ): Promise<{
    cover: EnrichedCover;
    journey: EnrichedJourney;
    highlights: EnrichedHighlights;
    notes: EnrichedNotes;
  }> {
    const highlights = annotations.filter((a) => a.type === 'highlight' || a.type === 'note');
    const notesOnly = annotations.filter((a) => a.type === 'note');
    const totalDuration = sessions.reduce((s, r) => s + r.duration, 0);
    const hours = Math.round(totalDuration / 3600);

    // Build tag cloud
    const tagCloud: Record<string, number> = {};
    for (const a of annotations) {
      for (const t of a.tags || []) {
        tagCloud[t] = (tagCloud[t] || 0) + 1;
      }
    }

    const highlightsSummary = highlights.slice(0, 80).map((a, i) => {
      const parts = [`[${i + 1}] id=${a.id.slice(0, 8)}`];
      if (a.content) parts.push(`text="${truncate(a.content, 200)}"`);
      if (a.note) parts.push(`note="${truncate(a.note, 100)}"`);
      if (a.tags?.length) parts.push(`tags=${a.tags.join(',')}`);
      if (a.location?.chapterIndex !== undefined) parts.push(`ch=${a.location.chapterIndex}`);
      return parts.join(' ');
    }).join('\n');

    const notesSummary = notesOnly.map((a) =>
      `ch=${a.location?.chapterIndex ?? '?'} note="${truncate(a.note || a.content, 150)}" tags=${(a.tags || []).join(',')}`
    ).join('\n');

    const sessionSummary = sessions.map((s) =>
      `${s.startedAt.toISOString().slice(0, 10)}: ${s.pagesRead}p, ${Math.round(s.duration / 60)}min, ${s.highlights}hl, ${s.notes}n`
    ).join('\n');

    const prompt = `Analyze the reading data for "${book.title}" by ${book.author}.

Reading time: ${hours} hours across ${sessions.length} sessions.

HIGHLIGHTS & NOTES:
${highlightsSummary || 'None'}

NOTES:
${notesSummary || 'None'}

SESSIONS:
${sessionSummary || 'None'}

TAGS: ${Object.entries(tagCloud).map(([t, c]) => `${t}(${c})`).join(', ') || 'None'}

Return JSON:
{
  "subtitle": "A creative subtitle for this reading journey (e.g., 'A Reader's Journey Through...')",
  "paceComment": "1-2 sentences about their reading pace pattern",
  "themes": [
    { "name": "theme name", "description": "why these highlights relate", "highlightIds": ["first-8-chars-of-id"] }
  ],
  "emotionalTrajectory": "1 sentence describing the emotional arc of their notes",
  "milestones": [
    { "label": "Started reading", "date": "ISO date", "detail": "optional detail" }
  ]
}

Rules:
- Identify 3-6 themes from highlights, grouping by topic. Use first 8 chars of annotation IDs.
- Create 3-8 milestones from session data (first session, notable sessions, completion).
- Keep descriptions concise (1-2 sentences each).
- Respond ONLY with valid JSON.`;

    const raw = await chatCompletion({
      maxTokens: 3000,
      temperature: 0.7,
      system: 'You are a reading analyst. Respond only with valid JSON.',
      messages: [{ role: 'user', content: prompt }],
    });

    const parsed = parseJson<{
      subtitle?: string;
      paceComment?: string;
      themes?: Array<{ name: string; description: string; highlightIds: string[] }>;
      emotionalTrajectory?: string;
      milestones?: Array<{ label: string; date: string; detail?: string }>;
    }>(raw);

    // Build annotation lookup by first 8 chars of ID for highlight resolution
    const annotationLookup = new Map<string, { content: string; note?: string }>();
    for (const a of annotations) {
      annotationLookup.set(a.id.slice(0, 8), {
        content: a.content || '',
        note: a.note || undefined,
      });
    }

    // Resolve theme highlight IDs to actual content
    const resolvedThemes: ThemeCluster[] = (parsed?.themes || this.defaultThemes(highlights)).map((t) => ({
      name: t.name,
      description: t.description,
      highlightIds: t.highlightIds,
      highlights: t.highlightIds
        .map((id) => annotationLookup.get(id))
        .filter((h): h is { content: string; note?: string } => h != null && h.content.length > 0),
    }));

    // Build notes list from raw data
    const notesEntries: NoteEntry[] = notesOnly.map((a) => ({
      chapterIndex: a.location?.chapterIndex ?? 0,
      content: a.content || '',
      note: a.note || '',
      tags: a.tags || [],
    }));

    return {
      cover: {
        subtitle: parsed?.subtitle || `A Reading Journey`,
        readingTimeFormatted: `${hours} hour${hours !== 1 ? 's' : ''} across ${sessions.length} session${sessions.length !== 1 ? 's' : ''}`,
      },
      journey: {
        milestones: parsed?.milestones || this.defaultMilestones(sessions),
        paceComment: parsed?.paceComment || '',
      },
      highlights: {
        themes: resolvedThemes,
      },
      notes: {
        notes: notesEntries,
        emotionalTrajectory: parsed?.emotionalTrajectory || '',
        tagCloud,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Phase 2: Conversation Curation
  // -------------------------------------------------------------------------

  private async curateConversations(
    book: Book,
    chatMessages: ChatMsg[],
    _annotations: Annotation[],
  ): Promise<EnrichedConversations> {
    if (chatMessages.length === 0) {
      return { conversations: [] };
    }

    // Pair user→assistant messages
    const pairs: Array<{ user: string; assistant: string }> = [];
    for (let i = 0; i < chatMessages.length - 1; i++) {
      if (chatMessages[i].role === 'user' && chatMessages[i + 1].role === 'assistant') {
        pairs.push({
          user: truncate(chatMessages[i].content, 200),
          assistant: truncate(chatMessages[i + 1].content, 300),
        });
      }
    }

    if (pairs.length === 0) {
      return { conversations: [] };
    }

    // If few pairs, just include them all
    if (pairs.length <= 5) {
      return {
        conversations: pairs.map((p) => ({
          userMessage: p.user,
          assistantMessage: p.assistant,
          context: '',
          why: '',
        })),
      };
    }

    const pairsText = pairs.map((p, i) =>
      `[${i + 1}] User: "${p.user}"\n    AI: "${p.assistant}"`
    ).join('\n\n');

    const prompt = `From these ${pairs.length} conversation exchanges while reading "${book.title}", select the 5-8 most meaningful ones — those showing insight, breakthrough, deep questioning, or emotional connection.

CONVERSATIONS:
${pairsText}

Return JSON:
{
  "selections": [1, 3, 7]
}

The numbers are 1-based indices from the list above. Pick the most substantive exchanges.
Respond ONLY with valid JSON.`;

    const raw = await chatCompletion({
      maxTokens: 500,
      temperature: 0.5,
      system: 'You are a conversation curator. Respond only with valid JSON.',
      messages: [{ role: 'user', content: prompt }],
    });

    const parsed = parseJson<{ selections?: number[] }>(raw);
    const indices = (parsed?.selections || []).filter(
      (n) => n >= 1 && n <= pairs.length,
    );

    return {
      conversations: indices.map((n) => {
        const p = pairs[n - 1];
        return {
          userMessage: p.user,
          assistantMessage: p.assistant,
          context: '',
          why: '',
        };
      }),
    };
  }

  // -------------------------------------------------------------------------
  // Phase 3: Synthesis
  // -------------------------------------------------------------------------

  private async synthesize(
    book: Book,
    annotations: Annotation[],
    _chatMessages: ChatMsg[],
    otherBooks: Array<{ title: string; author: string }>,
  ): Promise<EnrichedSynthesis> {
    const allTags = new Set<string>();
    for (const a of annotations) {
      for (const t of a.tags || []) allTags.add(t);
    }

    const highlightsText = annotations
      .filter((a) => a.type === 'highlight' || a.type === 'note')
      .slice(0, 30)
      .map((a) => truncate(a.content || a.note || '', 150))
      .join('\n');

    const otherBooksText = otherBooks.length > 0
      ? `Other books in reader's library: ${otherBooks.map((b) => `"${b.title}" by ${b.author}`).join(', ')}`
      : 'This is the only book in the reader\'s library so far.';

    const prompt = `Based on a reader's journey through "${book.title}" by ${book.author}, synthesize insights.

KEY HIGHLIGHTS:
${highlightsText || 'None'}

TAGS/CONCEPTS: ${Array.from(allTags).join(', ') || 'None'}

${otherBooksText}

Return JSON:
{
  "insights": [
    { "theme": "theme name", "description": "1-2 sentence insight about what the reader discovered" }
  ],
  "connections": [
    { "title": "book title", "author": "author", "connection": "how it connects" }
  ],
  "recommendations": ["Book recommendation 1", "Book recommendation 2"],
  "unresolvedQuestions": [
    { "question": "a question the reader raised but didn't resolve", "context": "where it came from" }
  ],
  "reflectionPrompt": "A personal reflection question crafted specifically for this reader"
}

Rules:
- Provide 3-6 insights about themes the reader engaged with
- Only include connections if there are meaningful thematic links to other books
- Suggest 2-3 books to read next (based on themes, not just genre)
- Identify 1-3 unresolved questions from their notes/tags
- The reflection prompt should be thought-provoking and personal
- Respond ONLY with valid JSON.`;

    const raw = await chatCompletion({
      maxTokens: 2000,
      temperature: 0.7,
      system: 'You are a reading synthesis expert. Respond only with valid JSON.',
      messages: [{ role: 'user', content: prompt }],
    });

    const parsed = parseJson<{
      insights?: Array<{ theme: string; description: string }>;
      connections?: BookConnection[];
      recommendations?: string[];
      unresolvedQuestions?: UnresolvedQuestion[];
      reflectionPrompt?: string;
    }>(raw);

    return {
      insights: parsed?.insights || [],
      connections: parsed?.connections || [],
      recommendations: parsed?.recommendations || [],
      unresolvedQuestions: parsed?.unresolvedQuestions || [],
      reflectionPrompt: parsed?.reflectionPrompt || 'What did this book change about how you think?',
    };
  }

  // -------------------------------------------------------------------------
  // Fallback (no LLM)
  // -------------------------------------------------------------------------

  private localFallback(
    annotations: Annotation[],
    sessions: ReadingSession[],
    _chatMessages: ChatMsg[],
  ): EnrichedPersonalBook {
    const highlights = annotations.filter((a) => a.type === 'highlight' || a.type === 'note');
    const notes = annotations.filter((a) => a.type === 'note');
    const totalDuration = sessions.reduce((s, r) => s + r.duration, 0);
    const hours = Math.round(totalDuration / 3600);
    const tagCloud: Record<string, number> = {};
    for (const a of annotations) {
      for (const t of a.tags || []) tagCloud[t] = (tagCloud[t] || 0) + 1;
    }

    return {
      cover: {
        subtitle: 'A Reading Journey',
        readingTimeFormatted: `${hours}h across ${sessions.length} sessions`,
      },
      journey: {
        milestones: this.defaultMilestones(sessions),
        paceComment: '',
      },
      highlights: {
        themes: this.defaultThemes(highlights),
      },
      notes: {
        notes: notes.map((a) => ({
          chapterIndex: a.location?.chapterIndex ?? 0,
          content: a.content || '',
          note: a.note || '',
          tags: a.tags || [],
        })),
        emotionalTrajectory: '',
        tagCloud,
      },
      conversations: { conversations: [] },
      synthesis: {
        insights: Object.entries(tagCloud).slice(0, 5).map(([theme]) => ({
          theme,
          description: `Explored across annotations`,
        })),
        connections: [],
        recommendations: [],
        unresolvedQuestions: [],
        reflectionPrompt: 'What did this book change about how you think?',
      },
    };
  }

  private defaultMilestones(sessions: ReadingSession[]): ReadingMilestone[] {
    if (sessions.length === 0) return [];
    return [
      { label: 'Started reading', date: sessions[0].startedAt.toISOString() },
      ...(sessions.length > 1
        ? [{ label: 'Last session', date: sessions[sessions.length - 1].startedAt.toISOString() }]
        : []),
    ];
  }

  private defaultThemes(highlights: Annotation[]): ThemeCluster[] {
    if (highlights.length === 0) return [];
    return [{
      name: 'All Highlights',
      description: 'All your highlighted passages',
      highlightIds: highlights.map((h) => h.id.slice(0, 8)),
      highlights: highlights
        .map((h) => ({ content: h.content || '', note: h.note || undefined }))
        .filter((h) => h.content.length > 0),
    }];
  }
}
