/**
 * Intervention Routes
 *
 * Endpoints for checking whether a proactive agent intervention
 * is warranted based on the reader's current behavior, and for
 * collecting user feedback on interventions.
 */

import { Router } from 'express';
import { ReadingSession, Book } from '../models';
import { AuthRequest, authenticate } from '../middleware/auth';
import { InterventionService, ReadingContext } from '../services/InterventionService';

const router: Router = Router();

// POST /api/interventions/check - Check if an intervention is needed
router.post('/check', authenticate, async (req: AuthRequest, res) => {
  try {
    const { bookId, currentPage, totalPages, wordsPerMinute, timeOnPage, reReadCount, highlightCount } = req.body;

    // Get current active session duration
    const activeSession = await ReadingSession.findOne({
      where: { userId: req.userId, bookId, isActive: true },
    });

    const sessionDuration = activeSession
      ? Math.round((Date.now() - new Date(activeSession.startedAt).getTime()) / 1000)
      : 0;

    const ctx: ReadingContext = {
      userId: req.userId!,
      bookId,
      currentPage: currentPage || 0,
      totalPages: totalPages || 0,
      wordsPerMinute,
      timeOnPage,
      reReadCount,
      highlightCount: highlightCount || 0,
      sessionDuration,
    };

    // Get chapter boundaries from book if available
    const book = await Book.findByPk(bookId);
    const chapterPages = (book?.metadata as Record<string, unknown> | undefined)?.chapterPages as number[] | undefined;

    const intervention = await InterventionService.evaluate(ctx, chapterPages);

    res.json({
      success: true,
      data: intervention, // null if no intervention needed
    });
  } catch (error) {
    console.error('Error checking interventions:', error);
    res.status(500).json({ success: false, error: { code: 'INTERVENTION_ERROR', message: 'Failed to check interventions' } });
  }
});

// POST /api/interventions/feedback - User feedback on intervention
router.post('/feedback', authenticate, async (req: AuthRequest, res) => {
  try {
    const { interventionType, helpful, dismissed } = req.body;

    // Store feedback for future intervention tuning
    // For now, just acknowledge
    console.log('Intervention feedback:', { userId: req.userId, interventionType, helpful, dismissed });

    res.json({ success: true, data: { received: true } });
  } catch (error) {
    console.error('Error recording feedback:', error);
    res.status(500).json({ success: false, error: { code: 'FEEDBACK_ERROR', message: 'Failed to record feedback' } });
  }
});

export default router;
