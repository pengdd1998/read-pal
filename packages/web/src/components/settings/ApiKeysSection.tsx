'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';

interface ApiKeyData {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export function ApiKeysSection() {
  const { toast } = useToast();
  const t = useTranslations('settings_page');
  const [keys, setKeys] = useState<ApiKeyData[]>([]);
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
      const res = await api.get<ApiKeyData[]>('/api/api-keys');
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
        toast(t('api_key_created_toast'), 'success');
      }
    } catch {
      toast(t('api_key_create_failed'), 'error');
    }
    setCreating(false);
  }

  async function handleRevoke(id: string) {
    try {
      const res = await api.delete(`/api/api-keys/${id}`);
      if (res.success) {
        setKeys(keys.filter((k) => k.id !== id));
        toast(t('api_key_revoked_toast'), 'success');
      }
    } catch {
      toast(t('api_key_revoke_failed'), 'error');
    }
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key);
    toast(t('api_key_copied_toast'), 'success');
  }

  return (
    <div className="space-y-4">
      {newKey && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 mb-2">
            {t('api_key_new_warning')}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-surface-0 px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800 break-all font-mono">
              {newKey}
            </code>
            <button
              onClick={() => copyKey(newKey)}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex-shrink-0"
            >
              {t('api_key_copy')}
            </button>
          </div>
          <button
            onClick={() => setNewKey(null)}
            className="mt-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          >
            {t('api_key_dismiss')}
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
                  <span>{t('api_key_created_label')} {new Date(k.createdAt).toLocaleDateString()}</span>
                  {k.lastUsedAt && <span>{t('api_key_last_used')} {new Date(k.lastUsedAt).toLocaleDateString()}</span>}
                </div>
              </div>
              <button
                onClick={() => handleRevoke(k.id)}
                className="ml-3 px-2.5 py-1 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800/30 transition-colors flex-shrink-0"
              >
                {t('api_key_revoke')}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('api_key_empty')}
        </p>
      )}

      {showCreate ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder={t('api_key_name_placeholder')}
            aria-label={t('api_key_name_placeholder')}
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newKeyName.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {creating ? t('api_key_creating') : t('api_key_create')}
          </button>
          <button
            onClick={() => { setShowCreate(false); setNewKeyName(''); }}
            className="px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          >
            {t('api_key_cancel')}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          disabled={keys.length >= 5}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 transition-colors disabled:opacity-50"
        >
          {t('api_key_create_button')} {keys.length >= 5 && t('api_key_max')}
        </button>
      )}

      {/* Usage example */}
      <div className="mt-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">{t('api_key_usage_example')}</p>
        <code className="text-xs text-gray-700 dark:text-gray-300 font-mono block whitespace-pre-wrap">
{`curl -H "Authorization: Bearer rpk_..." \\
  ${typeof window !== 'undefined' ? window.location.origin : ''}/api/books`}
        </code>
      </div>
    </div>
  );
}
