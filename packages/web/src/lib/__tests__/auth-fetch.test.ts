import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the native-storage and capacitor modules before importing auth-fetch
vi.mock('../native-storage', () => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
}));

vi.mock('../capacitor', () => ({
  isCapacitor: vi.fn(() => false),
}));

import { getAuthToken, getRefreshToken, setAuthTokens, clearAuthTokens } from '../auth-fetch';

describe('auth-fetch', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('getAuthToken', () => {
    it('returns null when no token is stored', () => {
      expect(getAuthToken()).toBeNull();
    });

    it('returns the token from localStorage', () => {
      localStorage.setItem('auth_token', 'test-access-token');
      expect(getAuthToken()).toBe('test-access-token');
    });

    it('returns null in SSR (typeof window === "undefined")', () => {
      // jsdom environment means window is defined, so we simulate SSR
      // by temporarily removing window from the global scope.
      const originalWindow = globalThis.window;
      // @ts-expect-error -- intentionally deleting window for SSR test
      delete globalThis.window;
      try {
        expect(getAuthToken()).toBeNull();
      } finally {
        globalThis.window = originalWindow;
      }
    });
  });

  describe('getRefreshToken', () => {
    it('returns null when no token is stored', () => {
      expect(getRefreshToken()).toBeNull();
    });

    it('returns the refresh token from localStorage', () => {
      localStorage.setItem('refresh_token', 'test-refresh-token');
      expect(getRefreshToken()).toBe('test-refresh-token');
    });
  });

  describe('setAuthTokens', () => {
    it('stores both access and refresh tokens in localStorage', async () => {
      await setAuthTokens('my-access-token', 'my-refresh-token');

      expect(localStorage.getItem('auth_token')).toBe('my-access-token');
      expect(localStorage.getItem('refresh_token')).toBe('my-refresh-token');
    });

    it('overwrites existing tokens', async () => {
      localStorage.setItem('auth_token', 'old-access');
      localStorage.setItem('refresh_token', 'old-refresh');

      await setAuthTokens('new-access', 'new-refresh');

      expect(localStorage.getItem('auth_token')).toBe('new-access');
      expect(localStorage.getItem('refresh_token')).toBe('new-refresh');
    });
  });

  describe('clearAuthTokens', () => {
    it('removes both tokens from localStorage', async () => {
      localStorage.setItem('auth_token', 'some-access');
      localStorage.setItem('refresh_token', 'some-refresh');

      await clearAuthTokens();

      expect(localStorage.getItem('auth_token')).toBeNull();
      expect(localStorage.getItem('refresh_token')).toBeNull();
    });

    it('does not throw when tokens are not present', async () => {
      await expect(clearAuthTokens()).resolves.toBeUndefined();
      expect(localStorage.getItem('auth_token')).toBeNull();
      expect(localStorage.getItem('refresh_token')).toBeNull();
    });
  });
});
