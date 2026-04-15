/**
 * MemoryBook Service
 *
 * Generates, retrieves, and manages Memory Books — compilations of a user's
 * reading journey for a specific book that capture highlights, annotations,
 * insights, agent conversations, and key moments.
 *
 * Uses the shared GLM client to identify key moments and themes from raw
 * reading data and produce a narrative that feels like a cherished memento.
 */

import { Annotation, Book, MemoryBook, ReadingSession } from '../models';
import type {
  MemoryBookInsight,
  MemoryBookMoment,
  MemoryBookStats,
} from '../models/MemoryBook';
import { chatCompletion } from './llmClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  format?: 'scrapbook' | 'journal' | 'timeline' | 'podcast';
}

interface AgentConversationMessage {
  role: string;
  content: string;
  timestamp: Date;
  agentName: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class MemoryBookService {
  private llmAvailable: boolean;

  constructor() {
    this.llmAvailable = !!process.env.GLM_API_KEY;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Generate (or regenerate) a Memory Book for the given book + user.
   *
   * 1. Fetches all annotations for the book.
   * 2. Fetches reading sessions to compute stats.
   * 3. Fetches agent conversation messages stored in Redis.
   * 4. Sends the aggregated data to Claude to extract key moments and themes.
   * 5. Upserts the MemoryBook record.
   */
  async generate(
    bookId: string,
    userId: string,
    options: GenerateOptions = {},
  ): Promise<MemoryBook> {
    // 1–3. Fetch book, annotations, and sessions in parallel
    const [book, annotations, sessions] = await Promise.all([
      Book.findOne({ where: { id: bookId, userId } }),
      Annotation.findAll({
        where: { bookId, userId },
        order: [['createdAt', 'ASC']],
      }),
      ReadingSession.findAll({
        where: { bookId, userId },
        order: [['startedAt', 'ASC']],
      }),
    ]);

    if (!book) {
      throw new Error('Book not found');
    }

    // 4. Compute stats from sessions
    const stats = this.computeStats(annotations, sessions);

    // 5. Fetch agent conversations from Redis
    const conversations = await this.fetchAgentConversations(bookId, userId);

    // 6. Use Claude to extract moments and insights
    const { moments, insights, title } = await this.generateMomentsAndInsights(
      book,
      annotations,
      sessions,
      conversations,
    );

    // 7. Upsert the MemoryBook record
    const format = options.format ?? 'scrapbook';

    const [memoryBook] = await MemoryBook.upsert(
      {
        id: await this.getExistingId(bookId, userId),
        userId,
        bookId,
        title: title ?? `Memory Book: ${book.title}`,
        format,
        moments,
        insights,
        stats,
        generatedAt: new Date(),
      },
      { returning: true },
    );

    return memoryBook;
  }

  /**
   * Get a compiled Memory Book.
   */
  async getMemoryBook(
    bookId: string,
    userId: string,
  ): Promise<MemoryBook | null> {
    return MemoryBook.findOne({ where: { bookId, userId } });
  }

  /**
   * List all Memory Books for a user, newest first.
   */
  async listMemoryBooks(userId: string, options?: { limit?: number; offset?: number }): Promise<{ rows: MemoryBook[]; count: number }> {
    const limit = Math.min(options?.limit || 50, 100);
    const offset = options?.offset || 0;
    const { rows, count } = await MemoryBook.findAndCountAll({
      where: { userId },
      order: [['generatedAt', 'DESC']],
      include: [{ model: Book, as: 'book', attributes: ['id', 'title', 'author', 'coverUrl'] }],
      limit,
      offset,
    });
    return { rows, count };
  }

  /**
   * Delete a Memory Book.
   */
  async deleteMemoryBook(bookId: string, userId: string): Promise<boolean> {
    const count = await MemoryBook.destroy({ where: { bookId, userId } });
    return count > 0;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Compute aggregated stats from annotations and sessions.
   */
  private computeStats(
    annotations: Annotation[],
    sessions: ReadingSession[],
  ): MemoryBookStats {
    const totalHighlights = annotations.filter(
      (a) => a.type === 'highlight',
    ).length;

    const totalNotes = annotations.filter(
      (a) => a.type === 'note',
    ).length;

    const pagesRead = sessions.reduce((sum, s) => sum + s.pagesRead, 0);
    const readingDuration = sessions.reduce((sum, s) => sum + s.duration, 0);

    // Extract unique tags across annotations as discovered "concepts"
    const allTags = new Set<string>();
    for (const annotation of annotations) {
      if (annotation.tags) {
        for (const tag of annotation.tags) {
          allTags.add(tag);
        }
      }
    }

    return {
      pagesRead,
      totalHighlights,
      totalNotes,
      readingDuration,
      conceptsDiscovered: allTags.size,
      connectionsMade: 0,
    };
  }

  /**
   * Fetch agent conversations related to this book from Redis.
   *
   * Conversations are stored under keys matching
   * `agent:conversation:{userId}:{bookId}:*`.
   */
  private async fetchAgentConversations(
    bookId: string,
    userId: string,
  ): Promise<AgentConversationMessage[]> {
    const messages: AgentConversationMessage[] = [];

    try {
      // Dynamically import to avoid hard Redis dependency at module level
      const { redisClient } = await import('../db');
      const pattern = `agent:conversation:${userId}:${bookId}:*`;
      const keys: string[] = [];
      let cursor = '0';
      do {
        const [nextCursor, batch] = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        keys.push(...batch);
      } while (cursor !== '0');
      const batchKeys = keys.slice(0, 50);

      if (batchKeys.length > 0) {
        // Batch fetch via mget — avoids N+1 network round-trips
        const values = await redisClient.mget(...batchKeys);
        for (const raw of values) {
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              for (const msg of parsed) {
                messages.push({
                  role: msg.role ?? 'unknown',
                  content: msg.content ?? '',
                  timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
                  agentName: msg.agentName ?? 'companion',
                });
              }
            }
          } catch {
            // Skip malformed entries
          }
        }
      }
    } catch {
      // Redis unavailable — conversations will be empty
    }

    // Sort chronologically
    messages.sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );

    return messages;
  }

