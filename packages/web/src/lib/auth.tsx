'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter } from '@/i18n/navigation';
import { api } from './api';
import { isCapacitor } from './capacitor';
import { getItem, setItem, removeItem } from './native-storage';
import { clearQueue } from './offline-queue';
import { getAuthTokenAsync, setAuthTokens, clearAuthTokens } from './auth-fetch';
import { safeGetItem, safeSetItem, safeRemoveItem } from './safe-storage';
import { warn } from './logger';

/** Set a simple cookie so Next.js middleware can detect auth state */
function setAuthCookie(token: string) {
 if (isCapacitor()) return; // No server middleware in static export
 const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
 document.cookie = `auth_token=${token}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax${secure}`;
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
 oauthLogin: (token: string, user: User, refreshToken?: string) => void;
 logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
 const router = useRouter();

 // Eager initialization from localStorage — survives HMR remount without auth gap
 const [token, setToken] = useState<string | null>(() => {
 if (typeof window === 'undefined' || isCapacitor()) return null;
 return safeGetItem('auth_token');
 });
 const [user, setUser] = useState<User | null>(() => {
 if (typeof window === 'undefined' || isCapacitor()) return null;
 try {
  const saved = safeGetItem('user');
  return saved ? JSON.parse(saved) : null;
 } catch (err) { warn("auth: failed to parse stored user", err); return null; }
 });
 const [loading, setLoading] = useState(() => {
 // Already hydrated from localStorage on web; Capacitor needs async load
 if (typeof window === 'undefined') return true;
 return isCapacitor();
 });

 // Restore auth cookie + handle Capacitor async hydration
 useEffect(() => {
 if (isCapacitor()) {
  getAuthTokenAsync().then(async (savedToken) => {
  const savedUser = await getItem('user');
  if (savedToken && savedUser) {
   setToken(savedToken);
   setUser(JSON.parse(savedUser));
  }
  setLoading(false);
  });
  return;
 }
 // Web: restore cookie so Next.js middleware sees auth state immediately
 const savedToken = safeGetItem('auth_token');
 if (savedToken) setAuthCookie(savedToken);
 }, []);

 const persistAuth = useCallback(async (newToken: string, newUser: User, newRefreshToken?: string) => {
 await removeItem('user');
 await setItem('user', JSON.stringify(newUser));
 if (newRefreshToken) {
  await setAuthTokens(newToken, newRefreshToken);
 } else {
  await setItem('auth_token', newToken);
  if (typeof window !== 'undefined') safeSetItem('auth_token', newToken);
 }
 setAuthCookie(newToken);
 setToken(newToken);
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
 const refreshToken = typeof window !== 'undefined' ? safeGetItem('refresh_token') : null;
 try {
  await api.post('/api/auth/logout', { refreshToken: refreshToken || undefined });
 } catch (e) {
  warn('Logout request failed (idempotent):', e);
 }
 await clearAuthTokens();
 await removeItem('user');
 if (typeof window !== 'undefined') {
  safeRemoveItem('user');
 }
 clearAuthCookie();
 setToken(null);
 setUser(null);
 // Clear offline mutation queue — prevents stale mutations from previous sessions
 clearQueue().catch((err) => { warn('Failed to clear offline queue on logout:', err); });
 router.push('/auth?mode=login');
 }, [router]);

 const oauthLogin = useCallback(async (newToken: string, newUser: User, newRefreshToken?: string) => {
 await persistAuth(newToken, newUser, newRefreshToken);
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
