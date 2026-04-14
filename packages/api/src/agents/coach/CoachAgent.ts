/**
 * Coach Agent - Reading Skills Improvement
 *
 * The Coach Agent helps readers improve their reading skills and comprehension by:
 * - Generating comprehension questions to test understanding
 * - Building vocabulary through identification and explanation of difficult words
 * - Providing speed reading techniques and tips
 * - Scheduling spaced repetition reviews of key concepts
 * - Tracking reading progress and suggesting improvements
 */

import { chatCompletion, DEFAULT_MODEL } from '../../services/llmClient';
import type { ToolContext } from '../../types';
import { BaseTool } from '../tools/BaseTool';
import { LibrarySearchTool } from '../tools/LibrarySearchTool';
import { sanitizePromptInput, wrapUserContent } from '../../utils/promptSanitizer';

// ============================================================================
// Configuration & Internal Types
// ============================================================================

interface CoachAgentConfig {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

interface CoachMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface CoachContext {
  bookId?: string;
  currentPage?: number;
  selectedText?: string;
  userReadingLevel?: 'beginner' | 'intermediate' | 'advanced';
  readingSpeedWPM?: number;
  sessionDurationMinutes?: number;
}

interface VocabularyWord {
  word: string;
  definition: string;
  partOfSpeech: string;
  example: string;
  difficulty: 'basic' | 'intermediate' | 'advanced';
}

interface ComprehensionQuestion {
  id: string;
  question: string;
  type: 'recall' | 'inference' | 'analysis' | 'evaluation';
  difficulty: 'easy' | 'medium' | 'hard';
  correctAnswer?: string;
  explanation: string;
}

interface ReviewItem {
  concept: string;
  nextReviewDate: Date;
  intervalDays: number;
  repetitionCount: number;
  easeFactor: number;
  source: {
    bookId: string;
    location: string;
  };
}

interface ProgressMetrics {
  booksCompleted: number;
  totalPagesRead: number;
  averageReadingSpeedWPM: number;
  averageComprehensionScore: number;
  vocabularyWordsLearned: number;
  streakDays: number;
  totalReadingTimeMinutes: number;
  topGenres: string[];
  improvementAreas: string[];
}

type CoachAction =
  | 'generate_questions'
  | 'explain_vocabulary'
  | 'review_schedule'
  | 'progress_report'
  | 'reading_tips';

// ============================================================================
// Coach Agent
// ============================================================================

export class CoachAgent {
  private config: Required<CoachAgentConfig>;
  private tools: Map<string, BaseTool>;
  private conversationHistory: Map<string, CoachMessage[]>;

  /** Per-user vocabulary tracking (word -> metadata) */
  private vocabularyTracker: Map<string, Map<string, VocabularyWord>>;

  /** Per-user spaced repetition queue (concept -> review item) */
  private reviewQueue: Map<string, Map<string, ReviewItem>>;

  /** Per-user progress snapshots */
  private progressStore: Map<string, ProgressMetrics>;

  constructor(config: CoachAgentConfig = {}) {
    this.config = {
      model: config.model || DEFAULT_MODEL,
      maxTokens: config.maxTokens || 2048,
      temperature: config.temperature || 0.6,
    };

    this.tools = new Map();
    this.conversationHistory = new Map();
    this.vocabularyTracker = new Map();
    this.reviewQueue = new Map();
    this.progressStore = new Map();

    this.registerTool(new LibrarySearchTool());
  }

  // --------------------------------------------------------------------------
  // Tool Registration
  // --------------------------------------------------------------------------

  registerTool(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
  }

  // --------------------------------------------------------------------------
  // System Prompt
  // --------------------------------------------------------------------------

