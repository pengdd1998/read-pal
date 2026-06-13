'use client';

import { isCapacitor } from './capacitor';
import { getItem, setItem } from './native-storage';
import { api } from './api';
import { warn } from './logger';

const PUSH_ENABLED_KEY = 'push_notifications_enabled';
const PUSH_TOKEN_KEY = 'push_token';

// Minimal interface for the Capacitor PushNotifications plugin.
// Defined locally so the module compiles even when the npm package
// is not yet installed — the dynamic import handles that at runtime.
interface PushToken { value: string }
interface PermissionStatus { receive: string }
interface PushNotification { title?: string; body?: string }

interface PushNotificationsShape {
  requestPermissions: () => Promise<PermissionStatus>;
  register: () => Promise<void>;
  addListener: (
    eventName: string,
    callback: (data: unknown) => void,
  ) => Promise<void> | void;
}

let pushPlugin: PushNotificationsShape | null = null;

async function loadPushPlugin(): Promise<PushNotificationsShape | null> {
  if (!isCapacitor()) return null;
  if (pushPlugin) return pushPlugin;
  try {
    // Dynamic import with string variable to avoid TS2307 when the
    // package is not installed. TypeScript cannot resolve the module
    // at compile time but the import still works at runtime.
    const moduleName = '@capacitor/push-notifications';
    const mod = await import(
      /* webpackIgnore: true */ moduleName
    ) as Record<string, PushNotificationsShape>;
    pushPlugin = mod.PushNotifications;
    return pushPlugin;
  } catch (err) {
    warn('Notifications: failed to load push notifications plugin', err);
    return null;
  }
}

/**
 * Request notification permission from the OS.
 * Returns the push token on success, or null if denied / unavailable.
 */
export async function requestNotificationPermission(): Promise<string | null> {
  const plugin = await loadPushPlugin();
  if (!plugin) return null;

  try {
    const { receive } = await plugin.requestPermissions();
    if (receive !== 'granted') return null;

    // Register with FCM/APNs to get the device token
    await plugin.register();

    // Listen for the registration token (resolves once)
    return new Promise<string | null>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 10_000);

      plugin.addListener('registration', (data: unknown) => {
        clearTimeout(timeout);
        resolve((data as PushToken).value);
      });

      plugin.addListener('registrationError', () => {
        clearTimeout(timeout);
        resolve(null);
      });
    });
  } catch (err) {
    warn('Notifications: failed to request notification permission', err);
    return null;
  }
}

/**
 * Register (or update) the push token on the backend so the server
 * can send notifications to this device.
 */
export async function registerPushToken(token: string): Promise<boolean> {
  try {
    const res = await api.post<{ success: boolean }>(
      '/api/v1/settings/push-token',
      { push_token: token },
    );
    if (res.success) {
      await setItem(PUSH_TOKEN_KEY, token);
    }
    return res.success;
  } catch (err) {
    warn('Notifications: failed to register push token with backend', err);
    return false;
  }
}

/**
 * Display a foreground push notification as an in-app toast.
 * Falls back to a no-op when the toast callback is unavailable.
 */
export function handleForegroundNotification(
  notification: { title?: string; body?: string },
  showToast?: (message: string, type?: 'info' | 'success' | 'error') => void,
): void {
  const title = notification.title || '';
  const body = notification.body || '';
  const message = [title, body].filter(Boolean).join(': ') || 'New notification';

  if (showToast) {
    showToast(message, 'info');
  }
}

/**
 * Full notification setup pipeline:
 * 1. Check if user has enabled push notifications
 * 2. Request OS permission
 * 3. Register token with backend
 * 4. Set up foreground notification listener
 *
 * Returns the token if fully registered, or null.
 */
export async function initializeNotifications(
  showToast?: (message: string, type?: 'info' | 'success' | 'error') => void,
): Promise<string | null> {
  if (!isCapacitor()) return null;

  // Check user preference
  const enabled = await getItem(PUSH_ENABLED_KEY);
  if (enabled !== 'true') return null;

  const plugin = await loadPushPlugin();
  if (!plugin) return null;

  // Set up foreground notification listener before requesting permission
  plugin.addListener('pushNotificationReceived', (data: unknown) => {
    const notification = data as PushNotification;
    handleForegroundNotification(
      {
        title: notification.title || undefined,
        body: notification.body || undefined,
      },
      showToast,
    );
  });

  // Request permission and get token
  const token = await requestNotificationPermission();
  if (!token) return null;

  // Register with backend
  await registerPushToken(token);

  return token;
}

/**
 * Check whether the user has enabled push notifications.
 */
export async function isPushEnabled(): Promise<boolean> {
  const val = await getItem(PUSH_ENABLED_KEY);
  return val === 'true';
}

/**
 * Enable or disable push notifications at the user preference level.
 * When enabling, also requests permission and registers the token.
 * When disabling, stores the preference (server-side cleanup can be
 * handled by the backend later).
 */
export async function setPushEnabled(
  enabled: boolean,
  showToast?: (message: string, type?: 'info' | 'success' | 'error') => void,
): Promise<boolean> {
  if (!isCapacitor()) return false;

  if (enabled) {
    await setItem(PUSH_ENABLED_KEY, 'true');
    const token = await initializeNotifications(showToast);
    return !!token;
  }

  await setItem(PUSH_ENABLED_KEY, 'false');
  return true;
}
