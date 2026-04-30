import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/capacitor', () => ({
  isCapacitor: vi.fn(() => false),
}));

vi.mock('@/lib/native-storage', () => ({
  getItem: vi.fn(() => Promise.resolve(null)),
  setItem: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/api', () => ({
  api: {
    post: vi.fn(),
  },
}));

import { isCapacitor } from '@/lib/capacitor';
import {
  requestNotificationPermission,
  registerPushToken,
  handleForegroundNotification,
  isPushEnabled,
} from '@/lib/notifications';
import { api } from '@/lib/api';

describe('notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isCapacitor as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  describe('requestNotificationPermission', () => {
    it('returns null when not in Capacitor', async () => {
      const result = await requestNotificationPermission();
      expect(result).toBeNull();
    });
  });

  describe('registerPushToken', () => {
    it('posts token to backend', async () => {
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
      });

      const result = await registerPushToken('test-token');
      expect(result).toBe(true);
      expect(api.post).toHaveBeenCalledWith('/api/v1/settings/push-token', {
        push_token: 'test-token',
      });
    });

    it('returns false on API failure', async () => {
      (api.post as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('fail'));

      const result = await registerPushToken('test-token');
      expect(result).toBe(false);
    });
  });

  describe('handleForegroundNotification', () => {
    it('calls showToast with formatted message', () => {
      const showToast = vi.fn();
      handleForegroundNotification(
        { title: 'New comment', body: 'Someone replied' },
        showToast,
      );
      expect(showToast).toHaveBeenCalledWith('New comment: Someone replied', 'info');
    });

    it('handles missing title', () => {
      const showToast = vi.fn();
      handleForegroundNotification({ body: 'Just body' }, showToast);
      expect(showToast).toHaveBeenCalledWith('Just body', 'info');
    });

    it('handles missing body', () => {
      const showToast = vi.fn();
      handleForegroundNotification({ title: 'Just title' }, showToast);
      expect(showToast).toHaveBeenCalledWith('Just title', 'info');
    });

    it('uses default message when both empty', () => {
      const showToast = vi.fn();
      handleForegroundNotification({}, showToast);
      expect(showToast).toHaveBeenCalledWith('New notification', 'info');
    });

    it('no-ops when showToast is not provided', () => {
      expect(() => {
        handleForegroundNotification({ title: 'Test' });
      }).not.toThrow();
    });
  });

  describe('isPushEnabled', () => {
    it('returns false when storage has no value', async () => {
      const result = await isPushEnabled();
      expect(result).toBe(false);
    });
  });
});
