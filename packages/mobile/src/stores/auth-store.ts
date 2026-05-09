import { create } from 'zustand';
import { getToken, saveToken, deleteToken, saveUser, getUser, deleteUser } from '@/lib/auth-storage';
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
    }
  },

  login: async (email: string, password: string) => {
    const result = await api.post<{ token: string; user: User }>('/api/auth/login', { email, password });
    if (result.success && result.data) {
      const { token, user } = result.data;
      await saveToken(token);
      await saveUser(JSON.stringify(user));
      set({ token, user, isAuthenticated: true });
    } else {
      throw new Error(result.error?.message || 'Login failed');
    }
  },

  register: async (name: string, email: string, password: string) => {
    const result = await api.post<{ token: string; user: User }>('/api/auth/register', { name, email, password });
    if (result.success && result.data) {
      const { token, user } = result.data;
      await saveToken(token);
      await saveUser(JSON.stringify(user));
      set({ token, user, isAuthenticated: true });
    } else {
      throw new Error(result.error?.message || 'Registration failed');
    }
  },

  logout: async () => {
    await deleteToken();
    await deleteUser();
    set({ token: null, user: null, isAuthenticated: false });
  },
}));
