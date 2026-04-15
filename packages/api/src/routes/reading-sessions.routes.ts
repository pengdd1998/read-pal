/**
 * Reading Sessions Routes
 */

import { Router } from 'express';
import { body } from 'express-validator';
import { ReadingSession, Book } from '../models';
import { AuthRequest, authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { parsePagination } from '../utils/pagination';
import { notFound } from '../utils/errors';

const router: Router = Router();

/**
 * POST /api/reading-sessions/start
 * Start a reading session
 */
router.post(
  '/start',
  authenticate,
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
router.post('/:id/end', authenticate, async (req: AuthRequest, res) => {
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
router.patch('/:id/heartbeat', authenticate, async (req: AuthRequest, res) => {
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
      ).catch(() => {});
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

export default router;
