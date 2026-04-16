/**
 * Study Mode Routes — AI-powered active recall during reading
 */

import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { studyModeService } from '../services/StudyModeService';
import { Book } from '../models/Book';
import { notFound } from '../utils/errors';

const router: Router = Router();

/**
 * POST /api/study-mode/objectives
 * Generate learning objectives for a chapter
 */
router.post(
  '/objectives',
  authenticate,
  validate([
    body('bookId').isString(),
    body('chapterIndex').isInt({ min: 0 }),
    body('chapterTitle').isString(),
  ]),
  async (req: AuthRequest, res) => {
    try {
      const { bookId, chapterIndex, chapterTitle } = req.body;

      const objectives = await studyModeService.generateObjectives(
        req.userId!,
        bookId,
        chapterIndex,
        chapterTitle,
      );

      res.json({ success: true, data: objectives });
    } catch (error) {
      console.error('Error generating objectives:', error);
      res.status(500).json({
        success: false,
        error: { code: 'OBJECTIVES_ERROR', message: 'Failed to generate objectives' },
      });
    }
  },
);

/**
 * POST /api/study-mode/concept-checks
 * Generate concept check questions for a chapter
 */
router.post(
  '/concept-checks',
  authenticate,
  validate([
    body('bookId').isString(),
    body('chapterIndex').isInt({ min: 0 }),
    body('chapterTitle').isString(),
    body('chapterContent').isString(),
    body('objectives').isArray(),
  ]),
  async (req: AuthRequest, res) => {
    try {
      const { bookId, chapterIndex, chapterTitle, chapterContent, objectives } = req.body;

      const checks = await studyModeService.generateConceptChecks(
        req.userId!,
        bookId,
        chapterIndex,
        chapterTitle,
        chapterContent,
        objectives,
      );

      res.json({ success: true, data: checks });
    } catch (error) {
      console.error('Error generating concept checks:', error);
      res.status(500).json({
        success: false,
        error: { code: 'CONCEPT_CHECKS_ERROR', message: 'Failed to generate concept checks' },
      });
    }
  },
);

/**
 * POST /api/study-mode/save-checks
 * Save concept checks as flashcards for SM-2 review
 */
router.post(
  '/save-checks',
  authenticate,
  validate([
    body('bookId').isString(),
    body('checks').isArray({ min: 1 }),
  ]),
  async (req: AuthRequest, res) => {
    try {
      const { bookId, checks } = req.body;
      const cards = await studyModeService.saveChecksAsFlashcards(
        req.userId!,
        bookId,
        checks,
      );
      res.json({ success: true, data: { saved: cards.length } });
    } catch (error) {
      console.error('Error saving checks as flashcards:', error);
      res.status(500).json({
        success: false,
        error: { code: 'SAVE_CHECKS_ERROR', message: 'Failed to save concept checks' },
      });
    }
  },
);

/**
 * GET /api/study-mode/mastery/:bookId
 * Get mastery report for a book
 */
router.get(
  '/mastery/:bookId',
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const report = await studyModeService.getMasteryReport(
        req.userId!,
        req.params.bookId,
      );
      res.json({ success: true, data: report });
    } catch (error: any) {
      if (error.message === 'Book not found') {
        return notFound(res, 'Book');
      }
      console.error('Error getting mastery report:', error);
      res.status(500).json({
        success: false,
        error: { code: 'MASTERY_ERROR', message: 'Failed to get mastery report' },
      });
    }
  },
);

export default router;
