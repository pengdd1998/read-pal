/**
 * Reading Sessions Routes
 */

import { Router } from 'express';
import { body } from 'express-validator';
import { ReadingSession, Book, Annotation } from '../models';
import { AuthRequest, authenticate } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { parsePagination } from '../utils/pagination';
import { notFound } from '../utils/errors';
import { notifyGoalAchieved, notifyStreakMilestone } from '../services/NotificationService';
import { dispatchWebhook } from '../services/WebhookDelivery';
import { chatCompletion } from '../services/llmClient';
import { User } from '../models';
import { fn, col, Op } from 'sequelize';

const router: Router = Router();

/**
 * POST /api/reading-sessions/start
 * Start a reading session
 */
router.post(
  '/start',
  authenticate,
  rateLimiter({ windowMs: 60000, max: 30 }),
  validate([
    body('bookId').isString().withMessage('Book ID is required and must be a string'),
  ]),
  async (req: AuthRequest, res) => {
    try {
      const { bookId } = req.body;

      // Verify book belongs to user
      const book = await Book.findOne({ where: { id: bookId, userId: req.userId } });
      if (!book) {
        return notFound(res, 'Book');
      }

      // End any active sessions for this user
      await ReadingSession.update(
        { endedAt: new Date(), isActive: false },
        { where: { userId: req.userId, isActive: true } }
      );

      // Create new session
      const session = await ReadingSession.create({
        userId: req.userId!,
        bookId,
        startedAt: new Date(),
        isActive: true,
        pagesRead: 0,
        duration: 0,
        highlights: 0,
        notes: 0,
      });

      // Update book status to reading
      await Book.update(
        { status: 'reading', lastReadAt: new Date() },
        { where: { id: bookId } }
      );

      // Fire-and-forget webhook dispatch
      dispatchWebhook(req.userId!, 'session.started', {
        sessionId: session.id,
        bookId,
        title: book.title,
        startedAt: session.startedAt,
      }).catch((err) => { console.error('[Webhook] session.started dispatch failed:', err); });

      res.status(201).json({ success: true, data: session });
    } catch (error) {
      console.error('Error starting session:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SESSION_START_ERROR',
          message: 'Failed to start reading session',
        },
      });
    }
  }
);

/**
 * POST /api/reading-sessions/:id/end
 * End a reading session
 */
router.post('/:id/end', authenticate, rateLimiter({ windowMs: 60000, max: 30 }), async (req: AuthRequest, res) => {
  try {
    const session = await ReadingSession.findOne({
      where: { id: req.params.id, userId: req.userId, isActive: true },
    });

    if (!session) {
      return notFound(res, 'Active session');
    }

    const endedAt = new Date();
    const duration = Math.round(
      (endedAt.getTime() - new Date(session.startedAt).getTime()) / 1000
    );

    await session.update({
      endedAt,
      duration,
      isActive: false,
      pagesRead: req.body.pagesRead || 0,
    });

    // Fire-and-forget webhook dispatch
    dispatchWebhook(req.userId!, 'session.ended', {
      sessionId: session.id,
      bookId: session.bookId,
      duration,
      pagesRead: req.body.pagesRead || 0,
    }).catch((err) => { console.error('[Webhook] session.ended dispatch failed:', err); });

    // Update book progress if pagesRead provided
    if (req.body.currentPage && req.body.totalPages) {
      const progress = Math.round((req.body.currentPage / req.body.totalPages) * 100);
      const status = progress >= 100 ? 'completed' : 'reading';
      await Book.update(
        {
          currentPage: req.body.currentPage,
          progress,
          status,
          lastReadAt: new Date(),
          ...(progress >= 100 ? { completedAt: new Date() } : {}),
        },
        { where: { id: session.bookId } }
      );
    }

    // Fire-and-forget: check if daily reading goal was achieved
    (async () => {
      try {
        const user = await User.findByPk(req.userId!);
        const dailyGoalMinutes = (user?.settings as Record<string, unknown>)?.dailyReadingMinutes as number || 30;

        // Sum today's reading minutes
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todaySessions = await ReadingSession.findAll({
          attributes: [[fn('COALESCE', fn('SUM', col('duration')), 0), 'totalSeconds']],
          where: {
            userId: req.userId!,
            startedAt: { [Op.gte]: todayStart },
            isActive: false,
          },
          raw: true,
        });
        const totalMinutes = Math.round(
          ((todaySessions[0] as unknown as Record<string, unknown>)?.totalSeconds as number || 0) / 60
        );

        if (totalMinutes >= dailyGoalMinutes) {
          await notifyGoalAchieved(req.userId!, 'daily_minutes', dailyGoalMinutes);
        }

        // Also check streak milestones
        const streakRows = await ReadingSession.findAll({
          attributes: [[fn('DATE', col('started_at')), 'day']],
          where: { userId: req.userId! },
          group: [fn('DATE', col('started_at'))],
          order: [[fn('DATE', col('started_at')), 'DESC']],
          raw: true,
          limit: 60,
        }) as unknown as { day: string }[];

        let streak = 0;
        const now = new Date();
        for (let i = 0; i < 60; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().slice(0, 10);
          if (streakRows.some((r) => r.day === dateStr)) {
            streak++;
          } else if (i > 0) {
            break;
          }
        }

        await notifyStreakMilestone(req.userId!, streak);
      } catch (err) { console.error('[Sessions] Post-end goal/streak check failed:', err); }
    })();

    res.json({ success: true, data: session });
  } catch (error) {
    console.error('Error ending session:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SESSION_END_ERROR',
        message: 'Failed to end reading session',
      },
    });
  }
});

