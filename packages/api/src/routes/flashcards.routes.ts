/**
 * Flashcard Routes
 *
 * AI-powered flashcard generation from reading highlights,
 * with SM-2 spaced repetition for review scheduling.
 */

import { Router } from 'express';
import { body, query, param } from 'express-validator';
import { AuthRequest, authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { agentRateLimiter, rateLimiter } from '../middleware/rateLimiter';
import { Flashcard, calculateSM2 } from '../models/Flashcard';
import { Annotation } from '../models/Annotation';
import { Book } from '../models/Book';
import { chatCompletion } from '../services/llmClient';
import { sanitizePromptInput, wrapUserContent } from '../utils/promptSanitizer';
import { dispatchWebhook } from '../services/WebhookDelivery';

const router: Router = Router();

interface GeneratedCard {
  question: string;
  answer: string;
  annotationId?: string;
}

/**
 * @route   POST /api/flashcards/generate
 * @desc    Generate flashcards from annotations using AI
 * @access  Private
 */
router.post(
  '/generate',
  authenticate,
  agentRateLimiter,
  validate([
    body('bookId').isUUID().withMessage('bookId is required'),
    body('annotationIds').optional().isArray().withMessage('annotationIds must be an array'),
    body('count').optional().isInt({ min: 1, max: 20 }).withMessage('count must be 1-20'),
  ]),
  async (req: AuthRequest, res) => {
    try {
      const { bookId, annotationIds, count = 5 } = req.body;
      const userId = req.user!.id;

      // Fetch annotations — either specific ones or the most recent highlights/notes
      let annotations: Annotation[] = [];
      if (annotationIds && annotationIds.length > 0) {
        annotations = await Annotation.findAll({
          where: {
            id: annotationIds,
            userId,
            bookId,
            type: ['highlight', 'note'],
          },
          limit: 20,
        });
      } else {
        annotations = await Annotation.findAll({
          where: { userId, bookId, type: ['highlight', 'note'] },
          order: [['createdAt', 'DESC']],
          limit: 15,
        });
      }

      if (annotations.length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'NO_ANNOTATIONS', message: 'No highlights or notes found to generate flashcards from' },
        });
      }

      // Build prompt for AI to generate Q&A pairs
      const annotationTexts = annotations
        .map((a, i) => `[${i + 1}] ${a.type === 'note' ? '(Note) ' : ''}${sanitizePromptInput(a.content.slice(0, 300), `Annotation ${i + 1}`)}${a.note ? ` — User note: ${sanitizePromptInput(a.note.slice(0, 200), `Note ${i + 1}`)}` : ''}`)
        .join('\n');

      const prompt = `Generate ${count} flashcard Q&A pairs from these reading highlights/notes.
Each card should test understanding of a key concept, fact, or idea from the text.

Passages:
${wrapUserContent(annotationTexts, 'Passages')}

Return ONLY a JSON array of objects with "question" and "answer" fields. Each answer should be concise (1-3 sentences).
Example: [{"question": "What is...?", "answer": "It is..."}]
No markdown, no code fences, just the JSON array.`;

      const raw = await chatCompletion({
        system: 'You are a study assistant that creates effective flashcards from reading material. Generate clear, testable questions with concise answers. Return valid JSON only.',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.6,
        maxTokens: 800,
      });

      // Parse AI response
      let cards: GeneratedCard[] = [];
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          cards = parsed
            .filter((c: { question?: string; answer?: string }) => c.question && c.answer)
            .slice(0, count)
            .map((c: { question: string; answer: string }, i: number) => ({
              question: String(c.question).slice(0, 500),
              answer: String(c.answer).slice(0, 1000),
              annotationId: annotations[i]?.id,
            }));
        }
      } catch {
        // Fallback: try to extract Q&A from numbered lines
        const qaPairs = raw.match(/(?:Q|Question)\s*\d*[:.]\s*(.+?)[\n\r]+(?:A|Answer)\s*\d*[:.]\s*(.+?)(?=(?:Q|Question)\s*\d*|$)/gis);
        if (qaPairs) {
          cards = qaPairs.slice(0, count).map(() => ({
            question: 'Generated question',
            answer: 'Generated answer',
          }));
        }
      }

      if (cards.length === 0) {
        return res.status(500).json({
          success: false,
          error: { code: 'GENERATION_FAILED', message: 'Failed to generate flashcards. Please try again.' },
        });
      }

      // Create flashcard records — all due now (nextReviewAt = now)
      const flashcards = await Flashcard.bulkCreate(
        cards.map((card) => ({
          userId,
          bookId,
          annotationId: card.annotationId || undefined,
          question: card.question,
          answer: card.answer,
          easeFactor: 2.5,
          interval: 0,
          repetitionCount: 0,
          nextReviewAt: new Date(),
        })),
      );

      // Fire-and-forget webhook dispatch
      dispatchWebhook(userId, 'flashcard.created', {
        bookId,
        count: flashcards.length,
        flashcardIds: flashcards.map((f) => f.id),
      }).catch(() => {});

      return res.json({
        success: true,
        data: {
          generated: flashcards.length,
          flashcards: flashcards.map((f) => ({
            id: f.id,
            question: f.question,
            answer: f.answer,
            bookId: f.bookId,
            nextReviewAt: f.nextReviewAt,
          })),
        },
      });
    } catch (error) {
      console.error('Flashcard generation error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'GENERATION_ERROR', message: 'Failed to generate flashcards' },
      });
    }
  },
);

