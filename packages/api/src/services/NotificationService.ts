/**
 * Notification Service
 *
 * Generates in-app notifications for reading reminders, streak alerts,
 * and friend messages. Stores notifications in DB and pushes via WebSocket.
 */

import { Op } from 'sequelize';
import { User, Book, ReadingSession, sequelize } from '../models';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Notification {
  id: string;
  userId: string;
  type: 'reading_reminder' | 'streak_alert' | 'streak_milestone' | 'friend_message' | 'book_completed' | 'goal_progress';
  title: string;
  body: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: Date;
}

interface NotificationPreferences {
  readingReminders: boolean;
  reminderTime: string; // HH:mm format
  streakAlerts: boolean;
  friendMessages: boolean;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_PREFS: NotificationPreferences = {
  readingReminders: true,
  reminderTime: '20:00',
  streakAlerts: true,
  friendMessages: true,
};

// ---------------------------------------------------------------------------
// In-memory notification store (replace with DB table in production)
// ---------------------------------------------------------------------------

const notificationStore = new Map<string, Notification[]>();

function getOrCreateUserNotifications(userId: string): Notification[] {
  if (!notificationStore.has(userId)) {
    notificationStore.set(userId, []);
  }
  return notificationStore.get(userId)!;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a reading reminder notification for users who haven't read today.
 */
export async function generateReadingReminders(): Promise<number> {
  const users = await User.findAll({
    where: { settings: { notificationsEnabled: true } as any },
    attributes: ['id', 'name', 'settings'],
  });

  let sent = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const user of users) {
    // Check if user read today
    const todaySession = await ReadingSession.findOne({
      where: {
        userId: user.id,
        startedAt: { [Op.gte]: today },
      },
    });

    if (todaySession) continue; // Already read today

    // Check if already has a reminder today
    const notifications = getOrCreateUserNotifications(user.id);
    const todayReminder = notifications.find(
      (n) =>
        n.type === 'reading_reminder' &&
        new Date(n.createdAt).toDateString() === today.toDateString(),
    );
    if (todayReminder) continue;

    const firstName = (user.name || 'Reader').split(' ')[0];
    const messages = [
      `${firstName}, your books are waiting! Even 10 minutes counts.`,
      `Hey ${firstName}, ready for some reading? Your streak is counting on you.`,
      `${firstName}, a quick chapter today keeps the momentum going.`,
    ];
    const message = messages[Math.floor(Math.random() * messages.length)];

    notifications.push({
      id: `notif-${Date.now()}-${user.id}`,
      userId: user.id,
      type: 'reading_reminder',
      title: 'Time to read!',
      body: message,
      read: false,
      createdAt: new Date(),
    });
    sent++;
  }

  return sent;
}

/**
 * Generate streak milestone notifications.
 */
export async function generateStreakAlerts(): Promise<number> {
  const users = await User.findAll({ attributes: ['id', 'name', 'settings'] });
  let sent = 0;

  for (const user of users) {
    const prefs = getPreferences(user.settings as any);
    if (!prefs.streakAlerts) continue;

    // Calculate streak
    const streak = await calculateUserStreak(user.id);
    const milestones = [3, 7, 14, 30, 60, 100];

    if (!milestones.includes(streak)) continue;

    // Check if milestone already notified
    const notifications = getOrCreateUserNotifications(user.id);
    const alreadyNotified = notifications.find(
      (n) => n.type === 'streak_milestone' && n.body.includes(`${streak}-day`),
    );
    if (alreadyNotified) continue;

    const firstName = (user.name || 'Reader').split(' ')[0];
    const messages: Record<number, string> = {
      3: `${firstName}, you're on a 3-day streak! The habit is forming.`,
      7: `A full week! ${firstName}, you've read 7 days in a row. Keep going!`,
      14: `2 weeks of reading, ${firstName}! This is becoming a real habit.`,
      30: `30 days! ${firstName}, you're a reading champion. One month strong!`,
      60: `60 days of reading, ${firstName}. Absolutely incredible.`,
      100: `100-day reading streak! ${firstName}, this is legendary.`,
    };

    notifications.push({
      id: `streak-${Date.now()}-${user.id}`,
      userId: user.id,
      type: 'streak_milestone',
      title: `${streak}-Day Reading Streak!`,
      body: messages[streak] || `Amazing ${streak}-day streak, ${firstName}!`,
      data: { streak },
      read: false,
      createdAt: new Date(),
    });
    sent++;
  }

  return sent;
}

/**
 * Create a notification for book completion.
 */
export function notifyBookCompleted(userId: string, bookTitle: string): void {
  const notifications = getOrCreateUserNotifications(userId);
  notifications.push({
    id: `book-${Date.now()}-${userId}`,
    userId,
    type: 'book_completed',
    title: 'Book Completed!',
    body: `You finished "${bookTitle}". Great job! What's next?`,
    data: { bookTitle },
    read: false,
    createdAt: new Date(),
  });
}

/**
 * Get notifications for a user, sorted by date (newest first).
 */
export function getUserNotifications(
  userId: string,
  options: { limit?: number; unreadOnly?: boolean } = {},
): Notification[] {
  let notifications = getOrCreateUserNotifications(userId);

  if (options.unreadOnly) {
    notifications = notifications.filter((n) => !n.read);
  }

  // Sort newest first
  notifications.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return notifications.slice(0, options.limit || 50);
}

/**
 * Mark a notification as read.
 */
export function markNotificationRead(userId: string, notificationId: string): boolean {
  const notifications = getOrCreateUserNotifications(userId);
  const notif = notifications.find((n) => n.id === notificationId);
  if (notif) {
    notif.read = true;
    return true;
  }
  return false;
}

/**
 * Mark all notifications as read for a user.
 */
export function markAllRead(userId: string): number {
  const notifications = getOrCreateUserNotifications(userId);
  let count = 0;
  for (const n of notifications) {
    if (!n.read) {
      n.read = true;
      count++;
    }
  }
  return count;
}

/**
 * Get unread notification count.
 */
export function getUnreadCount(userId: string): number {
  return getOrCreateUserNotifications(userId).filter((n) => !n.read).length;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPreferences(settings?: Record<string, unknown> | null): NotificationPreferences {
  if (!settings || typeof settings !== 'object') return DEFAULT_PREFS;
  return {
    readingReminders: (settings.readingReminders as boolean) ?? DEFAULT_PREFS.readingReminders,
    reminderTime: (settings.reminderTime as string) ?? DEFAULT_PREFS.reminderTime,
    streakAlerts: (settings.streakAlerts as boolean) ?? DEFAULT_PREFS.streakAlerts,
    friendMessages: (settings.friendMessages as boolean) ?? DEFAULT_PREFS.friendMessages,
  };
}

async function calculateUserStreak(userId: string): Promise<number> {
  const rows = await ReadingSession.findAll({
    attributes: [
      [sequelize.fn('DATE', sequelize.col('startedAt')), 'day'],
    ],
    where: { userId },
    group: [sequelize.fn('DATE', sequelize.col('startedAt'))],
    order: [[sequelize.fn('DATE', sequelize.col('startedAt')), 'DESC']],
    raw: true,
  }) as unknown as { day: string }[];

  if (rows.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const todayStr = today.toISOString().slice(0, 10);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const days = rows.map((r) => r.day);
  if (days[0] !== todayStr && days[0] !== yesterdayStr) return 0;

  let streak = 1;
  let prevDate = new Date(days[0]);

  for (let i = 1; i < days.length; i++) {
    const expected = new Date(prevDate);
    expected.setDate(expected.getDate() - 1);
    if (days[i] === expected.toISOString().slice(0, 10)) {
      streak++;
      prevDate = new Date(days[i]);
    } else {
      break;
    }
  }

  return streak;
}