  private getSystemPrompt(context?: CoachContext): string {
    const readingLevel = context?.userReadingLevel || 'intermediate';
    const speedContext = context?.readingSpeedWPM
      ? `The user's current reading speed is approximately ${context.readingSpeedWPM} WPM.`
      : '';

    return `You are the Coach Agent for read-pal, an AI reading companion application.

## Your Purpose
You help readers improve their reading skills and comprehension through targeted exercises, vocabulary building, speed reading techniques, and spaced repetition reviews.

## Your Responsibilities
- Generate comprehension questions that test different levels of understanding (recall, inference, analysis, evaluation)
- Identify and explain difficult vocabulary words in context
- Provide evidence-based speed reading techniques tailored to the reader's level
- Design spaced repetition schedules for reviewing key concepts
- Track reading progress and suggest specific areas for improvement

## Your Personality
- Encouraging but challenging — you push readers to grow without overwhelming them
- Patient and supportive, especially with struggling readers
- Data-driven — you use concrete metrics to guide recommendations
- Celebrate progress genuinely, no matter how small
- Never condescending or dismissive
- Use humor sparingly to keep sessions engaging

## Coaching Style by Level
- **Beginner**: Focus on basic comprehension and vocabulary. Use simple language. Celebrate small wins frequently.
- **Intermediate**: Introduce inference and analysis questions. Start speed reading tips. Push vocabulary growth.
- **Advanced**: Focus on evaluation and synthesis. Advanced speed techniques. Encourage teaching back concepts.

## Current Reader Context
- Reading level: ${readingLevel}
${speedContext}

## Available Tools
${this.getToolDescriptions()}

## Constraints
- Keep responses under 300 words unless the user asks for a detailed report
- Questions should always relate to the actual text being read
- Vocabulary explanations must include the word used in its original context
- Never give away answers to comprehension questions unless the user asks
- Suggest realistic improvement goals based on current performance
- Respect the reader's time — be efficient and focused

Remember: You are a coach, not a critic. Your job is to make every reader better, one session at a time.`;
  }

  private getToolDescriptions(): string {
    const descriptions: string[] = [];
    for (const tool of this.tools.values()) {
      descriptions.push(`- ${tool.name}: ${tool.description}`);
    }
    return descriptions.join('\n');
  }

  // --------------------------------------------------------------------------
  // Core Chat
  // --------------------------------------------------------------------------

  async chat(
    userId: string,
    message: string,
    context?: CoachContext
  ): Promise<{ response: string; toolsUsed?: string[] }> {
    try {
      const history = this.getOrCreateHistory(userId);
      const messages: { role: 'user' | 'assistant'; content: string }[] = [
        ...history.map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        {
          role: 'user' as const,
          content: this.buildUserMessage(message, context),
        },
      ];

      const toolsUsed: string[] = [];
      let toolResults: string | null = null;

      // Check if library search might add value
      const mightNeedLibrary =
        message.toLowerCase().includes('related') ||
        message.toLowerCase().includes('other books') ||
        message.toLowerCase().includes('what else');

      if (mightNeedLibrary && context?.bookId) {
        const libraryTool = this.tools.get('library_search');
        if (libraryTool) {
          try {
            const result = await libraryTool.execute(
              {
                query: message,
                userId,
                filters: { excludeBookId: context.bookId },
              },
              {} as ToolContext
            );

            if (result.success) {
              toolsUsed.push('library_search');
              const data = result.data as Record<string, unknown> | undefined;
              toolResults = `\n\n[Related content from your library]\n${(data?.summary as string) || ''}`;
            }
          } catch (error) {
            console.error('Coach Agent library search failed:', error);
          }
        }
      }

      const responseText = await chatCompletion({
        model: this.config.model,
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
        system: this.getSystemPrompt(context),
        messages,
      });

      const finalResponse = toolResults
        ? `${responseText}${toolResults}`
        : responseText;

      history.push({ role: 'user', content: message });
      history.push({ role: 'assistant', content: finalResponse });

      if (history.length > 10) {
        history.splice(0, history.length - 10);
      }

      return {
        response: finalResponse,
        toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
      };
    } catch (error) {
      console.error('Coach Agent error:', error);
      return {
        response:
          'I ran into an issue while coaching. Let me try a different approach — could you rephrase your request?',
      };
    }
  }

  // --------------------------------------------------------------------------
  // Action: Generate Comprehension Questions
  // --------------------------------------------------------------------------

