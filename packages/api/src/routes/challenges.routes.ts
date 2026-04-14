/**
 * Challenges Routes
 *
 * Reading challenges: weekly/monthly goals, streak targets, and progress tracking.
 */

import { Router } from 'express';
import { Op, fn, col } from 'sequelize';
import { Book, ReadingSession } from '../models';
import { AuthRequest, authenticate } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';

const router: Router = Router();

// ---------------------------------------------------------------------------
// Challenge definitions
// ---------------------------------------------------------------------------

interface Challenge {
  id: string;
  title: string;
  description: string;
  type: 'daily' | 'weekly' | 'monthly';
  target: number;
  unit: string;
  icon: string;
}

const ACTIVE_CHALLENGES: Challenge[] = [
  { id: 'daily-pages', title: 'Page Turner', description: 'Read 30 pages today', type: 'daily', target: 30, unit: 'pages', icon: '📖' },
  { id: 'daily-time', title: 'Focus Time', description: 'Read for 30 minutes today', type: 'daily', target: 30, unit: 'minutes', icon: '⏱️' },
  { id: 'weekly-books', title: 'Bookworm Week', description: 'Complete 2 books this week', type: 'weekly', target: 2, unit: 'books', icon: '📚' },
  { id: 'weekly-pages', title: 'Century Club', description: 'Read 200 pages this week', type: 'weekly', target: 200, unit: 'pages', icon: '💯' },
  { id: 'monthly-books', title: 'Monthly Marathon', description: 'Read 5 books this month', type: 'monthly', target: 5, unit: 'books', icon: '🏃' },
  { id: 'monthly-streak', title: 'Consistency King', description: 'Read 20 days this month', type: 'monthly', target: 20, unit: 'days', icon: '🔥' },
];

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /api/challenges
 * Get active challenges with user's current progress
 */
router.get('/', authenticate, rateLimiter({ windowMs: 60000, max: 30 }), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const now = new Date();

    const challenges = await Promise.all(
      ACTIVE_CHALLENGES.map(async (challenge) => {
        const progress = await calculateProgress(userId, challenge, now);
        const completed = progress >= challenge.target;
        const percentage = Math.min(100, Math.round((progress / challenge.target) * 100));

        return {
          ...challenge,
          progress,
          completed,
          percentage,
        };
      }),
    );

    const completedCount = challenges.filter((c) => c.completed).length;

    res.json({
      success: true,
      data: {
        challenges,
        completedCount,
        totalChallenges: challenges.length,
      },
    });
  } catch (error) {
    console.error('Error fetching challenges:', error);
    res.status(500).json({
      success: false,
      error: { code: 'CHALLENGES_ERROR', message: 'Failed to fetch challenges' },
    });
  }
});

// ---------------------------------------------------------------------------
// Progress calculation
// ---------------------------------------------------------------------------

async function calculateProgress(
  userId: string,
  challenge: Challenge,
  now: Date,
): Promise<number> {
  const { type, unit } = challenge;

  let startDate: Date;
  if (type === 'daily') {
    startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
  } else if (type === 'weekly') {
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - startDate.getDay());
    startDate.setHours(0, 0, 0, 0);
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  if (unit === 'pages') {
    const result = await ReadingSession.sum('pagesRead', {
      where: { userId, startedAt: { [Op.gte]: startDate } },
    });
    return Math.round(Number(result) || 0);
  }

  if (unit === 'minutes') {
    const result = await ReadingSession.sum('duration', {
      where: { userId, startedAt: { [Op.gte]: startDate } },
    });
    return Math.round((Number(result) || 0) / 60);
  }

  if (unit === 'books') {
    const count = await Book.count({
      where: {
        userId,
        status: 'completed',
        completedAt: { [Op.gte]: startDate },
      },
    });
    return count;
  }

  if (unit === 'days') {
    const rows = await ReadingSession.findAll({
      attributes: [[fn('DATE', col('startedAt')), 'day']],
      where: { userId, startedAt: { [Op.gte]: startDate } },
      group: [fn('DATE', col('startedAt'))],
      raw: true,
    });
    return rows.length;
  }

  return 0;
}

export default router;
