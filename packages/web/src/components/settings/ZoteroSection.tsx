'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';

export function ZoteroSection() {
  const { toast } = useToast();
  const [connected, setConnected] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [userId, setUserId] = useState('');
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<{ connected: boolean; userId: string | null }>('/api/zotero/status')
      .then((res) => {
        if (res.success && res.data) {
          setConnected(res.data.connected);
          if (res.data.userId) setUserId(res.data.userId);
        }
      });
  }, []);

  async function handleConnect() {
    if (!apiKey.trim() || !userId.trim()) {
      toast('Enter both API Key and User ID', 'error');
      return;
    }
    setValidating(true);
    try {
      const valRes = await api.post<{ valid: boolean; username?: string; error?: string }>('/api/zotero/validate', {
        apiKey: apiKey.trim(),
        userId: userId.trim(),
      });
      if (!valRes.success || !valRes.data?.valid) {
        toast(valRes.data?.error || 'Invalid Zotero credentials', 'error');
        return;
      }
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
