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
 * Primary source: ReadingSession rows.
 * Fallback: books with lastReadAt within the last 7 days.
 */
async function calculateStreak(userId: string): Promise<number> {
  // --- Primary: use ReadingSession days ---
  const rows = await ReadingSession.findAll({
    attributes: [
      [fn('DATE', col('startedAt')), 'day'],
    ],
    where: { userId },
    group: [fn('DATE', col('startedAt'))],
    order: [[fn('DATE', col('startedAt')), 'DESC']],
    raw: true,
  }) as any[];

  let days: string[] = rows.map((r: any) => r.day as string);

  // --- Fallback: use Book.lastReadAt when no sessions exist ---
  if (days.length === 0) {
    const bookDays = await Book.findAll({
      attributes: [
        [fn('DATE', col('lastReadAt')), 'day'],
      ],
      where: {
        userId,
        lastReadAt: {
          [Op.ne]: null as any,
          [Op.gte]: literal("NOW() - INTERVAL '7 days'"),
        },
      },
      group: [fn('DATE', col('lastReadAt'))],
      order: [[fn('DATE', col('lastReadAt')), 'DESC']],
      raw: true,
    }) as any[];

    days = bookDays.map((r: any) => r.day as string);
  }

  if (days.length === 0) return 0;

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
 * GET /api/stats/reading-calendar
 *
 * Returns 30-day reading activity for the streak calendar visualization.
 * Each entry includes: date, pages read, minutes, and whether the user met their goal.
 */
router.get('/reading-calendar', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const rows = await sequelize.query<{
      date: string;
      pages: string;
      minutes: string;
    }>(
      `SELECT
         DATE("startedAt")::text               AS date,
         COALESCE(SUM("pagesRead"), 0)::int     AS pages,
         COALESCE(SUM("duration") / 60, 0)::int AS minutes
       FROM reading_sessions
       WHERE "userId" = $1
         AND "startedAt" >= NOW() - INTERVAL '30 days'
       GROUP BY DATE("startedAt")
       ORDER BY DATE("startedAt") ASC`,
      { bind: [userId], type: QueryTypes.SELECT },
    );

    // Build a map for quick lookup
    const activityMap = new Map<string, { pages: number; minutes: number }>();
    for (const row of rows) {
      activityMap.set(row.date, {
        pages: parseInt(String(row.pages), 10) || 0,
        minutes: parseInt(String(row.minutes), 10) || 0,
      });
    }

    // Fallback: if no session data, use book.lastReadAt
    if (rows.length === 0) {
      const recentBooks = await Book.findAll({
        where: {
          userId,
          lastReadAt: {
            [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
        attributes: ['lastReadAt', 'progress', 'totalPages'],
        raw: true,
      });

      for (const book of recentBooks) {
        if (!book.lastReadAt) continue;
        const dateStr = new Date(book.lastReadAt).toISOString().slice(0, 10);
        const existing = activityMap.get(dateStr) || { pages: 0, minutes: 0 };
        existing.pages += Math.round((Number(book.progress) / 100) * book.totalPages);
        activityMap.set(dateStr, existing);
      }
    }

    // Build 30-day array
    const calendar: { date: string; pages: number; minutes: number }[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const entry = activityMap.get(dateStr);
      calendar.push({
        date: dateStr,
        pages: entry?.pages ?? 0,
        minutes: entry?.minutes ?? 0,
      });
    }

    // Calculate current streak
    const streak = await calculateStreak(userId);

    // Calculate longest streak in the 30-day window
    let longestStreak = 0;
    let currentRun = 0;
    for (const day of calendar) {
      if (day.pages > 0 || day.minutes > 0) {
        currentRun++;
        longestStreak = Math.max(longestStreak, currentRun);
      } else {
        currentRun = 0;
      }
    }

    res.json({
      success: true,
      data: {
        calendar,
        currentStreak: streak,
        longestStreak,
        totalDaysActive: calendar.filter((d) => d.pages > 0 || d.minutes > 0).length,
      },
    });
  } catch (error) {
    console.error('Error fetching reading calendar:', error);
    res.status(500).json({
      success: false,
      error: { code: 'CALENDAR_FETCH_ERROR', message: 'Failed to fetch reading calendar' },
    });
  }
});

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
      completedBooks,
      totalPagesResult,
      recentBooks,
      booksByStatus,
      sessionPagesRead,
      sessionWeeklyActivity,
      totalMinutesResult,
      streak,
      conceptCount,
      connectionCount,
    ] = await Promise.all([
      // 1. Total books in library
      Book.count({ where: { userId } }),

      // 2. Sum of totalPages across all books
      Book.sum('totalPages', { where: { userId } }) as Promise<number>,

      // 3. Recent books (last 5 by addedAt — include all books, not just read ones)
      Book.findAll({
        where: { userId },
        order: [['lastReadAt', 'DESC NULLS LAST'], ['addedAt', 'DESC']],
        limit: 5,
        attributes: ['id', 'title', 'author', 'progress', 'totalPages', 'lastReadAt', 'coverUrl', 'status', 'addedAt'],
      }),

      // 4. Books by status
      Book.findAll({
        where: { userId },
        attributes: ['status', [fn('COUNT', col('id')), 'count']],
        group: ['status'],
        raw: true,
      }),

      // 5. Total pages read from ReadingSessions
      ReadingSession.sum('pagesRead', { where: { userId } }) as Promise<number>,

      // 6. Weekly activity from ReadingSessions (last 7 days)
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

      // 7. Total reading time in minutes (duration is stored in seconds)
      ReadingSession.sum('duration', { where: { userId } }) as Promise<number>,

      // 8. Reading streak (with fallback to book.lastReadAt)
      calculateStreak(userId),

      // 9. Concepts learned: count of annotations with type 'note' or 'highlight'
      Annotation.count({
        where: { userId, type: { [Op.in]: ['note', 'highlight'] } },
      }),

      // 10. Connections: total count of all annotations
      Annotation.count({ where: { userId } }),
    ]);

    // --- Format response ---------------------------------------------------

    const totalPages = Math.round(Number(totalPagesResult) || 0);

    // pagesRead: prefer session data; fallback to sum of (progress * totalPages) per book
    let pagesRead = Math.round(Number(sessionPagesRead) || 0);
    if (pagesRead === 0 && recentBooks.length > 0) {
      // Fetch all books to compute from progress
      const allBooks = await Book.findAll({
        where: { userId },
        attributes: ['progress', 'totalPages'],
      });
      pagesRead = allBooks.reduce((sum, book) => {
        return sum + Math.round((Number(book.progress) / 100) * book.totalPages);
      }, 0);
    }

    const totalMinutes = Math.round((Number(totalMinutesResult) || 0) / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const totalTimeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    // Format weekly activity, filling in zeros for missing days
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const now = new Date();
    const activityMap = new Map<string, DayActivity>();
    for (const row of sessionWeeklyActivity) {
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

    // If weekly activity has no session data, estimate from books read during the week
    const hasActivity = activity.some((a) => a.pages > 0);
    if (!hasActivity) {
      // Use book.lastReadAt and progress to provide estimated activity
      const recentWeekBooks = await Book.findAll({
        where: {
          userId,
          lastReadAt: {
            [Op.gte]: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          },
        },
        attributes: ['lastReadAt', 'progress', 'totalPages'],
      });

      // Group by day
      const dayBookMap = new Map<string, number>();
      for (const book of recentWeekBooks) {
        if (!book.lastReadAt) continue;
        const bookDate = new Date(book.lastReadAt);
        const dayIdx = bookDate.getDay();
        const dayLabel = dayNames[dayIdx];
        const estimated = Math.round((Number(book.progress) / 100) * book.totalPages);
        dayBookMap.set(dayLabel, (dayBookMap.get(dayLabel) || 0) + estimated);
      }

      // Overwrite activity with book-based estimates
      for (const entry of activity) {
        entry.pages = dayBookMap.get(entry.day) || 0;
      }
    }

    // Books by status map
    const statusMap: Record<string, number> = { unread: 0, reading: 0, completed: 0 };
    for (const row of booksByStatus as any[]) {
      statusMap[row.status] = parseInt(String(row.count), 10) || 0;
    }

    // Recent books formatted for frontend
    const recentBooksFormatted = recentBooks.map((book) => {
      const lastRead = book.lastReadAt || (book as any).addedAt;
      let lastReadStr = 'N/A';
      if (lastRead) {
        const diff = Date.now() - new Date(lastRead as string).getTime();
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
          booksRead: completedBooks, // total books in library
          totalPages,
          pagesRead,
          readingStreak: streak,
          totalTime: totalTimeStr,
          conceptsLearned: conceptCount,
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
