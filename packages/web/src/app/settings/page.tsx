'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { api, API_BASE_URL } from '@/lib/api';
import { authFetch } from '@/lib/auth-fetch';
import { useToast } from '@/components/Toast';
import { getQueueCount, clearQueue, cacheBookForOffline } from '@/lib/offline-queue';

interface UserSettings {
  theme: string;
  fontSize: number;
  fontFamily: string;
  readingGoal: number;
  dailyReadingMinutes: number;
  notificationsEnabled: boolean;
  streakAlerts: boolean;
  friendMessages: boolean;
  friendPersona: string;
  friendFrequency: string;
}

const PERSONAS = [
  { id: 'sage', name: 'Sage', description: 'Wise and thoughtful', emoji: '\uD83E\uDDD9', color: 'from-violet-100 to-purple-100 dark:from-violet-900/30 dark:to-purple-900/30', accent: 'text-violet-600 dark:text-violet-400' },
  { id: 'penny', name: 'Penny', description: 'Enthusiastic and curious', emoji: '\u2728', color: 'from-amber-100 to-yellow-100 dark:from-amber-900/30 dark:to-yellow-900/30', accent: 'text-amber-600 dark:text-amber-400' },
  { id: 'alex', name: 'Alex', description: 'Challenging and direct', emoji: '\uD83C\uDFAF', color: 'from-red-100 to-orange-100 dark:from-red-900/30 dark:to-orange-900/30', accent: 'text-red-600 dark:text-red-400' },
  { id: 'quinn', name: 'Quinn', description: 'Calm and minimalist', emoji: '\uD83C\uDF43', color: 'from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30', accent: 'text-emerald-600 dark:text-emerald-400' },
  { id: 'sam', name: 'Sam', description: 'Practical and focused', emoji: '\uD83D\uDCDA', color: 'from-blue-100 to-sky-100 dark:from-blue-900/30 dark:to-sky-900/30', accent: 'text-blue-600 dark:text-blue-400' },
];