  async generateQuestions(
    userId: string,
    text: string,
    options?: {
      count?: number;
      difficulty?: 'easy' | 'medium' | 'hard' | 'mixed';
      types?: ComprehensionQuestion['type'][];
    },
    context?: CoachContext
  ): Promise<{ questions: ComprehensionQuestion[] }> {
    const count = options?.count || 5;
    const difficulty = options?.difficulty || 'mixed';
    const types = options?.types || ['recall', 'inference', 'analysis', 'evaluation'];

    try {
      const prompt = `Generate ${count} reading comprehension questions based on the following text.

Requirements:
- Difficulty level: ${difficulty}
- Question types to include: ${types.join(', ')}
- Each question should test a different aspect of understanding
- Include an explanation for why each question is important
- Number each question

Text:
"""
${sanitizePromptInput(text.substring(0, 4000), 'Text for Questions')}
"""

Respond in this exact JSON format (no markdown, no code fences):
[
  {
    "id": "q1",
    "question": "the question text",
    "type": "recall|inference|analysis|evaluation",
    "difficulty": "easy|medium|hard",
    "correctAnswer": "the expected answer",
    "explanation": "why this question matters and what it tests"
  }
]`;

      const raw = await chatCompletion({
        model: this.config.model,
        maxTokens: this.config.maxTokens,
        temperature: 0.4,
        system: this.getSystemPrompt(context),
        messages: [{ role: 'user', content: prompt }],
      });

      const questions = this.parseJsonResponse<ComprehensionQuestion[]>(raw, []);

      return { questions };
    } catch (error) {
      console.error('Coach Agent generateQuestions error:', error);
      return {
        questions: [
          {
            id: 'fallback-1',
            question: 'Can you summarize the main idea of this passage in your own words?',
            type: 'recall',
            difficulty: 'easy',
            explanation: 'Summarizing helps verify basic comprehension.',
          },
        ],
      };
    }
  }

  // --------------------------------------------------------------------------
  // Action: Explain Vocabulary
  // --------------------------------------------------------------------------

  async explainVocabulary(
    userId: string,
    text: string,
    options?: {
      maxWords?: number;
      difficulty?: VocabularyWord['difficulty'];
    },
    context?: CoachContext
  ): Promise<{ words: VocabularyWord[] }> {
    const maxWords = options?.maxWords || 5;
    const difficulty = options?.difficulty;

    try {
      const prompt = `Identify up to ${maxWords} difficult or noteworthy vocabulary words from the following text.

${difficulty ? `Focus on ${difficulty}-level words.` : 'Include a mix of difficulty levels.'}

For each word:
1. Provide a clear, concise definition appropriate for a reader
2. State the part of speech as used in the text
3. Give an example sentence using the word in a different context
4. Rate the difficulty level

Text:
"""
${sanitizePromptInput(text.substring(0, 4000), 'Text for Vocabulary')}
"""

Respond in this exact JSON format (no markdown, no code fences):
[
  {
    "word": "the word",
    "definition": "clear definition",
    "partOfSpeech": "noun|verb|adjective|adverb|etc.",
    "example": "example sentence using the word differently",
    "difficulty": "basic|intermediate|advanced"
  }
]`;

      const raw = await chatCompletion({
        model: this.config.model,
        maxTokens: this.config.maxTokens,
        temperature: 0.3,
        system: this.getSystemPrompt(context),
        messages: [{ role: 'user', content: prompt }],
      });

      const words = this.parseJsonResponse<VocabularyWord[]>(raw, []);

      // Track vocabulary for this user
      this.trackVocabulary(userId, words);

      return { words };
    } catch (error) {
      console.error('Coach Agent explainVocabulary error:', error);
      return { words: [] };
    }
  }

  // --------------------------------------------------------------------------
  // Action: Review Schedule (Spaced Repetition)
  // --------------------------------------------------------------------------

  async getReviewSchedule(
    userId: string,
    options?: {
      daysAhead?: number;
      maxItems?: number;
    }
  ): Promise<{
    schedule: ReviewItem[];
    summary: string;
  }> {
    const daysAhead = options?.daysAhead || 7;
    const maxItems = options?.maxItems || 20;

    try {
      const userQueue = this.reviewQueue.get(userId);
      if (!userQueue || userQueue.size === 0) {
        return {
          schedule: [],
          summary:
            'No review items yet. Start reading and highlighting key concepts to build your review schedule.',
        };
      }

      const now = new Date();
      const cutoff = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

      const dueItems: ReviewItem[] = [];

      for (const item of userQueue.values()) {
        if (item.nextReviewDate <= cutoff) {
          dueItems.push(item);
        }
        if (dueItems.length >= maxItems) {
          break;
        }
      }

      // Sort by review date ascending (soonest first)
      dueItems.sort(
        (a, b) => a.nextReviewDate.getTime() - b.nextReviewDate.getTime()
      );

      const overdue = dueItems.filter((i) => i.nextReviewDate <= now).length;
      const dueToday = dueItems.filter((i) => {
        const d = i.nextReviewDate;
        return (
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth() &&
          d.getDate() === now.getDate()
        );
      }).length;

      const summaryParts: string[] = [];
      if (overdue > 0) {
        summaryParts.push(`${overdue} item${overdue > 1 ? 's are' : ' is'} overdue`);
      }
      if (dueToday > 0) {
        summaryParts.push(`${dueToday} item${dueToday > 1 ? 's' : ''} due today`);
      }
      summaryParts.push(`${dueItems.length} total item${dueItems.length !== 1 ? 's' : ''} in the next ${daysAhead} days`);

      return {
        schedule: dueItems,
        summary: summaryParts.join('. ') + '.',
      };
    } catch (error) {
      console.error('Coach Agent getReviewSchedule error:', error);
      return {
        schedule: [],
        summary: 'Unable to retrieve your review schedule right now.',
      };
    }
  }

