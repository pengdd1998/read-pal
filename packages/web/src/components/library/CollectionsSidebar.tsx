'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import type { Collection } from '@read-pal/shared';
import { useToast } from '@/components/Toast';
import { CollectionCreateForm } from './CollectionCreateForm';
import { CollectionItem } from './CollectionItem';

interface CollectionsSidebarProps {
 activeCollectionId: string | null;
 onSelectCollection: (id: string | null, bookIds?: string[]) => void;
}

export const CollectionsSidebar = React.memo(function CollectionsSidebar({ activeCollectionId, onSelectCollection }: CollectionsSidebarProps) {
 const { toast } = useToast();
 const t = useTranslations('library');
 const [collections, setCollections] = useState<Collection[]>([]);
 const [loading, setLoading] = useState(true);
 const [showCreate, setShowCreate] = useState(false);
 const [newName, setNewName] = useState('');
 const [newIcon, setNewIcon] = useState('folder');
 const [newColor, setNewColor] = useState('#f59e0b');
 const [editingId, setEditingId] = useState<string | null>(null);
 const [editName, setEditName] = useState('');
 const [collapsed, setCollapsed] = useState(false);
 const [creating, setCreating] = useState(false);
 const [error, setError] = useState(false);
 const mountedRef = useRef(true);

 useEffect(() => { return () => { mountedRef.current = false; }; }, []);

 const ICONS: { value: string; label: string }[] = useMemo(() => [
 { value: 'folder', label: t('icon_folder') },
 { value: 'book', label: t('icon_books') },
 { value: 'star', label: t('icon_favorites') },
 { value: 'briefcase', label: t('icon_work') },
 { value: 'heart', label: t('icon_love') },
 { value: 'graduation-cap', label: t('icon_study') },
 { value: 'lightbulb', label: t('icon_ideas') },
 { value: 'bookmark', label: t('icon_to_read') },
 ], [t]);

 const loadCollections = useCallback(async () => {
 try {
  setError(false);
  const res = await api.get<{ items: Collection[] }>('/api/collections');
  if (res.success && res.data) {
  const items = res.data.items ?? (Array.isArray(res.data) ? res.data as unknown as Collection[] : []);
  setCollections(items);
  }
 } catch (err) {
  setError(true);
  console.warn('CollectionsSidebar: failed to load collections', err);
 } finally {
  setLoading(false);
 }
 }, []);

 useEffect(() => {
 let stale = false;
 loadCollections().then(() => {
  if (stale) return;
 });
 return () => { stale = true; };
 }, [loadCollections]);

 const handleCreate = async () => {
 if (!newName.trim()) return;
 setCreating(true);
 try {
  const res = await api.post<Collection>('/api/collections', {
  name: newName.trim(),
  icon: newIcon,
  color: newColor,
  });
  if (!mountedRef.current) return;
  if (res.success && res.data) {
  setCollections((prev) => [res.data as Collection, ...prev]);
  setNewName('');
  setNewIcon('folder');
  setNewColor('#f59e0b');
  setShowCreate(false);
  toast(t('collections_created'), 'success');
  }
 } catch (err) {
  console.warn('CollectionsSidebar: create failed', err);
  if (!mountedRef.current) return;
  toast(t('collections_create_failed'), 'error');
 } finally {
  if (mountedRef.current) setCreating(false);
 }
 };

 const handleDelete = async (id: string) => {
 const prev = collections;
 setCollections((cs) => cs.filter((c) => c.id !== id));
 if (activeCollectionId === id) onSelectCollection(null);
 try {
  await api.delete(`/api/collections/${id}`);
  if (!mountedRef.current) return;
  toast(t('collections_deleted'), 'success');
 } catch (err) {
  console.warn('CollectionsSidebar: delete failed', err);
  if (!mountedRef.current) return;
  setCollections(prev);
  toast(t('collections_delete_failed'), 'error');
 }
 };

 const handleRename = async (id: string) => {
 if (!editName.trim()) { setEditingId(null); return; }
 try {
  const res = await api.patch<Collection>(`/api/collections/${id}`, { name: editName.trim() });
  if (!mountedRef.current) return;
  if (res.success && res.data) {
  setCollections((prev) => prev.map((c) => (c.id === id ? (res.data as Collection) : c)));
  }
 } catch (err) {
  console.warn('CollectionsSidebar: rename failed', err);
  if (!mountedRef.current) return;
  toast(t('collections_rename_failed'), 'error');
 }
 if (mountedRef.current) setEditingId(null);
 };

 if (loading) {
 return (
  <div className="space-y-2 pr-4">
  <div className="h-5 w-24 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
  {[1, 2, 3].map((i) => (
   <div key={i} className="h-8 bg-gray-50/50 dark:bg-gray-800/50 rounded-lg animate-pulse" />
  ))}
  </div>
 );
 }

 if (error) {
 return (
  <div className="pr-2 sm:pr-4">
  <p className="text-xs text-red-500 mb-2">{t('collections_load_failed')}</p>
  <button
   onClick={loadCollections}
   className="text-xs text-primary-600 hover:text-primary-700 underline focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
  >
   {t('collections_retry')}
  </button>
  </div>
 );
 }

 return (
 <div className="pr-2 sm:pr-4">
  {/* Header */}
  <div className="flex items-center justify-between mb-3">
  <button
   onClick={() => setCollapsed((v) => !v)}
   className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-300 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
  >
   <svg aria-hidden="true" className={`w-3 h-3 transition-transform ${collapsed ? '' : 'rotate-90'}`} fill="currentColor" viewBox="0 0 20 20">
   <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
   </svg>
   {t('collections_title')}
  </button>
  <button
   onClick={() => setShowCreate((v) => !v)}
   className="p-1 rounded-md text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
   title={t('collections_new')}
   aria-label={t('collections_new')}
  >
   <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
   </svg>
  </button>
  </div>

  {!collapsed && (
  <>
   {/* Create form */}
   {showCreate && (
   <CollectionCreateForm
    newName={newName}
    newIcon={newIcon}
    newColor={newColor}
    icons={ICONS}
    creating={creating}
    onNameChange={setNewName}
    onIconChange={setNewIcon}
    onColorChange={setNewColor}
    onCreate={handleCreate}
    onCancel={() => { setShowCreate(false); setNewName(''); }}
   />
   )}

   {/* All books button */}
   <button
   onClick={() => onSelectCollection(null)}
   className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 mb-1 ${
    activeCollectionId === null
    ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 font-medium'
    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
   }`}
   >
   <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
   </svg>
   {t('collections_all_books')}
   </button>

   {/* Collection list */}
   {collections.map((col) => (
   <CollectionItem
    key={col.id}
    collection={col}
    isActive={activeCollectionId === col.id}
    isEditing={editingId === col.id}
    editName={editName}
    onSelect={() => onSelectCollection(activeCollectionId === col.id ? null : col.id, col.bookIds)}
    onEditNameChange={setEditName}
    onRename={() => handleRename(col.id)}
    onStartEdit={() => { setEditingId(col.id); setEditName(col.name); }}
    onDelete={() => handleDelete(col.id)}
    onCancelEdit={() => setEditingId(null)}
   />
   ))}

   {collections.length === 0 && !showCreate && (
   <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-2">
    {t('collections_empty')}
   </p>
   )}
  </>
  )}
 </div>
 );
});