function ZoteroSection() {
  const { toast } = useToast();
  const [connected, setConnected] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [userId, setUserId] = useState('');
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Check if already connected
    api.get<{ connected: boolean; userId: string | null }>('/api/zotero/status')
      .then((res) => {
        if (res.success && res.data) {
          setConnected(res.data.connected);
          if (res.data.userId) setUserId(res.data.userId);
        }
      })
      .catch(() => {});
  }, []);

  async function handleConnect() {
    if (!apiKey.trim() || !userId.trim()) {
      toast('Enter both API Key and User ID', 'error');
      return;
    }
    setValidating(true);
    try {
      // Validate key first
      const valRes = await api.post<{ valid: boolean; username?: string; error?: string }>('/api/zotero/validate', {
        apiKey: apiKey.trim(),
        userId: userId.trim(),
      });
      if (!valRes.success || !valRes.data?.valid) {
        toast(valRes.data?.error || 'Invalid Zotero credentials', 'error');
        return;
      }
      // Save to settings
      const saveRes = await api.patch('/api/settings', {
        zoteroApiKey: apiKey.trim(),
        zoteroUserId: userId.trim(),
      });
      if (saveRes.success) {
        setConnected(true);
        toast(`Connected to Zotero${valRes.data.username ? ` (${valRes.data.username})` : ''}`, 'success');
      }
    } catch {
      toast('Failed to connect to Zotero', 'error');
    } finally {
      setValidating(false);
    }
  }

  async function handleDisconnect() {
    setSaving(true);
    try {
      await api.patch('/api/settings', { zoteroApiKey: '', zoteroUserId: '' });
      setConnected(false);
      setApiKey('');
      setUserId('');
      toast('Zotero disconnected', 'success');
    } catch {
      toast('Failed to disconnect', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (connected) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Connected {userId && <span className="text-gray-400">(User {userId})</span>}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Export highlights and notes from any book to your Zotero library using the &quot;Export to Zotero&quot; button on the book detail page.
        </p>
        <button
          onClick={handleDisconnect}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800/30 transition-colors"
        >
          {saving ? 'Disconnecting...' : 'Disconnect'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Your Zotero API key"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">User ID</label>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="Your Zotero user ID (numeric)"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>
      </div>
      <p className="text-[10px] text-gray-400 dark:text-gray-500">
        Get your API key at <span className="text-blue-500">zotero.org/settings/keys</span>
      </p>
      <button
        onClick={handleConnect}
        disabled={validating || !apiKey.trim() || !userId.trim()}
        className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {validating ? 'Validating...' : 'Connect Zotero'}
      </button>
    </div>
  );
}

function ApiKeysSection() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<Array<{ id: string; name: string; keyPrefix: string; lastUsedAt: string | null; createdAt: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    loadKeys();
  }, []);

  async function loadKeys() {
    try {
      const res = await api.get<Array<{ id: string; name: string; keyPrefix: string; lastUsedAt: string | null; createdAt: string }>>('/api/api-keys');
      if (res.success && res.data) {
        setKeys(res.data);
      }
    } catch {
      // silently fail
    }
    setLoading(false);
  }

  async function handleCreate() {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const res = await api.post<{ id: string; name: string; key: string; keyPrefix: string }>('/api/api-keys', {
        name: newKeyName.trim(),
      });
      if (res.success && res.data) {
        setNewKey(res.data.key);
        setNewKeyName('');
        setShowCreate(false);
        await loadKeys();
        toast('API key created. Copy it now — it won\'t be shown again.', 'success');
      }
    } catch {
      toast('Failed to create API key', 'error');
    }
    setCreating(false);
  }

  async function handleRevoke(id: string) {
    try {
      const res = await api.delete(`/api/api-keys/${id}`);
      if (res.success) {
        setKeys(keys.filter((k) => k.id !== id));
        toast('API key revoked', 'success');
      }
    } catch {
      toast('Failed to revoke API key', 'error');
    }
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key);
    toast('API key copied to clipboard', 'success');
  }

  return (
    <div className="space-y-4">
      {newKey && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 mb-2">
            New API key created. Copy it now — it won&apos;t be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white dark:bg-gray-800 px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800 break-all font-mono">
              {newKey}
            </code>
            <button
              onClick={() => copyKey(newKey)}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex-shrink-0"
            >
              Copy
            </button>
          </div>
          <button
            onClick={() => setNewKey(null)}
            className="mt-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : keys.length > 0 ? (
        <div className="space-y-2">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{k.name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-0.5">
                  <code className="font-mono">{k.keyPrefix}...</code>
                  <span>Created {new Date(k.createdAt).toLocaleDateString()}</span>
                  {k.lastUsedAt && <span>Last used {new Date(k.lastUsedAt).toLocaleDateString()}</span>}
                </div>
              </div>
              <button
                onClick={() => handleRevoke(k.id)}
                className="ml-3 px-2.5 py-1 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800/30 transition-colors flex-shrink-0"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No API keys yet. Create one to access your reading data programmatically.
        </p>
      )}

      {showCreate ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g., My Script)"
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newKeyName.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
          <button
            onClick={() => { setShowCreate(false); setNewKeyName(''); }}
            className="px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          disabled={keys.length >= 5}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 transition-colors disabled:opacity-50"
        >
          Create API Key {keys.length >= 5 && '(max 5)'}
        </button>
      )}

      {/* Usage example */}
      <div className="mt-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Usage example:</p>
        <code className="text-xs text-gray-700 dark:text-gray-300 font-mono block whitespace-pre-wrap">
{`curl -H "Authorization: Bearer rpk_..." \\
  ${typeof window !== 'undefined' ? window.location.origin : ''}/api/books`}
        </code>
      </div>
    </div>
  );
}

interface CachedBook {
  bookId: string;
  title?: string;
  cachedAt?: number;
}

