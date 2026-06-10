'use client';

import React, { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { type Annotation, ANNOTATION_COLORS } from '@read-pal/shared';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';
const PRESET_TAGS = ['discuss', 'important', 'question', 'key-idea', 'surprising', 'disagree', 'quote', 'follow-up'];

interface AnnotationEditFormProps {
 annotation: Annotation;
 borderColor: string;
 onUpdate: (updated: Annotation) => void;
 onCancel: () => void;
}

export const AnnotationEditForm = React.memo(function AnnotationEditForm({ annotation, borderColor, onUpdate, onCancel }: AnnotationEditFormProps) {
 const t = useTranslations('reader');
 const tc = useTranslations('common');
 const { toast } = useToast();
 const [editNote, setEditNote] = useState(annotation.note || '');
 const [editColor, setEditColor] = useState(annotation.color || '');
 const [editTags, setEditTags] = useState<string[]>(annotation.tags || []);
 const [tagInput, setTagInput] = useState('');
 const [saving, setSaving] = useState(false);
 const tagInputRef = useRef<HTMLInputElement>(null);

 const handleSave = async () => {
 setSaving(true);
 try {
  const updates: Record<string, unknown> = {};
  if (editNote !== (annotation.note || '')) updates.note = editNote;
  if (editColor !== (annotation.color || '')) updates.color = editColor;
  const sortedEdit = [...editTags].sort();
  const sortedOrig = [...(annotation.tags || [])].sort();
  if (sortedEdit.join(',') !== sortedOrig.join(',')) updates.tags = editTags;

  if (Object.keys(updates).length > 0) {
  const res = await api.patch<Annotation>(
   `/api/annotations/${annotation.id}`,
   updates,
  );
  if (res.success && res.data) {
   onUpdate(res.data);
  }
  }
  onCancel();
 } catch (error) {
  console.warn('AnnotationEditForm: save failed', error);
  toast(t('card_failed_save'), 'error');
 }
 setSaving(false);
 };

 const addTag = (tag: string) => {
 const val = tag.trim().toLowerCase();
 if (val && !editTags.includes(val) && editTags.length < 10) {
  setEditTags([...editTags, val]);
 }
 setTagInput('');
 };

 const removeTag = (tag: string) => {
 setEditTags(editTags.filter((t) => t !== tag));
 };

 const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
 if (e.key === 'Enter' && tagInput.trim()) {
  e.preventDefault();
  addTag(tagInput);
 } else if (e.key === 'Backspace' && !tagInput && editTags.length > 0) {
  setEditTags(editTags.slice(0, -1));
 }
 };

 const filteredPresets = PRESET_TAGS.filter(
 (p) => !editTags.includes(p) && p.includes(tagInput.toLowerCase()),
 );

 return (
 <div
  className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border-l-4 border-amber-400 shadow-sm"
  style={{ borderLeftColor: editColor || borderColor }}
  onClick={(e) => e.stopPropagation()}
 >
  {/* Color picker */}
  <div className="flex items-center gap-1.5 mb-2">
  {ANNOTATION_COLORS.map((c) => (
   <button
   key={c}
   onClick={() => setEditColor(c)}
   aria-label={t('card_color_aria', { color: c })}
   className={`w-6 h-6 rounded-full border-2 transition-transform ${
    editColor === c ? 'scale-125 border-gray-800 dark:border-white' : 'border-transparent hover:scale-110'
   }`}
   style={{ backgroundColor: c, minWidth: 24, minHeight: 24 }}
   />
  ))}
  </div>

  {/* Content (read-only) */}
  <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3 leading-relaxed mb-2">
  {annotation.content}
  </p>

  {/* Editable note */}
  <textarea
  value={editNote}
  onChange={(e) => setEditNote(e.target.value)}
  placeholder={t('card_add_note')}
  aria-label={t('card_add_note')}
  className="w-full px-2.5 py-1.5 rounded-md bg-white/50 dark:bg-gray-800/50 text-xs text-gray-700 dark:text-gray-300 border border-surface-3 focus:ring-1 focus:ring-amber-400 focus:border-amber-400 resize-none"
  rows={2}
  autoFocus
  />

  {/* Tags editor */}
  <div className="mt-2">
  <div className="flex flex-wrap gap-1 mb-1.5">
   {editTags.map((tag) => (
   <span
    key={tag}
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
   >
    #{tag}
    <button
    onClick={() => removeTag(tag)}
    className="min-w-[44px] min-h-[44px] flex items-center justify-center -m-2 p-2 hover:text-red-500 transition-colors"
    aria-label={t('remove_tag_aria', { tag })}
    >
    <svg aria-hidden="true" className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
    </button>
   </span>
   ))}
  </div>
  <div className="relative">
   <input
   ref={tagInputRef}
   value={tagInput}
   onChange={(e) => setTagInput(e.target.value)}
   onKeyDown={handleTagKeyDown}
   placeholder={editTags.length === 0 ? t('card_add_tags') : t('card_add_tag')}
   aria-label={editTags.length === 0 ? t('card_add_tags') : t('card_add_tag')}
   className="w-full px-2.5 py-1 rounded-md bg-white/50 dark:bg-gray-800/50 text-xs text-gray-700 dark:text-gray-300 border border-surface-3 focus:ring-1 focus:ring-amber-400 focus:border-amber-400 placeholder-gray-400 dark:placeholder-gray-500"
   />
   {tagInput && filteredPresets.length > 0 && (
   <div className="absolute top-full left-0 right-0 mt-1 bg-surface-0 border border-surface-3 rounded-md shadow-sm z-10 max-h-24 overflow-y-auto">
    {filteredPresets.map((preset) => (
    <button
     key={preset}
     onMouseDown={(e) => { e.preventDefault(); addTag(preset); }}
     aria-label={t('add_tag_aria', { tag: preset })}
     className="w-full px-2.5 py-1 text-left text-xs text-gray-600 dark:text-gray-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
    >
     #{preset}
    </button>
    ))}
   </div>
   )}
  </div>
  {editTags.length === 0 && !tagInput && (
   <div className="flex flex-wrap gap-1 mt-1.5">
   {PRESET_TAGS.slice(0, 4).map((preset) => (
    <button
    key={preset}
    onClick={() => addTag(preset)}
    aria-label={t('add_tag_aria', { tag: preset })}
    className="px-1.5 py-0.5 rounded text-[10px] text-gray-400 dark:text-gray-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors border border-dashed border-surface-3"
    >
    +{preset}
    </button>
   ))}
   </div>
  )}
  </div>

  {/* Save / Cancel */}
  <div className="flex items-center gap-2 mt-2">
  <button
   onClick={handleSave}
   disabled={saving}
   className="px-3 py-1 rounded-md bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
  >
   {saving ? t('card_saving') : t('card_save')}
  </button>
  <button
   onClick={onCancel}
   className="px-3 py-1 rounded-md bg-surface-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-surface-2 transition-colors"
  >
   {tc('cancel')}
  </button>
  </div>
 </div>
 );
});
