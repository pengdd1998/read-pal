'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api } from './api';
import { getAuthToken } from './auth-fetch';

/** Set a simple cookie so Next.js middleware can detect auth state */
function setAuthCookie(token: string) {
  document.cookie = `auth_token=${token}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
}

function clearAuthCookie() {
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
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load auth state from localStorage on mount
  useEffect(() => {
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
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.post<{ token: string; user: User }>(
      '/api/auth/login',
      { email, password },
    );
    if (result.success && result.data) {
      const { token: newToken, user: newUser } = result.data;
      localStorage.setItem('auth_token', newToken);
      localStorage.setItem('user', JSON.stringify(newUser));
      setAuthCookie(newToken);
      setToken(newToken);
      setUser(newUser);
    } else {
      throw new Error(result.error?.message || 'Login failed');
    }
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const result = await api.post<{ token: string; user: User }>(
      '/api/auth/register',
      { name, email, password },
    );
    if (result.success && result.data) {
      const { token: newToken, user: newUser } = result.data;
      localStorage.setItem('auth_token', newToken);
      localStorage.setItem('user', JSON.stringify(newUser));
      setAuthCookie(newToken);
      setToken(newToken);
      setUser(newUser);
    } else {
      throw new Error(result.error?.message || 'Registration failed');
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    clearAuthCookie();
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token,
        loading,
        login,
        register,
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
