import { create } from 'zustand';
import { getToken, saveToken, deleteToken, saveUser, getUser, deleteUser, getRefreshToken, saveRefreshToken, deleteRefreshToken } from '@/lib/auth-storage';
import { api } from '@/lib/api';
import type { User } from '@read-pal/shared';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  loading: true,

  initialize: async () => {
    const timeout = setTimeout(() => {
      set({ loading: false });
    }, 5000);

    try {
      const savedToken = await getToken();
      const savedUser = await getUser();
      if (savedToken && savedUser) {
        set({
          token: savedToken,
          user: JSON.parse(savedUser),
          isAuthenticated: true,
          loading: false,
        });
      } else {
        set({ loading: false });
      }
    } catch {
      set({ loading: false });
    } finally {
      clearTimeout(timeout);
    }
  },

  login: async (email: string, password: string) => {
    const result = await api.post<{ token: string; refreshToken: string; user: User }>('/api/auth/login', { email, password, platform: 'mobile' });
    if (result.success && result.data) {
      const { token, refreshToken, user } = result.data;
      await saveToken(token);
      await saveRefreshToken(refreshToken);
      await saveUser(JSON.stringify(user));
      set({ token, user, isAuthenticated: true });
    } else {
      const code = result.error?.code;
      const msg = result.error?.message;
      if (code === 'NETWORK_ERROR') {
        throw new Error('Unable to connect to server. Please check your internet connection and try again.');
      }
      throw new Error(msg || 'Invalid email or password');
    }
  },

  register: async (name: string, email: string, password: string) => {
    const result = await api.post<{ token: string; refreshToken: string; user: User }>('/api/auth/register', { name, email, password, platform: 'mobile' });
    if (result.success && result.data) {
      const { token, refreshToken, user } = result.data;
      await saveToken(token);
      await saveRefreshToken(refreshToken);
      await saveUser(JSON.stringify(user));
      set({ token, user, isAuthenticated: true });
    } else {
      const code = result.error?.code;
      const msg = result.error?.message;
      if (code === 'NETWORK_ERROR') {
        throw new Error('Unable to connect to server. Please check your internet connection and try again.');
      }
      throw new Error(msg || 'Registration failed. Please try again.');
    }
  },

  logout: async () => {
    const refreshToken = await getRefreshToken();
    try {
      await api.post('/api/auth/logout', { refreshToken: refreshToken || undefined });
    } catch {
      // Logout is idempotent — ignore errors
    }
    await deleteToken();
    await deleteRefreshToken();
    await deleteUser();
    set({ token: null, user: null, isAuthenticated: false });
  },
}));