function OfflineSection() {
  const { toast } = useToast();
  const [queueCount, setQueueCount] = useState(0);
  const [cachedBooks, setCachedBooks] = useState<CachedBook[]>([]);
  const [books, setBooks] = useState<Array<{ id: string; title: string; author: string }>>([]);
  const [selectedBooks, setSelectedBooks] = useState<Set<string>>(new Set());
  const [caching, setCaching] = useState(false);

  // Load offline state
  useEffect(() => {
    async function load() {
      try {
        const count = await getQueueCount();
        setQueueCount(count);

        // Check what's in IndexedDB bookContent store
        const dbReq = indexedDB.open('readpal-offline', 2);
        dbReq.onsuccess = () => {
          const db = dbReq.result;
          if (db.objectStoreNames.contains('bookContent')) {
            const tx = db.transaction('bookContent', 'readonly');
            const store = tx.objectStore('bookContent');
            const getAllReq = store.getAll();
            getAllReq.onsuccess = () => {
              setCachedBooks(getAllReq.result || []);
            };
          }
        };

        // Load books for selection
        const res = await api.get<{ books: Array<{ id: string; title: string; author: string }> }>('/api/books?status=reading&pageSize=50');
        if (res.data?.books) setBooks(res.data.books);
      } catch {
        // Offline or not configured
      }
    }
    load();
  }, []);

  async function handleCacheSelected() {
    if (selectedBooks.size === 0) return;
    setCaching(true);
    try {
      const booksToCache = books.filter((b) => selectedBooks.has(b.id));
      for (const book of booksToCache) {
        await cacheBookForOffline(book.id, [{ id: '1' }]);
      }
      toast(`${booksToCache.length} book${booksToCache.length > 1 ? 's' : ''} cached for offline`, 'success');
      setSelectedBooks(new Set());
      // Refresh
      const dbReq = indexedDB.open('readpal-offline', 2);
      dbReq.onsuccess = () => {
        const db = dbReq.result;
        if (db.objectStoreNames.contains('bookContent')) {
          const tx = db.transaction('bookContent', 'readonly');
          const store = tx.objectStore('bookContent');
          const getAllReq = store.getAll();
          getAllReq.onsuccess = () => setCachedBooks(getAllReq.result || []);
        }
      };
    } catch {
      toast('Failed to cache books', 'error');
    } finally {
      setCaching(false);
    }
  }

  async function handleRemoveCached(bookId: string) {
    try {
      const dbReq = indexedDB.open('readpal-offline', 2);
      dbReq.onsuccess = () => {
        const db = dbReq.result;
        const tx = db.transaction('bookContent', 'readwrite');
        tx.objectStore('bookContent').delete(bookId);
        tx.oncomplete = () => {
          setCachedBooks((prev) => prev.filter((b) => b.bookId !== bookId));
          toast('Removed from offline cache', 'success');
        };
      };
    } catch {
      toast('Failed to remove', 'error');
    }
  }

  async function handleClearQueue() {
    try {
      await clearQueue();
      setQueueCount(0);
      toast('Pending sync queue cleared', 'success');
    } catch {
      toast('Failed to clear queue', 'error');
    }
  }

  const cachedIds = new Set(cachedBooks.map((b) => b.bookId));

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
      <div className="space-y-5">
        {/* Status */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Sync Status</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {queueCount > 0
                ? `${queueCount} change${queueCount !== 1 ? 's' : ''} pending sync`
                : 'All changes synced'}
            </p>
          </div>
          {queueCount > 0 && (
            <button
              onClick={handleClearQueue}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Clear Queue
            </button>
          )}
        </div>

        {/* Cached books */}
        <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Cached Books</h3>
          {cachedBooks.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">No books cached for offline reading yet.</p>
          ) : (
            <div className="space-y-2">
              {cachedBooks.map((cb) => (
                <div key={cb.bookId} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{cb.title || cb.bookId}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveCached(cb.bookId)}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cache more books */}
        {books.length > 0 && (
          <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Cache for Offline</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Select books to make available without internet.</p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {books
                .filter((b) => !cachedIds.has(b.id))
                .map((book) => (
                  <label key={book.id} className="flex items-center gap-2 py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedBooks.has(book.id)}
                      onChange={(e) => {
                        const next = new Set(selectedBooks);
                        if (e.target.checked) next.add(book.id);
                        else next.delete(book.id);
                        setSelectedBooks(next);
                      }}
                      className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{book.title}</span>
                    <span className="text-xs text-gray-400 ml-auto">{book.author}</span>
                  </label>
                ))}
              {books.filter((b) => !cachedIds.has(b.id)).length === 0 && (
                <p className="text-xs text-gray-400">All current books are already cached.</p>
              )}
            </div>
            {selectedBooks.size > 0 && (
              <button
                onClick={handleCacheSelected}
                disabled={caching}
                className="mt-3 px-4 py-2 rounded-lg text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50 transition-colors"
              >
                {caching ? 'Caching...' : `Cache ${selectedBooks.size} Book${selectedBooks.size > 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear debounce timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const res = await api.get<UserSettings>('/api/settings');
      if (res.success && res.data) {
        setSettings(res.data);
      } else {
        setError('Failed to load settings');
      }
      // Load user profile
      const meRes = await api.get<{ user: { name: string; email: string } }>('/api/auth/me');
      if (meRes.success && meRes.data) {
        const d = meRes.data;
        setUserName(d.user?.name || '');
        setUserEmail(d.user?.email || '');
      }
    } catch {
      setError('Failed to load settings. Please try again.');
    }
    setLoading(false);
  }

  async function saveSettings(updates: Partial<UserSettings>) {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await api.patch<UserSettings>('/api/settings', updates as Record<string, unknown>);
      if (res.success && res.data) {
        setSettings(res.data);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(res.error?.message || 'Failed to save settings');
      }
    } catch {
      setError('Failed to save settings. Please try again.');
    }
    setSaving(false);
  }

  // Debounced save for slider controls (font size)
  const debouncedSave = useCallback((updates: Partial<UserSettings>) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveSettings(updates), 400);
  }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 animate-fade-in">
        {/* Header skeleton */}
        <div className="mb-8">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg w-32 animate-pulse" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-lg w-56 mt-2 animate-pulse" />
        </div>

        {/* Section skeleton */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse" />
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded-lg w-32 animate-pulse" />
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
              <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-24 animate-pulse" />
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="h-10 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
                ))}
              </div>
              <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-20 animate-pulse" />
              <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center animate-scale-in">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-lg font-semibold mb-4">Failed to load settings</p>
          {error && <p className="text-sm text-gray-500 mb-4">{error}</p>}
          <button onClick={loadSettings} className="btn btn-primary">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-3 sm:px-6 py-8 sm:py-12 animate-fade-in">
      {/* Header */}
      <div className="mb-6 sm:mb-8 animate-slide-up">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1">Customize your reading experience</p>
      </div>

      {/* Saving indicator */}
      {(saving || saved) && (
        <div role="status" aria-live="polite" className={`mb-6 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium animate-slide-up transition-all ${
          saved
            ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800'
            : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
        }`}>
          {saved ? (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Settings saved
            </>
          ) : (
            <>
              <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          )}
        </div>
      )}

      {error && (
        <div role="alert" className="mb-6 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm animate-slide-up">
          {error}
        </div>
      )}

      {/* Appearance Section */}
      <section className="mb-6 animate-slide-up stagger-1">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/40 dark:to-amber-800/40 flex items-center justify-center">
            <svg className="w-[1.125rem] h-[1.125rem] text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold">Appearance</h2>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
          {/* Theme */}
          <div>
            <label className="block text-sm font-medium mb-2">Theme</label>
            <div className="grid grid-cols-3 gap-2">
              {(['system', 'light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => saveSettings({ theme: t })}
                  disabled={saving}
                  aria-pressed={settings.theme === t}
                  className={`py-2.5 px-3 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.98] border ${
                    settings.theme === t
                      ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 shadow-xs'
                      : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  {t === 'system' ? 'System' : t === 'light' ? 'Light' : 'Dark'}
                </button>
              ))}
            </div>
          </div>

          {/* Font Size */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="font-size-slider" className="text-sm font-medium">Font Size</label>
              <span className="text-xs px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 font-medium">
                {settings.fontSize}px
              </span>
            </div>
            <input
              id="font-size-slider"
              type="range"
              min="12"
              max="32"
              value={settings.fontSize}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setSettings({ ...settings!, fontSize: val });
                debouncedSave({ fontSize: val });
              }}
              className="w-full accent-amber-500"
              disabled={saving}
            />
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span>A</span>
              <span className="text-lg">A</span>
            </div>
          </div>

          {/* Font Family */}
          <div>
            <label className="block text-sm font-medium mb-2">Font Family</label>
            <div className="grid grid-cols-2 gap-2">
              {(['Inter', 'Georgia', 'Merriweather', 'system-ui'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => saveSettings({ fontFamily: f })}
                  disabled={saving}
                  aria-pressed={settings.fontFamily === f}
                  className={`py-2.5 px-3 rounded-xl text-sm transition-all duration-200 active:scale-[0.98] border ${
                    settings.fontFamily === f
                      ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 shadow-xs font-medium'
                      : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                  style={{ fontFamily: f }}
                >
                  {f === 'system-ui' ? 'System' : f}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Reading Goals Section */}
      <section className="mb-6 animate-slide-up stagger-2">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-100 to-emerald-100 dark:from-teal-900/40 dark:to-emerald-900/40 flex items-center justify-center">
            <svg className="w-[1.125rem] h-[1.125rem] text-teal-600 dark:text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold">Reading Goals</h2>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium mb-2">Books per week</label>
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                {[1, 2, 3, 5, 7].map((n) => (
                  <button
                    key={n}
                    onClick={() => saveSettings({ readingGoal: n })}
                    disabled={saving}
                    aria-pressed={settings.readingGoal === n}
                    className={`w-10 h-10 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.98] border ${
                      settings.readingGoal === n
                        ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 shadow-xs'
                        : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Daily Reading Minutes */}
          <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="daily-minutes-slider" className="text-sm font-medium">Daily reading time</label>
              <span className="text-xs px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 font-medium">
                {settings.dailyReadingMinutes || 30} min
              </span>
            </div>
            <input
              id="daily-minutes-slider"
              type="range"
              min="5"
              max="120"
              step="5"
              value={settings.dailyReadingMinutes || 30}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setSettings({ ...settings!, dailyReadingMinutes: val });
                debouncedSave({ dailyReadingMinutes: val });
              }}
              className="w-full accent-teal-500"
              disabled={saving}
            />
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span>5 min</span>
              <span>1 hr</span>
              <span>2 hr</span>
            </div>
          </div>
        </div>
      </section>

      {/* Notification Preferences Section */}
      <section className="mb-6 animate-slide-up stagger-2">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/40 dark:to-indigo-900/40 flex items-center justify-center">
            <svg className="w-[1.125rem] h-[1.125rem] text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold">Notifications</h2>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
          {/* Reading Reminders */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">Reading Reminders</label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Daily nudge when you haven&apos;t read</p>
            </div>
            <button
              onClick={() => saveSettings({ notificationsEnabled: !settings.notificationsEnabled })}
              disabled={saving}
              role="switch"
              aria-checked={settings.notificationsEnabled}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                settings.notificationsEnabled ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                settings.notificationsEnabled ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>

          {/* Streak Alerts */}
          <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">Streak Milestones</label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Celebrate 3, 7, 30-day streaks</p>
              </div>
              <button
                onClick={() => saveSettings({ streakAlerts: !settings.streakAlerts })}
                disabled={saving}
                role="switch"
                aria-checked={settings.streakAlerts !== false}
                className={`relative w-12 h-7 rounded-full transition-colors duration-200 ${
                  (settings.streakAlerts !== false) ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  (settings.streakAlerts !== false) ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>
          </div>

          {/* Friend Messages */}
          <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">Friend Messages</label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Your reading friend&apos;s insights and tips</p>
              </div>
              <button
                onClick={() => saveSettings({ friendMessages: !settings.friendMessages })}
                disabled={saving}
                role="switch"
                aria-checked={settings.friendMessages !== false}
                className={`relative w-12 h-7 rounded-full transition-colors duration-200 ${
                  (settings.friendMessages !== false) ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  (settings.friendMessages !== false) ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Reading Friend Section */}
      <section className="mb-6 animate-slide-up stagger-3">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/40 dark:to-teal-900/40 flex items-center justify-center">
            <span className="text-lg">{'\u2728'}</span>
          </div>
          <h2 className="text-lg font-semibold">Reading Friend</h2>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
          {/* Persona selection */}
          <div>
            <label className="block text-sm font-medium mb-3">Choose your companion</label>
            <div className="grid grid-cols-1 gap-2">
              {PERSONAS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => saveSettings({ friendPersona: p.id })}
                  disabled={saving}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all duration-200 active:scale-[0.98] ${
                    settings.friendPersona === p.id
                      ? 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/10'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${p.color} flex items-center justify-center flex-shrink-0`}>
                    <span className="text-lg">{p.emoji}</span>
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-sm">{p.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{p.description}</div>
                  </div>
                  {settings.friendPersona === p.id && (
                    <svg className="w-5 h-5 text-amber-500 ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Frequency */}
          <div>
            <label className="block text-sm font-medium mb-2">Interaction frequency</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                ['minimal', 'Quiet', 'Only when asked'],
                ['normal', 'Friendly', 'Helpful nudges'],
                ['frequent', 'Active', 'Always nearby'],
              ] as const).map(([value, label, desc]) => (
                <button
                  key={value}
                  onClick={() => saveSettings({ friendFrequency: value })}
                  disabled={saving}
                  className={`py-3 px-2 rounded-xl text-center transition-all duration-200 active:scale-[0.98] border ${
                    settings.friendFrequency === value
                      ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 shadow-xs'
                      : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className={`text-sm font-medium ${settings.friendFrequency === value ? 'text-amber-700 dark:text-amber-300' : 'text-gray-600 dark:text-gray-400'}`}>
                    {label}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Integrations — Zotero */}
      <section className="mt-10 animate-slide-up stagger-3">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          Integrations
        </h2>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-100 to-rose-200 dark:from-red-900/30 dark:to-rose-900/30 flex items-center justify-center text-lg font-bold text-red-600 dark:text-red-400">
              Z
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Zotero</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Export highlights & notes to your Zotero library</p>
            </div>
          </div>

          <ZoteroSection />
        </div>
      </section>

      {/* Developer API */}
      <section className="mt-6 animate-slide-up stagger-3">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-100 to-slate-200 dark:from-gray-800 dark:to-slate-800 flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Developer API</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Access your reading data programmatically</p>
            </div>
          </div>

          <ApiKeysSection />
        </div>
      </section>

      {/* Offline Reading */}
      <section className="mt-6 animate-slide-up stagger-3">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728m-2.829-2.829a5 5 0 000-7.07m-4.243 2.829a1.5 1.5 0 010 2.121M6.636 18.364a9 9 0 010-12.728" />
          </svg>
          Offline Reading
        </h2>
        <OfflineSection />
      </section>

      {/* Account */}
      <section className="mt-10 animate-slide-up stagger-3">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          Account
        </h2>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Name</label>
              <div className="px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm border border-gray-200 dark:border-gray-700">
                {userName || 'Not set'}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Email</label>
              <div className="px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm border border-gray-200 dark:border-gray-700">
                {userEmail || 'Not set'}
              </div>
            </div>
            <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={() => {
                  localStorage.removeItem('auth_token');
                  window.location.href = '/auth?mode=login';
                }}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800/30 transition-colors"
              >
                Sign Out
              </button>
            </div>
            <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
              <details className="group">
                <summary className="cursor-pointer text-xs text-gray-600 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors list-none flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete account
                </summary>
                <div className="mt-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30">
                  <p className="text-xs text-red-600 dark:text-red-400 mb-3">
                    This will permanently delete your account and all your data, including books, highlights, and reading history. This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        if (!confirm('Are you sure you want to delete your account? This cannot be undone.')) return;
                        try {
                          const res = await authFetch(`${API_BASE_URL}/api/auth/account`, {
                            method: 'DELETE',
                          });
                          if (res.ok) {
                            localStorage.removeItem('auth_token');
                            window.location.href = '/';
                          }
                        } catch {
                          toast('Failed to delete account. Please try again.', 'error');
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
                    >
                      Delete my account
                    </button>
                  </div>
                </div>
              </details>
            </div>
          </div>
        </div>
      </section>

      {/* Back link */}
      <div className="mt-8 animate-slide-up stagger-4">
        <a
          href="/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-700"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </a>
      </div>
    </main>
  );
}