  /**
   * Call the LLM API to analyse reading data and produce key moments,
   * thematic insights, and a suggested title for the memory book.
   */
  private async generateMomentsAndInsights(
    book: Book,
    annotations: Annotation[],
    sessions: ReadingSession[],
    conversations: AgentConversationMessage[],
  ): Promise<{
    moments: MemoryBookMoment[];
    insights: MemoryBookInsight[];
    title: string | null;
  }> {
    // Fallback when no API key is configured
    if (!this.llmAvailable) {
      return this.generateFromLocalData(annotations, sessions, conversations);
    }

    // Build a concise summary for Claude
    const annotationSummary = annotations
      .slice(0, 100)
      .map((a, i) => {
        const parts = [`[${i + 1}] type=${a.type}`];
        if (a.content) parts.push(`content="${a.content.slice(0, 200)}"`);
        if (a.note) parts.push(`note="${a.note.slice(0, 200)}"`);
        if (a.tags && a.tags.length > 0) parts.push(`tags=${a.tags.join(',')}`);
        return parts.join(' ');
      })
      .join('\n');

    const conversationSummary = conversations
      .slice(0, 50)
      .map(
        (m) =>
          `[${m.timestamp.toISOString()}] ${m.agentName}(${m.role}): ${m.content.slice(0, 150)}`,
      )
      .join('\n');

    const sessionSummary = sessions
      .map(
        (s) =>
          `Session ${s.id.slice(0, 8)}: ${s.pagesRead} pages, ${s.duration}min, ${s.highlights} highlights, ${s.notes} notes`,
      )
      .join('\n');

    const prompt = `You are a reading companion AI that creates beautiful Memory Books for readers.

Analyze the following reading data for the book "${book.title}" by ${book.author} and extract:

1. **Key Moments** (up to 20): Significant events during the reading journey. Each moment should have:
   - type: one of "realization", "highlight", "note", "conversation", "milestone", "breakthrough", "confusion"
   - content: a 1-2 sentence narrative description of the moment
   - chapterIndex: estimated chapter number (0 if unknown)
   - Use the earliest relevant timestamp from the data for each moment.

2. **Key Insights** (up to 8): Themes and concepts the reader engaged with. Each insight should have:
   - theme: short theme name
   - description: 1-2 sentence description of the insight
   - relatedConcepts: array of related concept/tag names

3. **Title**: A creative, personal title for this Memory Book (e.g., "Journey Through Quantum Mechanics" or "Discovering Stoicism")

ANNOTATIONS:
${annotationSummary || 'None'}

READING SESSIONS:
${sessionSummary || 'None'}

AGENT CONVERSATIONS:
${conversationSummary || 'None'}

Respond ONLY with valid JSON in this exact format:
{
  "title": "string",
  "moments": [{ "type": "string", "content": "string", "timestamp": "ISO date string", "chapterIndex": number }],
  "insights": [{ "theme": "string", "description": "string", "relatedConcepts": ["string"] }]
}`;

    try {
      const raw = await chatCompletion({
        maxTokens: 4096,
        temperature: 0.7,
        system: 'You are a reading companion AI that creates beautiful Memory Books for readers.',
        messages: [{ role: 'user', content: prompt }],
      });

      // Strip markdown code fences if present
      let cleaned = raw.trim();
      const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) {
        cleaned = fenceMatch[1].trim();
      }

      const parsed = JSON.parse(cleaned);

      return {
        title: parsed.title ?? null,
        moments: Array.isArray(parsed.moments) ? parsed.moments.slice(0, 20) : [],
        insights: Array.isArray(parsed.insights) ? parsed.insights.slice(0, 8) : [],
      };
    } catch (error) {
      console.error('[MemoryBookService] LLM generation failed, falling back to local data:', error);
      return this.generateFromLocalData(annotations, sessions, conversations);
    }
  }

  /**
   * Local fallback when Claude API is unavailable — builds moments and
   * insights directly from annotations and sessions without AI.
   */
  private generateFromLocalData(
    annotations: Annotation[],
    sessions: ReadingSession[],
    conversations: AgentConversationMessage[],
  ): {
    moments: MemoryBookMoment[];
    insights: MemoryBookInsight[];
    title: string | null;
  } {
    const moments: MemoryBookMoment[] = [];

    // Convert highlights and notes into moments
    for (const annotation of annotations) {
      moments.push({
        type: annotation.type === 'highlight' ? 'highlight' : 'note',
        content: annotation.note || annotation.content,
        timestamp: annotation.createdAt.toISOString(),
        chapterIndex: annotation.location?.chapterIndex ?? 0,
      });
    }

    // Convert conversation messages into moments
    for (const msg of conversations) {
      moments.push({
        type: 'conversation',
        content: msg.content,
        timestamp: msg.timestamp.toISOString(),
        chapterIndex: 0,
      });
    }

    // Add a milestone for each completed session with notable progress
    for (const session of sessions) {
      if (session.pagesRead > 0) {
        moments.push({
          type: 'milestone',
          content: `Read ${session.pagesRead} pages in this session`,
          timestamp: session.startedAt.toISOString(),
          chapterIndex: 0,
        });
      }
    }

    // Extract insights from tags
    const tagMap = new Map<string, string[]>();
    for (const annotation of annotations) {
      if (annotation.tags) {
        for (const tag of annotation.tags) {
          const existing = tagMap.get(tag) ?? [];
          if (annotation.content) {
            existing.push(annotation.content.slice(0, 100));
          }
          tagMap.set(tag, existing);
        }
      }
    }

    const insights: MemoryBookInsight[] = Array.from(tagMap.entries())
      .slice(0, 8)
      .map(([theme, contents]) => ({
        theme,
        description: `Explored across ${contents.length} annotation${contents.length > 1 ? 's' : ''}`,
        relatedConcepts: [],
      }));

    return { moments, insights, title: null };
  }

  /**
   * Return the existing MemoryBook id for the book+user pair, or undefined.
   */
  private async getExistingId(
    bookId: string,
    userId: string,
  ): Promise<string | undefined> {
    const existing = await MemoryBook.findOne({
      where: { bookId, userId },
      attributes: ['id'],
    });
    return existing?.id;
  }
}

/** Singleton instance for convenient import. */
export const memoryBookService = new MemoryBookService();