/**
 * PATCH /api/reading-sessions/:id/heartbeat
 * Update active session progress
 */
router.patch('/:id/heartbeat', authenticate, rateLimiter({ windowMs: 60000, max: 60 }), async (req: AuthRequest, res) => {
  try {
    const session = await ReadingSession.findOne({
      where: { id: req.params.id, userId: req.userId, isActive: true },
    });

    if (!session) {
      return notFound(res, 'Active session');
    }

    const currentDuration = Math.round(
      (Date.now() - new Date(session.startedAt).getTime()) / 1000
    );

    await session.update({
      pagesRead: req.body.pagesRead || session.pagesRead,
      duration: currentDuration,
    });

    // Update book progress in real-time (non-blocking)
    if (req.body.pagesRead && session.bookId) {
      Book.update(
        {
          currentPage: req.body.pagesRead - 1,
          lastReadAt: new Date(),
          status: 'reading',
        },
        { where: { id: session.bookId, userId: req.userId } },
      ).catch((err) => { console.error('Failed to update book progress during heartbeat:', err); });
    }

    res.json({
      success: true,
      data: { duration: currentDuration, pagesRead: session.pagesRead },
    });
  } catch (error) {
    console.error('Error updating session:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SESSION_UPDATE_ERROR',
        message: 'Failed to update session',
      },
    });
  }
});

/**
 * GET /api/reading-sessions
 * Get user's reading history
 */
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { page, limit, offset } = parsePagination(req);

    const { rows: sessions, count: total } = await ReadingSession.findAndCountAll({
      where: { userId: req.userId },
      order: [['startedAt', 'DESC']],
      limit,
      offset,
    });

    res.json({
      success: true,
      data: sessions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SESSIONS_FETCH_ERROR',
        message: 'Failed to fetch sessions',
      },
    });
  }
});

/**
 * POST /api/reading-sessions/:id/summarize
 *
 * Generate an AI summary of the reading session using GLM.
 * Uses session stats + recent annotations + book context.
 */
router.post('/:id/summarize', rateLimiter({ windowMs: 60000, max: 10 }), authenticate, async (req: AuthRequest, res) => {
  try {
    const session = await ReadingSession.findOne({
      where: { id: req.params.id, userId: req.userId },
    });

    if (!session) {
      return notFound(res, 'Session');
    }

    // Already has a summary — return it
    if (session.summary) {
      return res.json({ success: true, data: { summary: session.summary } });
    }

    // Fetch book info
    const book = await Book.findByPk(session.bookId);

    // Fetch annotations from this session's timeframe
    const annotations = await Annotation.findAll({
      where: {
        userId: req.userId!,
        bookId: session.bookId,
        createdAt: {
          [Op.gte]: session.startedAt,
          ...(session.endedAt ? { [Op.lte]: session.endedAt } : {}),
        },
      },
      attributes: ['type', 'content', 'text', 'note', 'createdAt'],
      order: [['createdAt', 'ASC']],
      limit: 20,
    });

    const minutesRead = Math.round(session.duration / 60);
    const highlights = annotations.filter((a) => a.type === 'highlight');
    const notes = annotations.filter((a) => a.type === 'note');

    // Build context for the LLM
    const highlightTexts = highlights
      .map((h) => h.content)
      .filter(Boolean)
      .slice(0, 10)
      .map((t, i) => `${i + 1}. "${t.slice(0, 200)}"`)
      .join('\n');

    const noteTexts = notes
      .map((n) => n.note || n.content)
      .filter(Boolean)
      .slice(0, 5)
      .map((t, i) => `${i + 1}. "${t.slice(0, 200)}"`)
      .join('\n');

    const userMessage = `Generate a concise reading session summary for this reading session:

Book: "${book?.title || 'Unknown'}" by ${book?.author || 'Unknown'}
Time spent: ${minutesRead} minutes
Pages read: ${session.pagesRead}
Highlights made: ${highlights.length}
Notes written: ${notes.length}

Key highlights:
${highlightTexts || 'None'}

Reader's notes:
${noteTexts || 'None'}

Write 2-3 sentences summarizing what the reader likely covered and learned. Be specific about topics/themes based on the highlights. Write in second person ("You explored..."). Keep it warm and encouraging.`;

    const summary = await chatCompletion({
      system: 'You are a reading companion that writes brief, insightful summaries of reading sessions. Be specific, warm, and concise.',
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 256,
      temperature: 0.6,
    });

    // Persist the summary
    await session.update({ summary });

    res.json({ success: true, data: { summary } });
  } catch (error) {
    console.error('Error generating session summary:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SUMMARY_ERROR', message: 'Failed to generate session summary' },
    });
  }
});

/**
 * GET /api/reading-sessions/book/:bookId/log
 *
 * Get reading log (sessions with summaries) for a specific book.
 */
router.get('/book/:bookId/log', authenticate, async (req: AuthRequest, res) => {
  try {
    const { page, limit, offset } = parsePagination(req);

    const { rows: sessions, count: total } = await ReadingSession.findAndCountAll({
      where: {
        userId: req.userId!,
        bookId: req.params.bookId,
        isActive: false,
      },
      attributes: ['id', 'startedAt', 'endedAt', 'duration', 'pagesRead', 'highlights', 'notes', 'summary'],
      order: [['startedAt', 'DESC']],
      limit,
      offset,
    });

    res.json({
      success: true,
      data: sessions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Error fetching reading log:', error);
    res.status(500).json({
      success: false,
      error: { code: 'LOG_FETCH_ERROR', message: 'Failed to fetch reading log' },
    });
  }
});

export default router;
