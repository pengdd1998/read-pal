'use client';

/**
 * Ops-key session storage (J2, P-J).
 *
 * Default remains sessionStorage (cleared when the tab closes — same
 * P7.2 posture as before). The "remember on this browser" checkbox is an
 * explicit opt-in to localStorage; the strip's lock button clears both.
 * The key NEVER travels in URLs.
 */

const KEY = 'ops-key';
const REMEMBERED_KEY = 'ops-key-remembered';

/** sessionStorage first, then the remembered (localStorage) copy. */
export function readOpsKey(): string | null {
  try {
    return sessionStorage.getItem(KEY) || localStorage.getItem(REMEMBERED_KEY) || null;
  } catch {
    return null;
  }
}

function broadcast(): void {
  try { window.dispatchEvent(new Event('ops-key-changed')); } catch { /* no window */ }
}

/** Called on a successful unlock: always session, optionally remembered. */
export function writeOpsKey(key: string, remember: boolean): void {
  try {
    sessionStorage.setItem(KEY, key);
    if (remember) localStorage.setItem(REMEMBERED_KEY, key);
    else localStorage.removeItem(REMEMBERED_KEY);
  } catch { /* storage unavailable — key just won't persist */ }
  broadcast();
}

/** Lock: clear both storages (J2 「锁定」). */
export function clearOpsKey(): void {
  try {
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(REMEMBERED_KEY);
    localStorage.removeItem(REMEMBERED_KEY);
  } catch { /* nothing to clear */ }
  broadcast();
}
