/**
 * NotificationService Unit Tests
 */

import {
  getUserNotifications,
  markNotificationRead,
  markAllRead,
  getUnreadCount,
} from '../../src/services/NotificationService';

// The service uses the Notification model (mocked in setup.ts).

describe('NotificationService', () => {
  const uid = () => `test-user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  describe('getUserNotifications', () => {
    it('should return empty array for unknown user', async () => {
      const result = await getUserNotifications('nonexistent-user');
      expect(result).toEqual([]);
    });

    it('should return empty array with no options', async () => {
      const userId = uid();
      const result = await getUserNotifications(userId);
      expect(result).toEqual([]);
    });

    it('should return empty array with options object', async () => {
      const userId = uid();
      const result = await getUserNotifications(userId, { limit: 10, unreadOnly: true });
      expect(result).toEqual([]);
    });
  });

  describe('markNotificationRead', () => {
    it('should return false when no rows updated', async () => {
      const result = await markNotificationRead('nonexistent-user', 'any-id');
      expect(result).toBe(false);
    });
  });

  describe('markAllRead', () => {
    it('should return 0 when no rows updated', async () => {
      const result = await markAllRead(uid());
      expect(result).toBe(0);
    });
  });

  describe('getUnreadCount', () => {
    it('should return 0 for user with no notifications', async () => {
      const result = await getUnreadCount(uid());
      expect(result).toBe(0);
    });
  });
});