/**
 * @route   GET /api/flashcards/review
 * @desc    Get flashcards due for review
 * @access  Private
 */
router.get(
  '/review',
  authenticate,
  validate([
    query('bookId').optional().isUUID(),
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  ]),
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const bookId = req.query.bookId as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 10, 50);

      const where: Record<string, unknown> = {
        userId,
        nextReviewAt: { $lte: new Date() } as unknown as Date,
      };
      if (bookId) where.bookId = bookId;

      const flashcards = await Flashcard.findAll({
        where,
        order: [['nextReviewAt', 'ASC']],
        limit,
        include: [{ model: Book, as: 'book', attributes: ['id', 'title', 'author'] }],
      });

      // Get stats
      const totalCards = await Flashcard.count({ where: { userId } });
      const dueCards = await Flashcard.count({
        where: { userId, nextReviewAt: { $lte: new Date() } as unknown as Date },
      });

      return res.json({
        success: true,
        data: {
          flashcards: flashcards.map((f) => ({
            id: f.id,
            question: f.question,
            answer: f.answer,
            bookId: f.bookId,
            bookTitle: (f as unknown as { book?: { title?: string } }).book?.title || '',
            repetitionCount: f.repetitionCount,
            nextReviewAt: f.nextReviewAt,
          })),
          stats: {
            total: totalCards,
            due: dueCards,
            reviewed: totalCards - dueCards,
          },
        },
      });
    } catch (error) {
      console.error('Flashcard review fetch error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'FETCH_ERROR', message: 'Failed to fetch review cards' },
      });
    }
  },
);

/**
 * @route   POST /api/flashcards/:id/review
 * @desc    Submit a review for a flashcard (SM-2 update)
 * @access  Private
 */
router.post(
  '/:id/review',
  authenticate,
  validate([
    param('id').isUUID(),
    body('rating').isInt({ min: 0, max: 5 }).withMessage('Rating must be 0-5'),
  ]),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { rating } = req.body as { rating: number };
      const userId = req.user!.id;

      const card = await Flashcard.findOne({ where: { id, userId } });
      if (!card) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Flashcard not found' },
        });
      }

      // Apply SM-2 algorithm
      const sm2Result = calculateSM2(
        card.easeFactor,
        card.interval,
        card.repetitionCount,
        rating as 0 | 1 | 2 | 3 | 4 | 5,
      );

      // Calculate next review date
      const nextReview = new Date();
      nextReview.setDate(nextReview.getDate() + sm2Result.interval);

      await card.update({
        easeFactor: sm2Result.easeFactor,
        interval: sm2Result.interval,
        repetitionCount: sm2Result.repetitionCount,
        nextReviewAt: nextReview,
        lastReviewAt: new Date(),
        lastRating: rating as 0 | 1 | 2 | 3 | 4 | 5,
      });

      // Fire-and-forget webhook dispatch
      dispatchWebhook(userId, 'flashcard.reviewed', {
        flashcardId: card.id,
        bookId: card.bookId,
        rating,
        interval: sm2Result.interval,
        repetitionCount: sm2Result.repetitionCount,
      }).catch(() => {});

      return res.json({
        success: true,
        data: {
          id: card.id,
          interval: sm2Result.interval,
          easeFactor: sm2Result.easeFactor,
          repetitionCount: sm2Result.repetitionCount,
          nextReviewAt: nextReview,
        },
      });
    } catch (error) {
      console.error('Flashcard review error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'REVIEW_ERROR', message: 'Failed to record review' },
      });
    }
  },
);

