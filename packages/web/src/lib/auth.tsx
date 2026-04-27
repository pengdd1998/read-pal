'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api } from './api';
import { getAuthToken, getAuthTokenAsync } from './auth-fetch';
import { isCapacitor } from './capacitor';
import { getItem, setItem, removeItem } from './native-storage';

/** Set a simple cookie so Next.js middleware can detect auth state */
function setAuthCookie(token: string) {
  if (isCapacitor()) return; // No server middleware in static export
  document.cookie = `auth_token=${token}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
}

function clearAuthCookie() {
  if (isCapacitor()) return;
  document.cookie = 'auth_token=; path=/; max-age=0';
}

interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  settings?: Record<string, any>;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  oauthLogin: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load auth state from storage on mount
  useEffect(() => {
    if (isCapacitor()) {
      // Async load from Capacitor Preferences
      getAuthTokenAsync().then(async (savedToken) => {
        const savedUser = await getItem('user');
        if (savedToken && savedUser) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
        }
        setLoading(false);
      });
    } else {
      // Sync load from localStorage (web/PWA)
      try {
        const savedToken = getAuthToken();
        const savedUser = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
        if (savedToken && savedUser) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
          setAuthCookie(savedToken);
        }
      } catch {
        // Invalid stored data
      } finally {
        setLoading(false);
      }
    }
  }, []);

  const persistAuth = useCallback(async (newToken: string, newUser: User) => {
    await removeItem('auth_token');
    await removeItem('user');
    await setItem('auth_token', newToken);
    await setItem('user', JSON.stringify(newUser));
    // Also write to localStorage for non-Capacitor code paths
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', newToken);
      localStorage.setItem('user', JSON.stringify(newUser));
    }
    setAuthCookie(newToken);
    setToken(newToken);
    setUser(newUser);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.post<{ token: string; user: User }>(
      '/api/auth/login',
      { email, password },
    );
    if (result.success && result.data) {
      await persistAuth(result.data.token, result.data.user);
    } else {
      throw new Error(result.error?.message || 'Login failed');
    }
  }, [persistAuth]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const result = await api.post<{ token: string; user: User }>(
      '/api/auth/register',
      { name, email, password },
    );
    if (result.success && result.data) {
      await persistAuth(result.data.token, result.data.user);
    } else {
      throw new Error(result.error?.message || 'Registration failed');
    }
  }, [persistAuth]);

  const logout = useCallback(async () => {
    await removeItem('auth_token');
    await removeItem('user');
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
    }
    clearAuthCookie();
    setToken(null);
    setUser(null);
  }, []);

  const oauthLogin = useCallback(async (newToken: string, newUser: User) => {
    await persistAuth(newToken, newUser);
  }, [persistAuth]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token,
        loading,
        login,
        register,
        oauthLogin,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
