/**
 * NotificationService Unit Tests
 */

import {
  getUserNotifications,
  markNotificationRead,
  markAllRead,
  getUnreadCount,
} from '../../src/services/NotificationService';

// The service uses an in-memory Map — we test the exported functions directly.
// Since the module-level store is shared, we verify behavior with unique user IDs.

describe('NotificationService', () => {
  // Unique user IDs per test to avoid cross-test contamination
  const uid = () => `test-user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  describe('getUserNotifications', () => {
    it('should return empty array for unknown user', () => {
      const result = getUserNotifications('nonexistent-user');
      expect(result).toEqual([]);
    });

    it('should return empty array with no options', () => {
      const userId = uid();
      const result = getUserNotifications(userId);
      expect(result).toEqual([]);
    });

    it('should return empty array with options object', () => {
      const userId = uid();
      const result = getUserNotifications(userId, { limit: 10, unreadOnly: true });
      expect(result).toEqual([]);
    });
  });

  describe('markNotificationRead', () => {
    it('should return false for unknown user', () => {
      const result = markNotificationRead('nonexistent-user', 'any-id');
      expect(result).toBe(false);
    });

    it('should return false for unknown notification id', () => {
      const result = markNotificationRead(uid(), 'nonexistent-notif');
      expect(result).toBe(false);
    });
  });

  describe('markAllRead', () => {
    it('should return 0 for user with no notifications', () => {
      const result = markAllRead(uid());
      expect(result).toBe(0);
    });
  });

  describe('getUnreadCount', () => {
    it('should return 0 for user with no notifications', () => {
      const result = getUnreadCount(uid());
      expect(result).toBe(0);
    });
  });
});
