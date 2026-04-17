'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import type { Collection } from '@read-pal/shared';

interface CollectionPickerProps {
  bookId: string;
  onClose: () => void;
}

export function CollectionPicker({ bookId, onClose }: CollectionPickerProps) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [toggling, setToggling] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<Collection[]>('/api/collections').then((res) => {
      if (res.success && res.data) {
        setCollections(Array.isArray(res.data) ? res.data : []);
      }
    }).finally(() => setLoading(false));
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const isInCollection = (col: Collection) => (col.bookIds || []).includes(bookId);

  const toggleBook = async (col: Collection) => {
    const inCol = isInCollection(col);
    setToggling(col.id);
    try {
      if (inCol) {
        await api.post(`/api/collections/${col.id}/books/remove`, { bookIds: [bookId] });
      } else {
        await api.post(`/api/collections/${col.id}/books`, { bookIds: [bookId] });
      }
      setCollections((prev) => prev.map((c) => {
        if (c.id !== col.id) return c;
        const ids = new Set(c.bookIds || []);
        if (inCol) ids.delete(bookId); else ids.add(bookId);
        return { ...c, bookIds: Array.from(ids) };
      }));
    } catch {
      // Silent fail
    }
    setToggling(null);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const res = await api.post<Collection>('/api/collections', {
        name: newName.trim(),
        bookIds: [bookId],
      });
      if (res.success && res.data) {
        setCollections((prev) => [res.data as Collection, ...prev]);
        setNewName('');
        setShowCreate(false);
      }
    } catch {
      // Silent fail
    }
  };

  return (
    <div ref={ref} className="absolute right-0 top-full mt-1 z-50 w-56 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg animate-slide-up overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Add to collection</p>
      </div>

      {loading ? (
        <div className="p-3 space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-6 bg-gray-50 dark:bg-gray-800 rounded animate-pulse" />)}
        </div>
      ) : (
        <div className="max-h-48 overflow-y-auto p-1.5">
          {collections.map((col) => {
            const inCol = isInCollection(col);
            return (
              <button
                key={col.id}
                onClick={() => toggleBook(col)}
                disabled={toggling === col.id}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                  inCol ? 'border-primary-500 bg-primary-500' : 'border-gray-300 dark:border-gray-600'
                }`}>
                  {inCol && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </div>
                <span className="truncate">{col.name}</span>
              </button>
            );
          })}

          {collections.length === 0 && !showCreate && (
            <p className="text-xs text-gray-400 px-2.5 py-2">No collections yet</p>
          )}
        </div>
      )}

      {/* Create new */}
      <div className="border-t border-gray-100 dark:border-gray-800 p-2">
        {showCreate ? (
          <div className="flex gap-1.5">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreate(false); }}
              placeholder="Name..."
              className="flex-1 px-2 py-1 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded outline-none focus:ring-1 focus:ring-primary-400/50"
              autoFocus
            />
            <button onClick={handleCreate} className="px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors">Add</button>
          </div>
        ) : (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New collection
          </button>
        )}
      </div>
    </div>
  );
}
