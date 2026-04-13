/**
 * Notifications Routes
 *
 * API endpoints for reading reminders, streak alerts, and in-app notifications.
 */

import { Router } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import {
  getUserNotifications,
  markNotificationRead,
  markAllRead,
  getUnreadCount,
} from '../services/NotificationService';

const router: Router = Router();

/**
 * GET /api/notifications
 * Get notifications for the authenticated user
 */
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const unreadOnly = req.query.unread === 'true';

    const notifications = getUserNotifications(req.userId!, { limit, unreadOnly });

    res.json({
      success: true,
      data: notifications,
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      error: { code: 'NOTIFICATIONS_FETCH_ERROR', message: 'Failed to fetch notifications' },
    });
  }
});

/**
 * GET /api/notifications/unread-count
 * Get unread notification count
 */
router.get('/unread-count', authenticate, async (req: AuthRequest, res) => {
  try {
    const count = getUnreadCount(req.userId!);
    res.json({ success: true, data: { count } });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'COUNT_ERROR', message: 'Failed to get unread count' },
    });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a notification as read
 */
router.patch('/:id/read', authenticate, async (req: AuthRequest, res) => {
  try {
    const found = markNotificationRead(req.userId!, req.params.id);
    if (!found) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Notification not found' },
      });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'MARK_READ_ERROR', message: 'Failed to mark as read' },
    });
  }
});

/**
 * POST /api/notifications/mark-all-read
 * Mark all notifications as read
 */
router.post('/mark-all-read', authenticate, async (req: AuthRequest, res) => {
  try {
    const count = markAllRead(req.userId!);
    res.json({ success: true, data: { count } });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'MARK_ALL_READ_ERROR', message: 'Failed to mark all as read' },
    });
  }
});

export default router;
