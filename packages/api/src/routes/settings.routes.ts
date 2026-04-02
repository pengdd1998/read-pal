/**
 * Settings Routes
 *
 * Provides user settings and preferences management, including appearance,
 * reading goals, and reading friend configuration.
 */

import { Router } from 'express';
import { Op } from 'sequelize';
import { User, Book } from '../models';
import { AuthRequest, authenticate } from '../middleware/auth';

const router: Router = Router();

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS = {
  theme: 'system' as const,
  fontSize: 16,
  fontFamily: 'Inter',
  readingGoal: 2,
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
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
    }

    const userSettings =
      typeof user.settings === 'object' && user.settings !== null
        ? user.settings
        : {};

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
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
    }

    const allowedFields = [
      'theme',
      'fontSize',
      'fontFamily',
      'readingGoal',
      'notificationsEnabled',
      'friendPersona',
      'friendFrequency',
    ];

    const currentSettings =
      typeof user.settings === 'object' && user.settings !== null
        ? (user.settings as Record<string, any>)
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
 * Returns the user's weekly reading goal progress.
 */
router.get('/reading-goals', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await User.findByPk(req.userId);
    const settings =
      typeof (user as any)?.settings === 'object'
        ? (user as any).settings
        : {};

    const booksPerWeekGoal = settings.readingGoal || DEFAULT_SETTINGS.readingGoal;

    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const [completedThisWeek, booksInProgress] = await Promise.all([
      Book.count({
        where: {
          userId: req.userId,
          status: 'completed',
          completedAt: { [Op.gte]: startOfWeek },
        },
      }),
      Book.count({
        where: { userId: req.userId, status: 'reading' },
      }),
    ]);

    res.json({
      success: true,
      data: {
        goal: booksPerWeekGoal,
        completed: completedThisWeek,
        inProgress: booksInProgress,
        onTrack: completedThisWeek >= booksPerWeekGoal,
        remaining: Math.max(0, booksPerWeekGoal - completedThisWeek),
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