  /**
   * Add a concept to the user's spaced repetition schedule.
   * Uses a simplified SM-2 algorithm for interval calculation.
   */
  addReviewItem(
    userId: string,
    concept: string,
    source: { bookId: string; location: string }
  ): void {
    let userQueue = this.reviewQueue.get(userId);
    if (!userQueue) {
      userQueue = new Map();
      this.reviewQueue.set(userId, userQueue);
    }

    const now = new Date();
    const initialInterval = 1; // 1 day for first review

    const item: ReviewItem = {
      concept,
      nextReviewDate: new Date(now.getTime() + initialInterval * 24 * 60 * 60 * 1000),
      intervalDays: initialInterval,
      repetitionCount: 0,
      easeFactor: 2.5,
      source,
    };

    userQueue.set(concept, item);
  }

  /**
   * Process a review result (correct/incorrect) and update the schedule.
   */
  processReviewResult(
    userId: string,
    concept: string,
    quality: number // 0-5 scale (0 = complete failure, 5 = perfect)
  ): ReviewItem | null {
    const userQueue = this.reviewQueue.get(userId);
    if (!userQueue) {
      return null;
    }

    const item = userQueue.get(concept);
    if (!item) {
      return null;
    }

    // SM-2 algorithm adaptation
    let { easeFactor, intervalDays, repetitionCount } = item;

    if (quality >= 3) {
      // Correct response
      if (repetitionCount === 0) {
        intervalDays = 1;
      } else if (repetitionCount === 1) {
        intervalDays = 6;
      } else {
        intervalDays = Math.round(intervalDays * easeFactor);
      }
      repetitionCount += 1;
    } else {
      // Incorrect response — reset
      repetitionCount = 0;
      intervalDays = 1;
    }

    // Update ease factor
    easeFactor = Math.max(
      1.3,
      easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    );

    const updatedItem: ReviewItem = {
      ...item,
      easeFactor,
      intervalDays,
      repetitionCount,
      nextReviewDate: new Date(
        Date.now() + intervalDays * 24 * 60 * 60 * 1000
      ),
    };

    userQueue.set(concept, updatedItem);
    return updatedItem;
  }

  // --------------------------------------------------------------------------
  // Action: Progress Report
  // --------------------------------------------------------------------------

  async getProgressReport(
    userId: string,
    options?: {
      period?: 'week' | 'month' | 'all';
    }
  ): Promise<{
    metrics: ProgressMetrics;
    recommendations: string[];
  }> {
    const period = options?.period || 'month';

    try {
      const metrics = this.progressStore.get(userId) || this.getDefaultMetrics();

      // Generate recommendations via Claude
      const prompt = `Based on the following reading metrics, provide 3-5 specific, actionable recommendations for improvement.

Reading metrics (period: ${period}):
- Books completed: ${metrics.booksCompleted}
- Total pages read: ${metrics.totalPagesRead}
- Average reading speed: ${metrics.averageReadingSpeedWPM} WPM
- Average comprehension score: ${metrics.averageComprehensionScore}%
- Vocabulary words learned: ${metrics.vocabularyWordsLearned}
- Reading streak: ${metrics.streakDays} days
- Total reading time: ${metrics.totalReadingTimeMinutes} minutes
- Top genres: ${metrics.topGenres.join(', ') || 'N/A'}
- Current improvement areas: ${metrics.improvementAreas.join(', ') || 'None identified'}

Respond in this exact JSON format (no markdown, no code fences):
[
  "Recommendation 1",
  "Recommendation 2",
  "Recommendation 3"
]`;

      const raw = await chatCompletion({
        model: this.config.model,
        maxTokens: 1024,
        temperature: 0.5,
        system: this.getSystemPrompt(),
        messages: [{ role: 'user', content: prompt }],
      });

      const recommendations = this.parseJsonResponse<string[]>(raw, [
        'Keep up your reading streak — consistency is key.',
        'Try increasing your reading speed by 10 WPM next week.',
        'Review your vocabulary words to reinforce retention.',
      ]);

      return { metrics, recommendations };
    } catch (error) {
      console.error('Coach Agent getProgressReport error:', error);
      return {
        metrics: this.getDefaultMetrics(),
        recommendations: ['Unable to generate recommendations right now.'],
      };
    }
  }

