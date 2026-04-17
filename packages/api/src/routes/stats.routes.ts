/**
 * Stats Routes
 *
 * Provides aggregated reading statistics for the authenticated user's dashboard.
 */

import { Router } from 'express';
import { Op, QueryTypes, fn, col, literal } from 'sequelize';
import { Book, ReadingSession, sequelize } from '../models';
import { AuthRequest, authenticate } from '../middleware/auth';
import { redisClient } from '../db';
import { etag } from '../middleware/cache';
import { notifyStreakMilestone } from '../services/NotificationService';

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
      [fn('DATE', col('started_at')), 'day'],
    ],
    where: { userId },
    group: [fn('DATE', col('started_at'))],
    order: [[fn('DATE', col('started_at')), 'DESC']],
    raw: true,
  }) as unknown as { day: string }[];

  let days: string[] = rows.map((r) => r.day);

  // --- Fallback: use Book.lastReadAt when no sessions exist ---
  if (days.length === 0) {
    const bookDays = await Book.findAll({
      attributes: [
        [fn('DATE', col('last_read_at')), 'day'],
      ],
      where: {
        userId,
        lastReadAt: {
          [Op.ne]: null as unknown as Date,
          [Op.gte]: literal("NOW() - INTERVAL '7 days'"),
        },
      },
      group: [fn('DATE', col('last_read_at'))],
      order: [[fn('DATE', col('last_read_at')), 'DESC']],
      raw: true,
    }) as unknown as { day: string }[];

    days = bookDays.map((r) => r.day);
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

    // --- Try Redis cache first (120s TTL) ---
    const cacheKey = `stats:calendar:${userId}`;
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        res.set('Cache-Control', 'private, max-age=120');
        res.set('X-Cache', 'HIT');
        return res.json(JSON.parse(cached));
      }
    } catch { /* Redis unavailable, compute fresh */ }

    const rows = await sequelize.query<{
      date: string;
      pages: string;
      minutes: string;
    }>(
      `SELECT
         DATE(started_at)::text                  AS date,
         COALESCE(SUM(pages_read), 0)::int       AS pages,
         COALESCE(SUM(duration) / 60, 0)::int    AS minutes
       FROM reading_sessions
       WHERE user_id = $1
         AND started_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(started_at)
       ORDER BY DATE(started_at) ASC`,
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

    // Trigger streak milestone notification (fire-and-forget)
    notifyStreakMilestone(userId, streak).catch(() => {});

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

    // Cache calendar for 120s — only changes once per day of reading
    const responseData = {
      success: true,
      data: {
        calendar,
        currentStreak: streak,
        longestStreak,
        totalDaysActive: calendar.filter((d) => d.pages > 0 || d.minutes > 0).length,
      },
    };

    // Store in Redis with 120s TTL
    try {
      await redisClient.setex(cacheKey, 120, JSON.stringify(responseData));
    } catch { /* Redis unavailable, skip cache */ }

    res.set('Cache-Control', 'private, max-age=120');
    res.set('X-Cache', 'MISS');
    res.json(responseData);
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
router.get('/dashboard', authenticate, etag(60), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // --- Try Redis cache first (60s TTL) ---
    const cacheKey = `stats:dashboard:${userId}`;
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        res.set('Cache-Control', 'private, max-age=60');
        res.set('X-Cache', 'HIT');
        return res.json(JSON.parse(cached));
      }
    } catch { /* Redis unavailable, compute fresh */ }

    // --- Consolidated stats query (replaces 6 separate count/sum queries) ---
    const [statsRow] = await sequelize.query<{
      total_books: string;
      total_pages: string;
      session_pages_read: string;
      total_duration_seconds: string;
      concepts_count: string;
      connections_count: string;
      chat_count: string;
      memory_book_count: string;
      unread_count: string;
      reading_count: string;
      completed_count: string;
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM books WHERE user_id = $1) AS total_books,
         (SELECT COALESCE(SUM(total_pages), 0)::int FROM books WHERE user_id = $1) AS total_pages,
         (SELECT COALESCE(SUM(pages_read), 0)::int FROM reading_sessions WHERE user_id = $1) AS session_pages_read,
         (SELECT COALESCE(SUM(duration), 0)::int FROM reading_sessions WHERE user_id = $1) AS total_duration_seconds,
         (SELECT COUNT(*)::int FROM annotations WHERE user_id = $1 AND type IN ('note', 'highlight')) AS concepts_count,
         (SELECT COUNT(*)::int FROM annotations WHERE user_id = $1) AS connections_count,
         (SELECT COUNT(*)::int FROM chat_messages WHERE user_id = $1) AS chat_count,
         (SELECT COUNT(*)::int FROM memory_books WHERE user_id = $1) AS memory_book_count,
         (SELECT COUNT(*)::int FROM books WHERE user_id = $1 AND status = 'unread') AS unread_count,
         (SELECT COUNT(*)::int FROM books WHERE user_id = $1 AND status = 'reading') AS reading_count,
         (SELECT COUNT(*)::int FROM books WHERE user_id = $1 AND status = 'completed') AS completed_count`,
      { bind: [userId], type: QueryTypes.SELECT },
    );

    // --- Remaining parallel queries (data that can't be consolidated) ---
    const [recentBooks, sessionWeeklyActivity, streak] = await Promise.all([
      // Recent books (last 5)
      Book.findAll({
        where: { userId },
        order: [['lastReadAt', 'DESC NULLS LAST'], ['addedAt', 'DESC']],
        limit: 5,
        attributes: ['id', 'title', 'author', 'progress', 'totalPages', 'lastReadAt', 'coverUrl', 'status', 'addedAt'],
      }),

      // Weekly activity (last 7 days)
      sequelize.query<{
        day: string;
        pages: string;
        minutes: string;
      }>(
        `SELECT
           TO_CHAR(DATE(started_at), 'Dy')        AS day,
           COALESCE(SUM(pages_read), 0)::int       AS pages,
           COALESCE(SUM(duration) / 60, 0)::int    AS minutes
         FROM reading_sessions
         WHERE user_id = $1
           AND started_at >= NOW() - INTERVAL '7 days'
         GROUP BY DATE(started_at)
         ORDER BY DATE(started_at) ASC`,
        { bind: [userId], type: QueryTypes.SELECT },
      ),

      // Reading streak
      calculateStreak(userId),
    ]);

    // --- Format response ---------------------------------------------------

    const totalPages = parseInt(statsRow.total_pages, 10) || 0;

    // pagesRead: prefer session data; fallback to SQL aggregation
    let pagesRead = parseInt(statsRow.session_pages_read, 10) || 0;
    if (pagesRead === 0) {
      const [aggResult] = await sequelize.query<{ pages_read: string }>(
        'SELECT COALESCE(SUM(ROUND((progress / 100.0) * total_pages)), 0)::int AS pages_read FROM books WHERE user_id = $1',
        { bind: [userId], type: QueryTypes.SELECT },
      );
      pagesRead = parseInt(aggResult?.pages_read || '0', 10);
    }

    const totalMinutes = Math.round((parseInt(statsRow.total_duration_seconds, 10) || 0) / 60);
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
        limit: 50,
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

    // Books by status map — from consolidated query
    const statusMap: Record<string, number> = {
      unread: parseInt(statsRow.unread_count, 10) || 0,
      reading: parseInt(statsRow.reading_count, 10) || 0,
      completed: parseInt(statsRow.completed_count, 10) || 0,
    };

    // Recent books formatted for frontend
    const recentBooksFormatted = recentBooks.map((book) => {
      const lastRead = book.lastReadAt || book.addedAt;
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

    // Cache dashboard for 60s — now ~4 queries instead of 12+
    const responseData = {
      success: true,
      data: {
        stats: {
          booksRead: parseInt(statsRow.total_books, 10) || 0,
          totalPages,
          pagesRead,
          readingStreak: streak,
          totalTime: totalTimeStr,
          conceptsLearned: parseInt(statsRow.concepts_count, 10) || 0,
          connections: parseInt(statsRow.connections_count, 10) || 0,
          chatMessageCount: parseInt(statsRow.chat_count, 10) || 0,
          memoryBookCount: parseInt(statsRow.memory_book_count, 10) || 0,
        },
        recentBooks: recentBooksFormatted,
        weeklyActivity: activity,
        booksByStatus: statusMap,
      },
    };

    // Store in Redis with 60s TTL
    try {
      await redisClient.setex(cacheKey, 60, JSON.stringify(responseData));
    } catch { /* Redis unavailable, skip cache */ }

    res.set('Cache-Control', 'private, max-age=60');
    res.set('X-Cache', 'MISS');
    res.json(responseData);
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

/**
 * GET /api/stats/reading-speed
 *
 * Returns estimated reading speed (WPM) from recent sessions,
 * along with a 7-day trend.
 */
router.get('/reading-speed', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Words per page estimate — standard for most non-illustrated books
    const WORDS_PER_PAGE = 250;

    // Last 30 days of sessions with sufficient duration (>30s to avoid noise)
    const sessions = await ReadingSession.findAll({
      where: {
        userId,
        duration: { [Op.gte]: 30 },
        pagesRead: { [Op.gte]: 1 },
        startedAt: { [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      attributes: ['startedAt', 'duration', 'pagesRead'],
      order: [['startedAt', 'DESC']],
      limit: 100,
    });

    if (sessions.length === 0) {
      return res.json({
        success: true,
        data: {
          currentWpm: 0,
          trend: 'stable' as const,
          sessionsCount: 0,
          weeklyTrend: [],
        },
      });
    }

    // Calculate WPM for each session
    const wpmValues = sessions.map((s) => {
      const minutes = s.duration / 60;
      return Math.round((s.pagesRead * WORDS_PER_PAGE) / minutes);
    });

    // Current speed: average of last 5 sessions (or all if fewer)
    const recentCount = Math.min(5, wpmValues.length);
    const currentWpm = Math.round(
      wpmValues.slice(0, recentCount).reduce((a, b) => a + b, 0) / recentCount,
    );

    // 7-day trend: group sessions by day, calculate average WPM per day
    const dayMap = new Map<string, { wpmSum: number; count: number }>();
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      dayMap.set(dateStr, { wpmSum: 0, count: 0 });
    }

    for (let i = 0; i < sessions.length; i++) {
      const dateStr = new Date(sessions[i].startedAt).toISOString().slice(0, 10);
      const entry = dayMap.get(dateStr);
      if (entry) {
        entry.wpmSum += wpmValues[i];
        entry.count++;
      }
    }

    const weeklyTrend = Array.from(dayMap.entries()).map(([date, { wpmSum, count }]) => ({
      date,
      wpm: count > 0 ? Math.round(wpmSum / count) : 0,
    }));

    // Trend direction: compare first half vs second half of the week
    const firstHalf = weeklyTrend.slice(0, 3).filter((d) => d.wpm > 0);
    const secondHalf = weeklyTrend.slice(4).filter((d) => d.wpm > 0);
    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    if (firstHalf.length > 0 && secondHalf.length > 0) {
      const avgFirst = firstHalf.reduce((s, d) => s + d.wpm, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((s, d) => s + d.wpm, 0) / secondHalf.length;
      const diff = (avgSecond - avgFirst) / avgFirst;
      if (diff > 0.05) trend = 'improving';
      else if (diff < -0.05) trend = 'declining';
    }

    res.json({
      success: true,
      data: {
        currentWpm,
        trend,
        sessionsCount: sessions.length,
        weeklyTrend,
      },
    });
  } catch (error) {
    console.error('Error fetching reading speed:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SPEED_FETCH_ERROR', message: 'Failed to fetch reading speed' },
    });
  }
});

/**
 * GET /api/stats/reading-speed/by-book
 *
 * Returns estimated WPM per book for the authenticated user,
 * useful for comparing reading speed across different books.
 */
router.get('/reading-speed/by-book', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const WORDS_PER_PAGE = 250;

    const rows = await sequelize.query<{
      book_id: string;
      title: string;
      author: string;
      total_pages: string;
      total_duration: string;
    }>(
      `SELECT
         rs.book_id,
         b.title,
         COALESCE(b.author, 'Unknown') AS author,
         COALESCE(SUM(rs.pages_read), 0)::int AS total_pages,
         COALESCE(SUM(rs.duration), 0)::int   AS total_duration
       FROM reading_sessions rs
       JOIN books b ON b.id = rs.book_id
       WHERE rs.user_id = $1
         AND rs.duration >= 30
         AND rs.pages_read >= 1
       GROUP BY rs.book_id, b.title, b.author
       HAVING SUM(rs.duration) > 0
       ORDER BY SUM(rs.pages_read) DESC
       LIMIT 10`,
      { bind: [userId], type: QueryTypes.SELECT },
    );

    const books = rows.map((r) => {
      const totalMinutes = parseInt(r.total_duration, 10) / 60;
      const totalPages = parseInt(r.total_pages, 10);
      return {
        bookId: r.book_id,
        title: r.title,
        author: r.author,
        wpm: totalMinutes > 0 ? Math.round((totalPages * WORDS_PER_PAGE) / totalMinutes) : 0,
        totalPagesRead: totalPages,
        totalMinutes: Math.round(totalMinutes),
      };
    });

    res.json({ success: true, data: books });
  } catch (error) {
    console.error('Error fetching per-book reading speed:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SPEED_BY_BOOK_ERROR', message: 'Failed to fetch per-book reading speed' },
    });
  }
});

export default router;
