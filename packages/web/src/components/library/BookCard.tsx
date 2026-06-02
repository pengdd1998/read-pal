'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { isCapacitor } from '@/lib/capacitor';
import { cacheBook, isCached } from '@/lib/mobile-cache';
import { cacheBookForOffline } from '@/lib/offline-queue';
import { CollectionPicker } from './CollectionPicker';

interface BookCardProps {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  progress: number;
  status: 'unread' | 'reading' | 'completed';
  currentPage: number;
  totalPages: number;
  tags?: string[];
  lastReadAt?: Date | string;
  onDelete?: (id: string) => void;
  onTagsChange?: (id: string, tags: string[]) => void;
}

function BookCardInner({
  id,
  title,
  author,
  coverUrl,
  progress,
  status,
  currentPage,
  totalPages,
  tags = [],
  lastReadAt,
  onDelete,
  onTagsChange,
}: BookCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingTags, setEditingTags] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [cachingOffline, setCachingOffline] = useState(false);
  const [cachedOffline, setCachedOffline] = useState(false);
  const [showCollectionPicker, setShowCollectionPicker] = useState(false);
  const router = useRouter();
  const t = useTranslations('library');

  const STATUS_CONFIG = useMemo(() => ({
    unread: { label: t('card_unread'), dot: 'bg-gray-300', ring: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' },
    reading: { label: t('card_reading'), dot: 'bg-primary-400', ring: 'bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300' },
    completed: { label: t('card_completed'), dot: 'bg-emerald-400', ring: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' },
  } as const), [t]);

  const cfg = STATUS_CONFIG[status];

  const openOfflineDB = useCallback((): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('readpal-offline', 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('mutations')) db.createObjectStore('mutations', { keyPath: 'timestamp' });
        if (!db.objectStoreNames.contains('bookContent')) db.createObjectStore('bookContent', { keyPath: 'bookId' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }, []);

  const checkOfflineCache = useCallback(async () => {
    try {
      if (isCapacitor()) {
        const cached = await isCached(id);
        setCachedOffline(cached);
      } else {
        const db = await openOfflineDB();
        if (!db.objectStoreNames.contains('bookContent')) return;
        const tx = db.transaction('bookContent', 'readonly');
        const store = tx.objectStore('bookContent');
        const result = await new Promise<any>((resolve) => {
          const req = store.get(id);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });
        if (result && result.chaptersCached > 0) {
          setCachedOffline(true);
        }
      }
    } catch { /* ignore */ }
  }, [id, openOfflineDB]);

  // Check if book is cached for offline
  useEffect(() => {
    checkOfflineCache();
  }, [checkOfflineCache]);

  const handleCacheOffline = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (cachingOffline || cachedOffline) return;
    setCachingOffline(true);
    try {
      if (isCapacitor()) {
        const result = await cacheBook(id);
        if (result.cached > 0) {
          setCachedOffline(true);
        }
      } else {
        const res = await api.get<{ chapters: Array<{ id: string }> }>(`/api/books/${id}/chapters`);
        if (res.success && res.data?.chapters) {
          await cacheBookForOffline(id, res.data.chapters);
          setCachedOffline(true);
        }
      }
    } catch {
      setCachedOffline(false);
    }
    setCachingOffline(false);
  }, [id, cachingOffline, cachedOffline]);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
    }
  }, [showDeleteConfirm]);

  const handleConfirmDelete = useCallback(() => {
    if (deleting) return;
    setDeleting(true);
    setShowDeleteConfirm(false);
    onDelete?.(id);
  }, [deleting, id, onDelete]);

  const handleCancelDelete = useCallback(() => {
    setShowDeleteConfirm(false);
  }, []);

  const handleAddTag = useCallback(async (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    const tag = tagInput.trim().toLowerCase();
    if (!tag || tags.includes(tag)) { setTagInput(''); return; }
    const newTags = [...tags, tag];
    try {
      await api.put(`/api/books/${id}/tags`, { tags: newTags });
      onTagsChange?.(id, newTags);
      setTagInput('');
    } catch { /* silent */ }
  }, [tagInput, tags, id, onTagsChange]);

  const handleRemoveTag = useCallback(async (tag: string) => {
    const newTags = tags.filter((t) => t !== tag);
    try {
      await api.put(`/api/books/${id}/tags`, { tags: newTags });
      onTagsChange?.(id, newTags);
    } catch { /* silent */ }
  }, [tags, id, onTagsChange]);

  const formattedDate = useMemo(() => lastReadAt
    ? new Date(lastReadAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null, [lastReadAt]);

  return (
    <Link href={`/read/${id}`} className="group">
      <div className="group hover:-translate-y-1 hover:shadow-lg transition-all duration-300 h-full flex flex-col rounded-2xl bg-surface-0 border border-gray-100 dark:border-gray-800 p-3 shadow-xs hover:ring-1 hover:ring-primary-300/50">
        {/* Cover */}
        <div className="relative aspect-[3/4] rounded-xl overflow-hidden mb-3 bg-gradient-to-br from-primary-400/30 to-primary-600/70">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={t('card_cover_of', { title })}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-5xl opacity-60" aria-hidden="true">{'\uD83D\uDCD6'}</span>
            </div>
          )}

          {/* Status dot */}
          <div className="absolute top-2.5 right-2.5 w-3 h-3 rounded-full border-2 border-white dark:border-gray-900" style={{ backgroundColor: cfg.dot }} aria-label={cfg.label} title={cfg.label} />

          {/* Offline badge (Capacitor only) */}
          {cachedOffline && isCapacitor() && (
            <div className="absolute top-2.5 left-2.5 flex items-center gap-0.5 px-1 py-0.5 rounded bg-emerald-500/90 text-white text-[8px] font-semibold">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {t('card_offline_badge')}
            </div>
          )}

          {/* Bottom action bar */}
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-around bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all duration-200 py-1 z-10">
            {/* Info */}
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/book/${id}`); }}
              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors"
              aria-label={t('card_book_details')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>

            {/* Offline cache */}
            <button
              onClick={handleCacheOffline}
              aria-label={cachedOffline ? t('card_available_offline') : t('card_save_offline')}
              className={`min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg transition-colors ${
                cachedOffline
                  ? 'text-emerald-400'
                  : cachingOffline
                    ? 'text-amber-400 animate-pulse'
                    : 'text-white/80 hover:text-white hover:bg-white/20'
              }`}
            >
              {cachedOffline ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              )}
            </button>

            {/* Collection picker */}
            <div className="relative">
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowCollectionPicker((v) => !v); }}
                aria-label={t('card_add_to_collection')}
                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </button>
              {showCollectionPicker && (
                <CollectionPicker bookId={id} onClose={() => setShowCollectionPicker(false)} />
              )}
            </div>

            {/* Delete */}
            <div className="relative">
              <button
                onClick={handleDeleteClick}
                disabled={deleting}
                aria-label={t('card_delete_book')}
                className={`min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg transition-colors ${
                  deleting
                    ? 'text-white/40 cursor-wait'
                    : 'text-white/80 hover:text-red-400 hover:bg-red-500/20'
                }`}
              >
                {deleting ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>
              {showDeleteConfirm && (
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-36 rounded-lg bg-gray-900 dark:bg-gray-800 shadow-xl border border-gray-700 p-2 z-50 animate-in fade-in duration-150"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                >
                  <p className="text-[10px] text-gray-300 text-center mb-2">{t('card_confirm_delete')}</p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCancelDelete(); }}
                      className="flex-1 px-2 py-1 rounded text-[10px] font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
                    >
                      {t('card_cancel')}
                    </button>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleConfirmDelete(); }}
                      className="flex-1 px-2 py-1 rounded text-[10px] font-medium bg-red-600 text-white hover:bg-red-500 transition-colors"
                    >
                      {t('card_delete')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Title & Author */}
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm line-clamp-2 leading-snug mb-1 group-hover:text-primary-700 dark:group-hover:text-primary-400 transition-colors">
          {title}
        </h3>
        <p className="text-xs text-gray-500 mb-2">{author}</p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
            >
              {tag}
              {editingTags && (
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRemoveTag(tag); }}
                  aria-label={`Remove tag ${tag}`}
                  className="ml-0.5 text-amber-400 hover:text-red-500 p-1 -m-1 min-w-[20px] min-h-[20px] flex items-center justify-center"
                >
                  x
                </button>
              )}
            </span>
          ))}
          {editingTags ? (
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { e.stopPropagation(); handleAddTag(e); }}
              onBlur={() => setEditingTags(false)}
              placeholder={t('card_tag_placeholder')}
              aria-label={t('card_add_tag')}
              className="px-1.5 py-0.5 text-[9px] rounded border border-gray-200 dark:border-gray-700 bg-surface-0 w-16 focus:outline-none focus:ring-1 focus:ring-amber-400"
              autoFocus
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            />
          ) : (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingTags(true); }}
              aria-label={t('card_add_tag')}
              className="px-1.5 py-0.5 rounded text-[9px] text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20"
            >
              {t('card_plus_tag')}
            </button>
          )}
        </div>

        {/* Status Badge */}
        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase w-fit ${cfg.ring}`}>
          {cfg.label}
        </span>

        {/* Progress details */}
        {status !== 'unread' && (
          <div className="mt-auto pt-3">
            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  status === 'completed' ? 'bg-emerald-500' : 'bg-primary-500'
                }`}
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-[10px] text-gray-400 tabular-nums">
                {t('card_pages', { current: currentPage, total: totalPages })}
              </p>
              <p className="text-[10px] text-primary-500 font-semibold tabular-nums">
                {progress}%
              </p>
            </div>
          </div>
        )}

        {/* Last read */}
        {formattedDate && (
          <p className="text-[10px] text-gray-400 mt-2">
            {formattedDate}
          </p>
        )}
      </div>
    </Link>
  );
}

export const BookCard = React.memo(BookCardInner);
