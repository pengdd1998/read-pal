/**
 * Safe localStorage wrapper that gracefully handles:
 * - Private browsing mode (Safari throws on any access)
 * - Storage quota exceeded
 * - Disabled cookies/storage
 */

export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Private browsing or storage disabled — return null
    return null;
  }
}

export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage full or blocked — non-critical, ignore silently
  }
}

export function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore
  }
}