  /**
   * Update the stored progress metrics for a user.
   */
  updateProgress(userId: string, updates: Partial<ProgressMetrics>): void {
    const current = this.progressStore.get(userId) || this.getDefaultMetrics();
    this.progressStore.set(userId, { ...current, ...updates });
  }

  // --------------------------------------------------------------------------
  // Action: Reading Tips
  // --------------------------------------------------------------------------

  async getReadingTips(
    userId: string,
    options?: {
      focus?: 'speed' | 'comprehension' | 'retention' | 'focus' | 'general';
      readingLevel?: CoachContext['userReadingLevel'];
    },
    context?: CoachContext
  ): Promise<{
    tips: string[];
    exercises: string[];
  }> {
    const focus = options?.focus || 'general';
    const readingLevel = options?.readingLevel || context?.userReadingLevel || 'intermediate';

    try {
      const prompt = `Provide 3 practical reading tips and 1 short exercise for a ${readingLevel}-level reader.

Focus area: ${focus}

The tips should be:
- Specific and actionable (not generic advice)
- Appropriate for the reader's level
- Evidence-based where possible
- Presented in a friendly, encouraging tone

The exercise should:
- Take no more than 5 minutes
- Be doable during or right after a reading session
- Directly relate to the focus area

Respond in this exact JSON format (no markdown, no code fences):
{
  "tips": [
    "Tip 1",
    "Tip 2",
    "Tip 3"
  ],
  "exercises": [
    "Exercise description"
  ]
}`;

      const raw = await chatCompletion({
        model: this.config.model,
        maxTokens: 1024,
        temperature: 0.6,
        system: this.getSystemPrompt(context),
        messages: [{ role: 'user', content: prompt }],
      });

      type TipsResponse = { tips: string[]; exercises: string[] };

      const parsed = this.parseJsonResponse<TipsResponse>(raw, {
        tips: [],
        exercises: [],
      });

      return {
        tips: parsed.tips || [],
        exercises: parsed.exercises || [],
      };
    } catch (error) {
      console.error('Coach Agent getReadingTips error:', error);
      return {
        tips: [
          'Try using a pointer (finger or pen) to guide your eyes while reading.',
          'Set a specific reading goal before each session.',
          'Take a brief pause after each paragraph to mentally summarize.',
        ],
        exercises: [
          'Read the next page at your normal speed, then close the book and write down everything you remember.',
        ],
      };
    }
  }

  // --------------------------------------------------------------------------
  // Action Dispatcher
  // --------------------------------------------------------------------------

