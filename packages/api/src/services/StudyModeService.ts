/**
 * Study Mode Service — AI-powered active recall during reading
 *
 * Generates chapter objectives, concept checks, and tracks mastery
 * using the existing Flashcard SM-2 system.
 */

import { chatCompletion } from '@/services/llmClient';
import { Annotation } from '@/models/Annotation';
import { Flashcard } from '@/models/Flashcard';
import { Book } from '@/models/Book';
import { Op } from 'sequelize';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChapterObjective {
  id: string;
  text: string;
  completed: boolean;
}

export interface ConceptCheck {
  id: string;
  question: string;
  hint: string;
  answer: string;
  position: 'start' | 'middle' | 'end';
  annotationId?: string;
}

export interface ChapterStudyData {
  objectives: ChapterObjective[];
  conceptChecks: ConceptCheck[];
  masteryScore: number; // 0–1
}

export interface MasteryReport {
  bookId: string;
  chaptersCompleted: number;
  totalChapters: number;
  overallMastery: number;
  weakAreas: string[];
  strongAreas: string[];
  cardsDue: number;
}

// ---------------------------------------------------------------------------
// GLM Prompt Helpers
// ---------------------------------------------------------------------------

const OBJECTIVES_PROMPT = `You are an expert study coach. Given a chapter title and key highlights/notes from a student's reading, generate 3-5 clear, actionable learning objectives.

Format as a JSON array of strings. Each objective should:
- Start with a verb (Understand, Explain, Apply, Compare, Analyze)
- Be specific and testable
- Be achievable within one chapter

Return ONLY the JSON array, no other text.`;

const CONCEPT_CHECKS_PROMPT = `You are an expert study coach creating active recall checks. Given a chapter's content and learning objectives, generate 3 concept check questions.

Each check should:
- Test understanding, not memorization
- Have a concise answer (1-3 sentences)
- Include a hint that guides without giving away the answer

Return a JSON array of objects with: { "question": string, "hint": string, "answer": string, "position": "start"|"middle"|"end" }

Return ONLY the JSON array, no other text.`;

// ---------------------------------------------------------------------------
// Core Service
// ---------------------------------------------------------------------------

export class StudyModeService {
  /**
   * Generate learning objectives for a specific chapter based on
   * the user's highlights and notes.
   */
  async generateObjectives(
    userId: string,
    bookId: string,
    chapterIndex: number,
    chapterTitle: string,
  ): Promise<ChapterObjective[]> {
    // Fetch user's annotations for this chapter
    const annotations = await Annotation.findAll({
      where: {
        userId,
        bookId,
        type: { [Op.in]: ['highlight', 'note'] },
      },
      limit: 30,
      order: [['createdAt', 'DESC']],
    });

    const chapterAnnotations = annotations.filter((a) => {
      const loc = (a as any).location as any;
      return loc?.pageIndex === chapterIndex;
    });

    const contentForLLM = chapterAnnotations.length > 0
      ? chapterAnnotations.map((a) => {
          const note = (a as any).note;
          return note ? `${(a as any).content}\n(Note: ${note})` : (a as any).content;
        }).join('\n')
      : '(No highlights or notes yet for this chapter)';

    const response = await chatCompletion({
      system: OBJECTIVES_PROMPT,
      messages: [{
        role: 'user',
        content: `Chapter: "${chapterTitle}"\n\nStudent's highlights & notes:\n${contentForLLM}`,
      }],
      temperature: 0.5,
      maxTokens: 500,
    });

    try {
      const raw = JSON.parse(response);
      const objectives: string[] = Array.isArray(raw) ? raw : [];
      return objectives.map((text, i) => ({
        id: `obj-${chapterIndex}-${i}`,
        text,
        completed: false,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Generate concept check questions for a chapter based on
   * content and learning objectives.
   */
  async generateConceptChecks(
    userId: string,
    bookId: string,
    chapterIndex: number,
    chapterTitle: string,
    chapterContent: string,
    objectives: string[],
  ): Promise<ConceptCheck[]> {
    // Truncate content for LLM context
    const truncated = chapterContent.slice(0, 4000);

    const response = await chatCompletion({
      system: CONCEPT_CHECKS_PROMPT,
      messages: [{
        role: 'user',
        content: `Chapter: "${chapterTitle}"\n\nObjectives:\n${objectives.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n\nContent excerpt:\n${truncated}`,
      }],
      temperature: 0.6,
      maxTokens: 600,
    });

    try {
      const raw = JSON.parse(response);
      const checks = Array.isArray(raw) ? raw : [];
      return checks.map((c: any, i: number) => ({
        id: `check-${chapterIndex}-${i}`,
        question: c.question || '',
        hint: c.hint || '',
        answer: c.answer || '',
        position: (c.position || ['start', 'middle', 'end'][i % 3]) as ConceptCheck['position'],
      }));
    } catch {
      return [];
    }
  }

  /**
   * Convert concept checks into flashcards for SM-2 spaced repetition.
   * Called when a user answers a concept check (to reinforce learning).
   */
  async saveChecksAsFlashcards(
    userId: string,
    bookId: string,
    checks: ConceptCheck[],
  ): Promise<Flashcard[]> {
    const cards = checks.map((check) => ({
      userId,
      bookId,
      question: check.question,
      answer: check.answer,
      easeFactor: 2.5,
      interval: 0,
      repetitionCount: 0,
      nextReviewAt: new Date(),
    }));

    return Flashcard.bulkCreate(cards) as Promise<Flashcard[]>;
  }

  /**
   * Get mastery report for a book — aggregates SM-2 data
   * and study progress.
   */
  async getMasteryReport(userId: string, bookId: string): Promise<MasteryReport> {
    const book = await Book.findOne({ where: { id: bookId, userId } });
    if (!book) {
      throw new Error('Book not found');
    }

    const totalChapters = (book as any).totalPages || 1;
    const currentChapter = (book as any).currentPage || 0;

    // Get flashcard mastery stats
    const cards = await Flashcard.findAll({
      where: { userId, bookId },
    });

    const now = new Date();
    const mastered = cards.filter((c) => (c as any).easeFactor >= 2.8 && (c as any).interval >= 7).length;
    const learning = cards.filter((c) => (c as any).repetitionCount > 0 && (c as any).easeFactor < 2.8).length;
    const due = cards.filter((c) => new Date((c as any).nextReviewAt) <= now).length;

    // Calculate overall mastery (0-1)
    const totalCards = cards.length || 1;
    const masteryScore = cards.length > 0
      ? (mastered * 1 + learning * 0.5) / totalCards
      : 0;

    // Identify weak/strong areas from card performance
    const weakCards = cards
      .filter((c) => (c as any).easeFactor < 2.3)
      .map((c) => (c as any).question);
    const strongCards = cards
      .filter((c) => (c as any).easeFactor >= 2.8)
      .map((c) => (c as any).question);

    return {
      bookId,
      chaptersCompleted: currentChapter + 1,
      totalChapters,
      overallMastery: Math.round(masteryScore * 100) / 100,
      weakAreas: weakCards.slice(0, 5),
      strongAreas: strongCards.slice(0, 5),
      cardsDue: due,
    };
  }
}

export const studyModeService = new StudyModeService();