/**
 * @route   GET /api/flashcards
 * @desc    List all flashcards for a book
 * @access  Private
 */
router.get(
  '/',
  authenticate,
  validate([
    query('bookId').optional().isUUID(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ]),
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const bookId = req.query.bookId as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);

      const where: Record<string, unknown> = { userId };
      if (bookId) where.bookId = bookId;

      const flashcards = await Flashcard.findAll({
        where,
        order: [['createdAt', 'DESC']],
        limit,
        include: [{ model: Book, as: 'book', attributes: ['id', 'title', 'author'] }],
      });

      return res.json({
        success: true,
        data: flashcards.map((f) => ({
          id: f.id,
          question: f.question,
          answer: f.answer,
          bookId: f.bookId,
          bookTitle: (f as unknown as { book?: { title?: string } }).book?.title || '',
          annotationId: f.annotationId,
          repetitionCount: f.repetitionCount,
          easeFactor: f.easeFactor,
          interval: f.interval,
          nextReviewAt: f.nextReviewAt,
          lastReviewAt: f.lastReviewAt,
          createdAt: f.createdAt,
        })),
      });
    } catch (error) {
      console.error('Flashcard list error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'LIST_ERROR', message: 'Failed to list flashcards' },
      });
    }
  },
);

/**
 * @route   GET /api/flashcards/decks
 * @desc    Get flashcard counts grouped by book (deck overview)
 * @access  Private
 */
router.get(
  '/decks',
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;

      const flashcards = await Flashcard.findAll({
        where: { userId },
        attributes: ['bookId', 'nextReviewAt'],
        include: [{ model: Book, as: 'book', attributes: ['id', 'title', 'author', 'coverUrl'] }],
      });

      // Group by book
      const deckMap = new Map<string, {
        bookId: string;
        bookTitle: string;
        author: string;
        coverUrl?: string;
        total: number;
        due: number;
      }>();

      for (const f of flashcards) {
        const book = (f as unknown as { book?: { id?: string; title?: string; author?: string; coverUrl?: string } }).book;
        const bId = f.bookId;
        if (!deckMap.has(bId)) {
          deckMap.set(bId, {
            bookId: bId,
            bookTitle: book?.title || 'Unknown Book',
            author: book?.author || '',
            coverUrl: book?.coverUrl,
            total: 0,
            due: 0,
          });
        }
        const deck = deckMap.get(bId)!;
        deck.total++;
        if (new Date(f.nextReviewAt) <= new Date()) deck.due++;
      }

      const decks = Array.from(deckMap.values());

      return res.json({
        success: true,
        data: {
          decks,
          totalCards: flashcards.length,
          totalDue: flashcards.filter((f) => new Date(f.nextReviewAt) <= new Date()).length,
        },
      });
    } catch (error) {
      console.error('Flashcard decks error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'DECKS_ERROR', message: 'Failed to get flashcard decks' },
      });
    }
  },
);

/**
 * @route   DELETE /api/flashcards/:id
 * @desc    Delete a flashcard
 * @access  Private
 */
router.delete(
  '/:id',
  authenticate,
  validate([param('id').isUUID()]),
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const deleted = await Flashcard.destroy({ where: { id: req.params.id, userId } });

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Flashcard not found' },
        });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error('Flashcard delete error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'DELETE_ERROR', message: 'Failed to delete flashcard' },
      });
    }
  },
);

export default router;
