'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type { Collection } from '@read-pal/shared';
import { useToast } from '@/components/Toast';

interface CollectionsSidebarProps {
  activeCollectionId: string | null;
  onSelectCollection: (id: string | null) => void;
}

const DEFAULT_COLORS = [
  '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
  '#ef4444', '#ec4899', '#06b6d4', '#84cc16',
];

const ICONS: { value: string; label: string }[] = [
  { value: 'folder', label: 'Folder' },
  { value: 'book', label: 'Books' },
  { value: 'star', label: 'Favorites' },
  { value: 'briefcase', label: 'Work' },
  { value: 'heart', label: 'Love' },
  { value: 'graduation-cap', label: 'Study' },
  { value: 'lightbulb', label: 'Ideas' },
  { value: 'bookmark', label: 'To Read' },
];

function CollectionIcon({ icon, color }: { icon: string; color: string }) {
  const style = { color };
  switch (icon) {
    case 'book':
      return <svg style={style} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>;
    case 'star':
      return <svg style={style} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>;
    case 'briefcase':
      return <svg style={style} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>;
    case 'heart':
      return <svg style={style} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>;
    case 'graduation-cap':
      return <svg style={style} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M12 14l9-5-9-5-9 5 9 5z" /><path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222" /></svg>;
    case 'lightbulb':
      return <svg style={style} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>;
    case 'bookmark':
      return <svg style={style} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>;
    default: // folder
      return <svg style={style} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>;
  }
}

export function CollectionsSidebar({ activeCollectionId, onSelectCollection }: CollectionsSidebarProps) {
  const { toast } = useToast();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('folder');
  const [newColor, setNewColor] = useState('#f59e0b');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  const loadCollections = useCallback(async () => {
    try {
      const res = await api.get<Collection[]>('/api/collections');
      if (res.success && res.data) {
        setCollections(Array.isArray(res.data) ? res.data : []);
      }
    } catch {
      // Silent fail — collections are optional
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const res = await api.post<Collection>('/api/collections', {
        name: newName.trim(),
        icon: newIcon,
        color: newColor,
      });
      if (res.success && res.data) {
        setCollections((prev) => [res.data as Collection, ...prev]);
        setNewName('');
        setNewIcon('folder');
        setNewColor('#f59e0b');
        setShowCreate(false);
        toast('Collection created!', 'success');
      }
    } catch {
      toast('Failed to create collection', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    const prev = collections;
    setCollections((cs) => cs.filter((c) => c.id !== id));
    if (activeCollectionId === id) onSelectCollection(null);
    try {
      await api.delete(`/api/collections/${id}`);
      toast('Collection deleted', 'success');
    } catch {
      setCollections(prev);
      toast('Failed to delete', 'error');
    }
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) { setEditingId(null); return; }
    try {
      const res = await api.patch<Collection>(`/api/collections/${id}`, { name: editName.trim() });
      if (res.success && res.data) {
        setCollections((prev) => prev.map((c) => (c.id === id ? (res.data as Collection) : c)));
      }
    } catch {
      toast('Failed to rename', 'error');
    }
    setEditingId(null);
  };

  if (loading) {
    return (
      <div className="space-y-2 pr-4">
        <div className="h-5 w-24 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 bg-gray-50 dark:bg-gray-800/50 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="pr-2 sm:pr-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          <svg className={`w-3 h-3 transition-transform ${collapsed ? '' : 'rotate-90'}`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
          Collections
        </button>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="p-1 rounded-md text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="New collection"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Create form */}
          {showCreate && (
            <div className="mb-3 p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl space-y-2 animate-slide-up">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreate(false); }}
                placeholder="Collection name..."
                className="w-full px-2.5 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-1 focus:ring-primary-400/50"
                autoFocus
              />
              {/* Icon picker */}
              <div className="flex flex-wrap gap-1">
                {ICONS.map((ic) => (
                  <button
                    key={ic.value}
                    onClick={() => setNewIcon(ic.value)}
                    className={`p-1.5 rounded-md transition-colors ${newIcon === ic.value ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                    title={ic.label}
                  >
                    <CollectionIcon icon={ic.value} color={newIcon === ic.value ? '#f59e0b' : 'currentColor'} />
                  </button>
                ))}
              </div>
              {/* Color picker */}
              <div className="flex items-center gap-1.5">
                {DEFAULT_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className={`w-5 h-5 rounded-full transition-transform ${newColor === c ? 'scale-125 ring-2 ring-offset-1 ring-gray-300 dark:ring-gray-600' : 'hover:scale-110'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim()}
                  className="flex-1 px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Create
                </button>
                <button
                  onClick={() => { setShowCreate(false); setNewName(''); }}
                  className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* All books button */}
          <button
            onClick={() => onSelectCollection(null)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors mb-1 ${
              activeCollectionId === null
                ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 font-medium'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            All Books
          </button>

          {/* Collection list */}
          {collections.map((col) => (
            <div key={col.id} className="group relative">
              {editingId === col.id ? (
                <div className="flex items-center gap-1.5 px-3 py-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleRename(col.id); if (e.key === 'Escape') setEditingId(null); }}
                    onBlur={() => handleRename(col.id)}
                    className="flex-1 px-2 py-1 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded outline-none focus:ring-1 focus:ring-primary-400/50"
                    autoFocus
                  />
                </div>
              ) : (
                <button
                  onClick={() => onSelectCollection(activeCollectionId === col.id ? null : col.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                    activeCollectionId === col.id
                      ? 'bg-primary-50 dark:bg-primary-900/20 font-medium'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                  style={activeCollectionId === col.id ? { color: col.color || '#f59e0b' } : undefined}
                >
                  <CollectionIcon icon={col.icon || 'folder'} color={col.color || '#f59e0b'} />
                  <span className="flex-1 text-left truncate">{col.name}</span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">{col.bookCount ?? (col.bookIds || []).length}</span>
                  {/* Hover actions */}
                  <div className="hidden group-hover:flex items-center gap-0.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingId(col.id); setEditName(col.name); }}
                      className="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      title="Rename"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(col.id); }}
                      className="p-0.5 rounded text-gray-400 hover:text-red-500"
                      title="Delete"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </button>
              )}
            </div>
          ))}

          {collections.length === 0 && !showCreate && (
            <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-2">
              No collections yet. Create one to organize your books.
            </p>
          )}
        </>
      )}
    </div>
  );
}
