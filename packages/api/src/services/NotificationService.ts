/**
 * Notification Service
 *
 * Minimal stub for notification endpoints.
 * TODO: Implement full notification system with DB persistence and WebSocket push.
 */

interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

// In-memory store — replace with DB-backed store
const notificationStore = new Map<string, Notification[]>();

function getUserNotifications(userId: string, _opts?: { limit?: number; unreadOnly?: boolean }): Notification[] {
  return notificationStore.get(userId) || [];
}

function markNotificationRead(userId: string, notificationId: string): boolean {
  const notifications = notificationStore.get(userId) || [];
  const found = notifications.find((n) => n.id === notificationId);
  if (found) found.read = true;
  return !!found;
}

function markAllRead(userId: string): number {
  const notifications = notificationStore.get(userId) || [];
  let count = 0;
  for (const n of notifications) {
    if (!n.read) { n.read = true; count++; }
  }
  return count;
}

function getUnreadCount(userId: string): number {
  const notifications = notificationStore.get(userId) || [];
  return notifications.filter((n) => !n.read).length;
}

export { getUserNotifications, markNotificationRead, markAllRead, getUnreadCount };
