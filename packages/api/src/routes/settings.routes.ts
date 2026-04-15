/**
 * Settings Routes
 *
 * Provides user settings and preferences management, including appearance,
 * reading goals, and reading friend configuration.
 */

import { Router } from 'express';
import { notFound } from '../utils/errors';
import { Op } from 'sequelize';
import { User, Book, ReadingSession } from '../models';
import { AuthRequest, authenticate } from '../middleware/auth';
import { etag } from '../middleware/cache';

const router: Router = Router();

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS = {
  theme: 'system' as const,
  fontSize: 16,
  fontFamily: 'Inter',
  readingGoal: 2,
  dailyReadingMinutes: 30,
  notificationsEnabled: true,
  friendPersona: 'sage',
  friendFrequency: 'normal' as const,
};

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /api/settings
 *
 * Returns the authenticated user's settings, merged with defaults.
 */
router.get('/', authenticate, etag(60), async (req: AuthRequest, res) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) {
      return notFound(res, 'User');
    }

    const userSettings =
      typeof user.settings === 'object' && user.settings !== null
        ? user.settings
        : {};

    // Cache settings for 30s — they rarely change and are read frequently
    res.set('Cache-Control', 'private, max-age=30');
    res.json({
      success: true,
      data: { ...DEFAULT_SETTINGS, ...userSettings },
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SETTINGS_FETCH_ERROR', message: 'Failed to fetch settings' },
    });
  }
});

/**
 * PATCH /api/settings
 *
 * Updates the authenticated user's settings. Only whitelisted fields are
 * accepted; all values are validated before persisting.
 */
router.patch('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) {
      return notFound(res, 'User');
    }

    const allowedFields = [
      'theme',
      'fontSize',
      'fontFamily',
      'readingGoal',
      'dailyReadingMinutes',
      'notificationsEnabled',
      'friendPersona',
      'friendFrequency',
    ];

    const currentSettings =
      typeof user.settings === 'object' && user.settings !== null
        ? (user.settings as Record<string, unknown>)
        : {};

    const updates: Record<string, any> = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    // --- Validation --------------------------------------------------------

    if (updates.theme && !['light', 'dark', 'system'].includes(updates.theme)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_THEME', message: 'Theme must be light, dark, or system' },
      });
    }

    if (updates.fontSize && (typeof updates.fontSize !== 'number' || updates.fontSize < 12 || updates.fontSize > 32)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_FONT_SIZE', message: 'Font size must be between 12 and 32' },
      });
    }

    if (
      updates.friendPersona &&
      !['sage', 'penny', 'alex', 'quinn', 'sam'].includes(updates.friendPersona)
    ) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PERSONA', message: 'Invalid friend persona' },
      });
    }

    if (
      updates.friendFrequency &&
      !['minimal', 'normal', 'frequent'].includes(updates.friendFrequency)
    ) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_FREQUENCY', message: 'Frequency must be minimal, normal, or frequent' },
      });
    }

    // --- Persist -----------------------------------------------------------

    const newSettings = { ...currentSettings, ...updates };
    await user.update({ settings: newSettings as import('../models/User').UserSettings });

    res.json({ success: true, data: newSettings });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SETTINGS_UPDATE_ERROR', message: 'Failed to update settings' },
    });
  }
});

/**
 * GET /api/settings/reading-goals
 *
 * Returns the user's weekly reading goal progress and daily reading time goal.
 */
router.get('/reading-goals', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const user = await User.findByPk(userId);
    const settings =
      typeof user?.settings === 'object' && user.settings !== null
        ? (user.settings as Record<string, unknown>)
        : ({} as Record<string, unknown>);

    const booksPerWeekGoal = (settings.readingGoal as number) || DEFAULT_SETTINGS.readingGoal;
    const dailyReadingMinutes = (settings.dailyReadingMinutes as number) || DEFAULT_SETTINGS.dailyReadingMinutes;

    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [completedThisWeek, booksInProgress, todayMinutesResult] = await Promise.all([
      Book.count({
        where: {
          userId,
          status: 'completed',
          completedAt: { [Op.gte]: startOfWeek },
        },
      }),
      Book.count({
        where: { userId, status: 'reading' },
      }),
      // Today's reading time from sessions
      ReadingSession.sum('duration', {
        where: {
          userId,
          startedAt: { [Op.gte]: startOfToday },
        },
      }),
    ]);

    const todayMinutes = Math.round((Number(todayMinutesResult) || 0) / 60);

    res.json({
      success: true,
      data: {
        goal: booksPerWeekGoal,
        completed: completedThisWeek,
        inProgress: booksInProgress,
        onTrack: completedThisWeek >= booksPerWeekGoal,
        remaining: Math.max(0, booksPerWeekGoal - completedThisWeek),
        dailyGoalMinutes: dailyReadingMinutes,
        todayMinutes,
        dailyOnTrack: todayMinutes >= dailyReadingMinutes,
        dailyRemaining: Math.max(0, dailyReadingMinutes - todayMinutes),
      },
    });
  } catch (error) {
    console.error('Error fetching reading goals:', error);
    res.status(500).json({
      success: false,
      error: { code: 'GOALS_FETCH_ERROR', message: 'Failed to fetch reading goals' },
    });
  }
});

export default router;