  async executeAction(
    userId: string,
    action: CoachAction,
    input: {
      text?: string;
      context?: CoachContext;
      options?: Record<string, unknown>;
    }
  ): Promise<unknown> {
    switch (action) {
      case 'generate_questions': {
        if (!input.text) {
          return {
            success: false,
            error: {
              code: 'MISSING_TEXT',
              message: 'Text is required for generating comprehension questions.',
              recoverable: true,
            },
          };
        }
        const { questions } = await this.generateQuestions(
          userId,
          input.text,
          input.options as {
            count?: number;
            difficulty?: 'easy' | 'medium' | 'hard' | 'mixed';
            types?: ComprehensionQuestion['type'][];
          } | undefined,
          input.context
        );
        return { success: true, questions };
      }

      case 'explain_vocabulary': {
        if (!input.text) {
          return {
            success: false,
            error: {
              code: 'MISSING_TEXT',
              message: 'Text is required for vocabulary explanation.',
              recoverable: true,
            },
          };
        }
        const { words } = await this.explainVocabulary(
          userId,
          input.text,
          input.options as {
            maxWords?: number;
            difficulty?: VocabularyWord['difficulty'];
          } | undefined,
          input.context
        );
        return { success: true, words };
      }

      case 'review_schedule': {
        const result = await this.getReviewSchedule(
          userId,
          input.options as { daysAhead?: number; maxItems?: number } | undefined
        );
        return { success: true, ...result };
      }

      case 'progress_report': {
        const result = await this.getProgressReport(
          userId,
          input.options as { period?: 'week' | 'month' | 'all' } | undefined
        );
        return { success: true, ...result };
      }

      case 'reading_tips': {
        const result = await this.getReadingTips(
          userId,
          input.options as {
            focus?: 'speed' | 'comprehension' | 'retention' | 'focus' | 'general';
            readingLevel?: CoachContext['userReadingLevel'];
          } | undefined,
          input.context
        );
        return { success: true, ...result };
      }

      default:
        return {
          success: false,
          error: {
            code: 'UNKNOWN_ACTION',
            message: `Unknown action: ${action}. Supported actions: generate_questions, explain_vocabulary, review_schedule, progress_report, reading_tips`,
            recoverable: true,
          },
        };
    }
  }

  // --------------------------------------------------------------------------
  // History Management
  // --------------------------------------------------------------------------

  clearHistory(userId: string): void {
    this.conversationHistory.delete(userId);
  }

  getHistory(userId: string): CoachMessage[] {
    return this.conversationHistory.get(userId) || [];
  }

  // --------------------------------------------------------------------------
  // Internal Helpers
  // --------------------------------------------------------------------------

  private getOrCreateHistory(userId: string): CoachMessage[] {
    let history = this.conversationHistory.get(userId);
    if (!history) {
      history = [];
      this.conversationHistory.set(userId, history);
    }
    return history;
  }

  private buildUserMessage(message: string, context?: CoachContext): string {
    let result = sanitizePromptInput(message, 'User Message');

    if (context) {
      const parts: string[] = [];

      if (context.selectedText) {
        parts.push(`Selected text: "${sanitizePromptInput(context.selectedText, 'Selected Text')}"`);
      }

      if (context.currentPage !== undefined) {
        parts.push(`Current page: ${context.currentPage + 1}`);
      }

      if (context.userReadingLevel) {
        parts.push(`Reading level: ${context.userReadingLevel}`);
      }

      if (context.readingSpeedWPM !== undefined) {
        parts.push(`Reading speed: ${context.readingSpeedWPM} WPM`);
      }

      if (context.sessionDurationMinutes !== undefined) {
        parts.push(`Session duration: ${context.sessionDurationMinutes} minutes`);
      }

      if (parts.length > 0) {
        result = `[Context: ${parts.join(', ')}]\n\n${result}`;
      }
    }

    return result;
  }

  private trackVocabulary(userId: string, words: VocabularyWord[]): void {
    let userVocab = this.vocabularyTracker.get(userId);
    if (!userVocab) {
      userVocab = new Map();
      this.vocabularyTracker.set(userId, userVocab);
    }

    for (const word of words) {
      userVocab.set(word.word.toLowerCase(), word);
    }
  }

  private getDefaultMetrics(): ProgressMetrics {
    return {
      booksCompleted: 0,
      totalPagesRead: 0,
      averageReadingSpeedWPM: 0,
      averageComprehensionScore: 0,
      vocabularyWordsLearned: 0,
      streakDays: 0,
      totalReadingTimeMinutes: 0,
      topGenres: [],
      improvementAreas: [],
    };
  }

  /**
   * Safely parse a JSON response from Claude, stripping markdown fences if present.
   * Returns the fallback value if parsing fails.
   */
  private parseJsonResponse<T>(raw: string, fallback: T): T {
    try {
      // Strip markdown code fences if present
      let cleaned = raw.trim();
      if (cleaned.startsWith('```')) {
        const firstNewline = cleaned.indexOf('\n');
        if (firstNewline !== -1) {
          cleaned = cleaned.slice(firstNewline + 1);
        }
        if (cleaned.endsWith('```')) {
          cleaned = cleaned.slice(0, -3);
        }
        cleaned = cleaned.trim();
      }

      return JSON.parse(cleaned) as T;
    } catch {
      return fallback;
    }
  }
}
