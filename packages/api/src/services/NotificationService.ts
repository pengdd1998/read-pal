/**
 * Notification Service
 *
 * Database-backed notification system with trigger methods for
 * streak milestones, reading reminders, and goal achievements.
 */

import { Op } from 'sequelize';
import { Notification } from '../models/Notification';

type NotificationType = 'streak_milestone' | 'streak_at_risk' | 'reading_reminder' | 'goal_achieved' | 'system';

interface NotificationData {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

function toData(n: Notification): NotificationData {
  return {
    id: n.id,
    userId: n.userId,
    type: n.type as NotificationType,
    title: n.title,
    message: n.message,
    metadata: n.metadata ?? undefined,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  };
}

// --- Read operations ---

async function getUserNotifications(
  userId: string,
  opts?: { limit?: number; unreadOnly?: boolean },
): Promise<NotificationData[]> {
  const where: Record<string, unknown> = { userId };
  if (opts?.unreadOnly) where.read = false;

  const notifications = await Notification.findAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: opts?.limit || 50,
  });

  return notifications.map(toData);
}

async function markNotificationRead(userId: string, notificationId: string): Promise<boolean> {
  const [updated] = await Notification.update(
    { read: true },
    { where: { id: notificationId, userId } },
  );
  return updated > 0;
}

async function markAllRead(userId: string): Promise<number> {
  const [updated] = await Notification.update(
    { read: true },
    { where: { userId, read: false } },
  );
  return updated;
}

async function getUnreadCount(userId: string): Promise<number> {
  return Notification.count({ where: { userId, read: false } });
}

// --- Trigger / create operations ---

/**
 * Create a notification. Skips if a duplicate (same userId + type + title) exists within the last 24h.
 */
async function createNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<NotificationData | null> {
  // De-duplicate: don't re-send the same notification type+title within 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existing = await Notification.findOne({
    where: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      createdAt: { [Op.gt]: since },
    },
  });
  if (existing) return null;

  const notification = await Notification.create({
    userId: params.userId,
    type: params.type,
    title: params.title,
    message: params.message,
    metadata: params.metadata,
    read: false,
  });

  return toData(notification);
}

/**
 * Notify when a streak milestone is reached (3, 7, 14, 30 days).
 */
async function notifyStreakMilestone(
  userId: string,
  streakDays: number,
): Promise<void> {
  const milestones: Record<number, string> = {
    3: 'Great start!',
    7: 'One full week — impressive!',
    14: 'Two weeks strong!',
    30: 'A whole month — legendary!',
  };

  const subtitle = milestones[streakDays];
  if (!subtitle) return;

  await createNotification({
    userId,
    type: 'streak_milestone',
    title: `${streakDays}-day reading streak!`,
    message: subtitle,
    metadata: { streakDays },
  });
}

/**
 * Notify when streak is at risk (user hasn't read today and it's evening).
 */
async function notifyStreakAtRisk(
  userId: string,
  currentStreak: number,
): Promise<void> {
  if (currentStreak < 2) return;

  await createNotification({
    userId,
    type: 'streak_at_risk',
    title: 'Keep your streak going!',
    message: `You've read ${currentStreak} days in a row. Don't break the chain — read something today!`,
    metadata: { streakDays: currentStreak },
  });
}

/**
 * Remind user to read (gentle nudge).
 */
async function notifyReadingReminder(
  userId: string,
  dailyGoalMinutes: number,
): Promise<void> {
  await createNotification({
    userId,
    type: 'reading_reminder',
    title: 'Time to read?',
    message: `Your daily goal is ${dailyGoalMinutes} minutes. Even a few pages counts!`,
    metadata: { dailyGoalMinutes },
  });
}

/**
 * Notify when a reading goal is achieved.
 */
async function notifyGoalAchieved(
  userId: string,
  goalType: 'daily_minutes' | 'weekly_books',
  value: number,
): Promise<void> {
  const title = goalType === 'daily_minutes'
    ? 'Daily reading goal achieved!'
    : 'Weekly reading goal achieved!';

  const message = goalType === 'daily_minutes'
    ? `You've hit your ${value}-minute reading goal for today. Nice work!`
    : `You've completed ${value} book${value > 1 ? 's' : ''} this week!`;

  await createNotification({
    userId,
    type: 'goal_achieved',
    title,
    message,
    metadata: { goalType, value },
  });
}

export {
  getUserNotifications,
  markNotificationRead,
  markAllRead,
  getUnreadCount,
  createNotification,
  notifyStreakMilestone,
  notifyStreakAtRisk,
  notifyReadingReminder,
  notifyGoalAchieved,
};
