'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { warn } from '@/lib/logger';

interface BookTagEditorProps {
 bookId: string;
 tags: string[];
 onTagsChange?: (id: string, tags: string[]) => void;
}

export const BookTagEditor = React.memo(function BookTagEditor({ bookId, tags, onTagsChange }: BookTagEditorProps) {
 const t = useTranslations('library');
 const tRef = useRef(t); tRef.current = t;
 const { toast } = useToast();
 const [editingTags, setEditingTags] = useState(false);
 const [tagInput, setTagInput] = useState('');
 const [saving, setSaving] = useState(false);

 const handleAddTag = useCallback(async (e: React.KeyboardEvent) => {
 if (e.key !== 'Enter') return;
 const tag = tagInput.trim().toLowerCase();
 if (!tag || tags.includes(tag)) { setTagInput(''); return; }
 const newTags = [...tags, tag];
 setSaving(true);
 try {
  await api.put(`/api/books/${bookId}/tags`, { tags: newTags });
  onTagsChange?.(bookId, newTags);
  setTagInput('');
 } catch (error) {
  warn('BookTagEditor: add tag failed', error);
  toast(tRef.current('tag_update_failed'), 'error');
 } finally {
  setSaving(false);
 }
 }, [tagInput, tags, bookId, onTagsChange, toast]);

 const handleRemoveTag = useCallback(async (tag: string) => {
 const newTags = tags.filter((t) => t !== tag);
 setSaving(true);
 try {
  await api.put(`/api/books/${bookId}/tags`, { tags: newTags });
  onTagsChange?.(bookId, newTags);
 } catch (error) {
  warn('BookTagEditor: remove tag failed', error);
  toast(t('tag_update_failed'), 'error');
 } finally {
  setSaving(false);
 }
 }, [tags, bookId, onTagsChange]);

 return (
 <div className="flex flex-wrap gap-1 mb-2">
  {tags.map((tag) => (
  <span
   key={tag}
   className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
  >
   {tag}
   {editingTags && (
   <button type="button"
    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRemoveTag(tag); }}
    disabled={saving}
    aria-label={t('remove_tag', { tag })}
    className="ml-0.5 text-amber-400 hover:text-red-500 dark:hover:text-red-400 p-1 -m-1 min-w-[20px] min-h-[20px] flex items-center justify-center disabled:opacity-50"
   >
    {saving ? '...' : 'x'}
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
   placeholder={saving ? '...' : t('card_tag_placeholder')}
   disabled={saving}
   aria-label={t('card_add_tag')}
   className="px-1.5 py-0.5 text-[9px] rounded border border-surface-3 bg-surface-0 w-16 focus:outline-none focus:ring-1 focus:ring-amber-400 disabled:opacity-50"
   autoFocus
   onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
  />
  ) : (
  <button type="button"
   onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingTags(true); }}
   aria-label={t('card_add_tag')}
   className="px-1.5 py-0.5 rounded text-[9px] text-gray-500 dark:text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20"
  >
   {t('card_plus_tag')}
  </button>
  )}
 </div>
 );
});
