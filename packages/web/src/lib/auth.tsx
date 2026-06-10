'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter } from '@/i18n/navigation';
import { api } from './api';
import { getAuthToken, getAuthTokenAsync, getRefreshTokenAsync, setAuthTokens, clearAuthTokens } from './auth-fetch';
import { isCapacitor } from './capacitor';
import { getItem, setItem, removeItem } from './native-storage';

/** Set a simple non-HttpOnly cookie so Next.js middleware can detect auth state.
 *  The actual secure tokens are stored in HttpOnly cookies set by the server. */
function setAuthSignalCookie() {
  if (isCapacitor()) return; // No server middleware in static export
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `auth_token=1; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax${secure}`;
}

function clearAuthSignalCookie() {
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
  const router = useRouter();

  // Load auth state from storage on mount
  useEffect(() => {
    if (isCapacitor()) {
      // Async load from Capacitor Preferences (mobile uses Bearer tokens)
      getAuthTokenAsync().then(async (savedToken) => {
        const savedUser = await getItem('user');
        if (savedToken && savedUser) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
        }
        setLoading(false);
      });
    } else {
      // Web: auth is cookie-based (HttpOnly). We just need to check
      // if the auth_signal cookie exists + load user profile from localStorage.
      try {
        const hasAuthCookie = typeof document !== 'undefined' &&
          document.cookie.includes('auth_token=');
        const savedUser = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
        if (hasAuthCookie && savedUser) {
          // Token value is irrelevant for web — cookies handle auth.
          // Set a placeholder so isAuthenticated is true.
          setToken('cookie');
          setUser(JSON.parse(savedUser));
        }
      } catch {
        // Invalid stored data
      } finally {
        setLoading(false);
      }
    }
  }, []);

  const persistAuth = useCallback(async (newToken: string, newUser: User, newRefreshToken?: string) => {
    // Store user profile for display purposes
    await removeItem('user');
    await setItem('user', JSON.stringify(newUser));

    if (isCapacitor()) {
      // Mobile: store tokens in native secure storage
      if (newRefreshToken) {
        await setAuthTokens(newToken, newRefreshToken);
      } else {
        await setItem('auth_token', newToken);
      }
      setToken(newToken);
    } else {
      // Web: HttpOnly cookies are already set by the server response.
      // Set a non-HttpOnly signal cookie for the Next.js middleware.
      setAuthSignalCookie();
      // Store token value as placeholder (not used for actual auth — cookies handle that)
      setToken('cookie');
      // Still save to localStorage as fallback during transition
      if (newRefreshToken) {
        await setAuthTokens(newToken, newRefreshToken);
      }
    }
    setUser(newUser);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.post<{ token: string; refreshToken: string; user: User }>(
      '/api/auth/login',
      { email, password, platform: 'web' },
    );
    if (result.success && result.data) {
      await persistAuth(result.data.token, result.data.user, result.data.refreshToken);
    } else {
      throw new Error(result.error?.message || 'Login failed');
    }
  }, [persistAuth]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const result = await api.post<{ token: string; refreshToken: string; user: User }>(
      '/api/auth/register',
      { name, email, password, platform: 'web' },
    );
    if (result.success && result.data) {
      await persistAuth(result.data.token, result.data.user, result.data.refreshToken);
    } else {
      throw new Error(result.error?.message || 'Registration failed');
    }
  }, [persistAuth]);

  const logout = useCallback(async () => {
    // Get refresh token to send with logout request (mobile only — web uses cookie)
    const refreshToken = isCapacitor()
      ? await getRefreshTokenAsync()
      : (typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null);
    try {
      await api.post('/api/auth/logout', { refreshToken: refreshToken || undefined });
    } catch {
      // Logout is idempotent — ignore errors
    }
    await clearAuthTokens();
    await removeItem('user');
    if (typeof window !== 'undefined') {
      localStorage.removeItem('user');
    }
    clearAuthSignalCookie();
    setToken(null);
    setUser(null);
    router.push('/login');
  }, [router]);

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
