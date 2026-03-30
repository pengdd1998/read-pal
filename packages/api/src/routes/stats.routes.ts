/**
 * Stats Routes
 *
 * Provides aggregated reading statistics for the authenticated user's dashboard.
 */

import { Router } from 'express';
import { Op, QueryTypes, fn, col, literal } from 'sequelize';
import { Book, Annotation, ReadingSession, sequelize } from '../models';
import { AuthRequest, authenticate } from '../middleware/auth';

const router: Router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface DayActivity {
  day: string;
  pages: number;
  minutes: number;
}

/**
 * Calculate the current consecutive-day reading streak.
 *
 * A streak is counted backwards from today (or yesterday) and includes every
 * day that has at least one ReadingSession row for the user.
 */
async function calculateStreak(userId: string): Promise<number> {
  const rows = await ReadingSession.findAll({
    attributes: [
      [fn('DATE', col('startedAt')), 'day'],
    ],
    where: { userId },
    group: [fn('DATE', col('startedAt'))],
    order: [[fn('DATE', col('startedAt')), 'DESC']],
    raw: true,
  }) as any[];

  if (rows.length === 0) return 0;

  const days = rows.map((r: any) => r.day as string);

  // The most recent reading day must be today or yesterday to count.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const todayStr = today.toISOString().slice(0, 10);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  if (days[0] !== todayStr && days[0] !== yesterdayStr) {
    return 0;
  }

  let streak = 1;
  let prevDate = new Date(days[0]);

  for (let i = 1; i < days.length; i++) {
    const expected = new Date(prevDate);
    expected.setDate(expected.getDate() - 1);
    const expectedStr = expected.toISOString().slice(0, 10);

    if (days[i] === expectedStr) {
      streak++;
      prevDate = new Date(days[i]);
    } else {
      break;
    }
  }

  return streak;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /api/stats/dashboard
 *
 * Returns all aggregated reading stats needed by the dashboard page.
 */
router.get('/dashboard', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // --- Parallel queries --------------------------------------------------

    const [
      totalBooks,
      completedBooks,
      pagesResult,
      highlightCount,
      connectionCount,
      recentBooks,
      booksByStatus,
      weeklyActivity,
      streak,
      totalMinutesResult,
    ] = await Promise.all([
      // Total books
      Book.count({ where: { userId } }),

      // Completed books
      Book.count({ where: { userId, status: 'completed' } }),

      // Total pages read (sum of pagesRead from ReadingSessions)
      ReadingSession.sum('pagesRead', { where: { userId } }) as Promise<number>,

      // Highlights (used as proxy for "concepts discovered")
      Annotation.count({
        where: { userId, type: 'highlight' },
      }),

      // Notes count (used as "connections")
      Annotation.count({
        where: { userId, type: 'note' },
      }),

      // Recent books (last 4 by lastReadAt)
      Book.findAll({
        where: { userId, lastReadAt: { [Op.ne]: undefined as any } },
        order: [['lastReadAt', 'DESC']],
        limit: 4,
        attributes: ['id', 'title', 'author', 'progress', 'lastReadAt', 'coverUrl'],
      }),

      // Books by status
      Book.findAll({
        where: { userId },
        attributes: ['status', [fn('COUNT', col('id')), 'count']],
        group: ['status'],
        raw: true,
      }),

      // Weekly activity: aggregate ReadingSession by day for last 7 days
      sequelize.query<{
        day: string;
        pages: string;
        minutes: string;
      }>(
        `SELECT
           TO_CHAR(DATE("startedAt"), 'Dy')      AS day,
           COALESCE(SUM("pagesRead"), 0)::int     AS pages,
           COALESCE(SUM("duration") / 60, 0)::int AS minutes
         FROM reading_sessions
         WHERE "userId" = $1
           AND "startedAt" >= NOW() - INTERVAL '7 days'
         GROUP BY DATE("startedAt")
         ORDER BY DATE("startedAt") ASC`,
        { bind: [userId], type: QueryTypes.SELECT },
      ),

      // Reading streak
      calculateStreak(userId),

      // Total reading time in minutes
      ReadingSession.sum('duration', { where: { userId } }) as Promise<number>,
    ]);

    // --- Format response ---------------------------------------------------

    const pagesRead = Math.round(Number(pagesResult) || 0);
    const totalMinutes = Math.round((Number(totalMinutesResult) || 0) / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const totalTimeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    // Format weekly activity, filling in zeros for missing days
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const now = new Date();
    const activityMap = new Map<string, DayActivity>();
    for (const row of weeklyActivity) {
      activityMap.set(row.day, {
        day: row.day,
        pages: parseInt(String(row.pages), 10) || 0,
        minutes: parseInt(String(row.minutes), 10) || 0,
      });
    }

    const activity: DayActivity[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayName = dayNames[d.getDay()];
      const existing = activityMap.get(dayName);
      activity.push(existing || { day: dayName, pages: 0, minutes: 0 });
    }

    // Books by status map
    const statusMap: Record<string, number> = { unread: 0, reading: 0, completed: 0 };
    for (const row of booksByStatus as any[]) {
      statusMap[row.status] = parseInt(String(row.count), 10) || 0;
    }

    // Recent books formatted for frontend
    const recentBooksFormatted = recentBooks.map((book) => {
      const lastRead = book.lastReadAt;
      let lastReadStr = 'N/A';
      if (lastRead) {
        const diff = Date.now() - new Date(lastRead).getTime();
        const hoursDiff = Math.floor(diff / (1000 * 60 * 60));
        if (hoursDiff < 1) lastReadStr = 'Just now';
        else if (hoursDiff < 24) lastReadStr = `${hoursDiff}h ago`;
        else {
          const daysDiff = Math.floor(hoursDiff / 24);
          if (daysDiff === 1) lastReadStr = 'Yesterday';
          else if (daysDiff < 7) lastReadStr = `${daysDiff} days ago`;
          else lastReadStr = `${Math.floor(daysDiff / 7)} week${Math.floor(daysDiff / 7) > 1 ? 's' : ''} ago`;
        }
      }
      return {
        id: book.id,
        title: book.title,
        author: book.author,
        progress: Math.round(Number(book.progress)),
        lastRead: lastReadStr,
        coverUrl: book.coverUrl ?? undefined,
      };
    });

    res.json({
      success: true,
      data: {
        stats: {
          booksRead: completedBooks,
          totalPages: totalBooks,
          pagesRead,
          readingStreak: streak,
          totalTime: totalTimeStr,
          conceptsLearned: highlightCount,
          connections: connectionCount,
        },
        recentBooks: recentBooksFormatted,
        weeklyActivity: activity,
        booksByStatus: statusMap,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'STATS_FETCH_ERROR',
        message: 'Failed to fetch dashboard stats',
      },
    });
  }
});

export default router;
