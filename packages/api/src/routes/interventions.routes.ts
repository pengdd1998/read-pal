/**
 * Intervention Routes
 *
 * Endpoints for checking whether a proactive agent intervention
 * is warranted based on the reader's current behavior, and for
 * collecting user feedback on interventions.
 */

import { Router } from 'express';
import { ReadingSession, Book, InterventionFeedback } from '../models';
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
    const { interventionType, helpful, dismissed, bookId, context } = req.body;

    await InterventionFeedback.create({
      userId: req.userId!,
      bookId: bookId || null,
      interventionType: interventionType || 'unknown',
      helpful: !!helpful,
      dismissed: !!dismissed,
      context: context || null,
    });

    res.json({ success: true, data: { received: true } });
  } catch (error) {
    console.error('Error recording feedback:', error);
    res.status(500).json({ success: false, error: { code: 'FEEDBACK_ERROR', message: 'Failed to record feedback' } });
  }
});

// GET /api/interventions/feedback-stats - Aggregated feedback stats for tuning
router.get('/feedback-stats', authenticate, async (req: AuthRequest, res) => {
  try {
    const feedback = await InterventionFeedback.findAll({
      where: { userId: req.userId },
      order: [['createdAt', 'DESC']],
      limit: 100,
    });

    const byType: Record<string, { total: number; helpful: number; dismissed: number }> = {};
    for (const f of feedback) {
      const t = f.interventionType;
      if (!byType[t]) byType[t] = { total: 0, helpful: 0, dismissed: 0 };
      byType[t].total++;
      if (f.helpful) byType[t].helpful++;
      if (f.dismissed) byType[t].dismissed++;
    }

    res.json({ success: true, data: { totalFeedback: feedback.length, byType } });
  } catch (error) {
    console.error('Error fetching feedback stats:', error);
    res.status(500).json({ success: false, error: { code: 'FEEDBACK_ERROR', message: 'Failed to fetch feedback stats' } });
  }
});

export default router;
