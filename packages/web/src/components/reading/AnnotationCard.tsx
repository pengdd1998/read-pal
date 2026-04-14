'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Annotation } from '@read-pal/shared';
import { api } from '@/lib/api';
import { renderCardToCanvas } from './QuoteCard';
import type { CardTheme } from './QuoteCard';

const TYPE_CONFIG = {
  highlight: { icon: '\u{1F58D}', label: 'Highlight', defaultColor: '#FFEB3B' },
  note: { icon: '\u{1F4DD}', label: 'Note', defaultColor: '#2196F3' },
  bookmark: { icon: '\u{1F516}', label: 'Bookmark', defaultColor: '#9C27B0' },
} as const;

const COLORS = ['#FFEB3B', '#FF9800', '#4CAF50', '#2196F3', '#9C27B0', '#F44336'];

const PRESET_TAGS = ['discuss', 'important', 'question', 'key-idea', 'surprising', 'disagree', 'quote', 'follow-up'];

interface AnnotationCardProps {
  annotation: Annotation;
  bookTitle?: string;
  author?: string;
  onDelete: () => void;
  onUpdate: (updated: Annotation) => void;
  onClick: () => void;
}

export function AnnotationCard({ annotation, bookTitle, author, onDelete, onUpdate, onClick }: AnnotationCardProps) {
  const [editing, setEditing] = useState(false);
  const [editNote, setEditNote] = useState(annotation.note || '');
  const [editColor, setEditColor] = useState(annotation.color || '');
  const [editTags, setEditTags] = useState<string[]>(annotation.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const canShareAsImage = annotation.type === 'highlight' || annotation.type === 'note';
  const quoteText = annotation.content || '';

  const handleShareAsImage = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!quoteText || sharing) return;
    setSharing(true);

    try {
      const canvas = document.createElement('canvas');
      renderCardToCanvas(
        canvas,
        quoteText,
        bookTitle || 'Unknown Book',
        author || 'Unknown Author',
        'warm',
      );

      canvas.toBlob(async (blob) => {
        if (!blob) { setSharing(false); return; }

        const file = new File([blob], 'read-pal-quote.png', { type: 'image/png' });

        // Try Web Share API with file (mobile)
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: `${bookTitle || 'Book'} — read-pal`,
              text: `"${quoteText}" — ${author || ''}`,
            });
          } catch (err) {
            // User cancelled share sheet — not an error
            if ((err as DOMException).name !== 'AbortError') {
              // Fallback: download
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'read-pal-quote.png';
              a.click();
              URL.revokeObjectURL(url);
            }
          }
        } else {
          // Desktop fallback: try clipboard, then download
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob }),
            ]);
          } catch {
            // Final fallback: download
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'read-pal-quote.png';
            a.click();
            URL.revokeObjectURL(url);
          }
        }
        setSharing(false);
      }, 'image/png');
    } catch {
      setSharing(false);
    }
  }, [quoteText, bookTitle, author, sharing]);

  const config = TYPE_CONFIG[annotation.type as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG.highlight;
  const borderColor = editing ? editColor : (annotation.color || config.defaultColor);

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
      setEditing(false);
    } catch {
      // Silently fail
    }
    setSaving(false);
  };

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditNote(annotation.note || '');
    setEditColor(annotation.color || '');
    setEditTags(annotation.tags || []);
    setTagInput('');
    setEditing(true);
  };

  const addTag = (tag: string) => {
    const t = tag.trim().toLowerCase();
    if (t && !editTags.includes(t) && editTags.length < 10) {
      setEditTags([...editTags, t]);
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
    (t) => !editTags.includes(t) && t.includes(tagInput.toLowerCase()),
  );

  if (editing) {
    return (
      <div
        className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border-l-4 border-amber-400 shadow-sm"
        style={{ borderLeftColor: editColor || borderColor }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Color picker */}
        <div className="flex items-center gap-1.5 mb-2">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setEditColor(c)}
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
          placeholder="Add a note..."
          className="w-full px-2.5 py-1.5 rounded-md bg-white dark:bg-gray-700/50 text-xs text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 focus:ring-1 focus:ring-amber-400 focus:border-amber-400 resize-none"
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
                  className="hover:text-red-500 transition-colors"
                  aria-label={`Remove tag ${tag}`}
                >
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
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
              placeholder={editTags.length === 0 ? 'Add tags (e.g. discuss, important)...' : 'Add tag...'}
              className="w-full px-2.5 py-1 rounded-md bg-white dark:bg-gray-700/50 text-xs text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 focus:ring-1 focus:ring-amber-400 focus:border-amber-400 placeholder-gray-400"
            />
            {tagInput && filteredPresets.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-sm z-10 max-h-24 overflow-y-auto">
                {filteredPresets.map((preset) => (
                  <button
                    key={preset}
                    onMouseDown={(e) => { e.preventDefault(); addTag(preset); }}
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
                  className="px-1.5 py-0.5 rounded text-[10px] text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors border border-dashed border-gray-200 dark:border-gray-700"
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
            className="px-3 py-1 rounded-md bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="px-3 py-1 rounded-md bg-gray-100 dark:bg-gray-700 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border-l-4 cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-900/10 hover:shadow-sm transition-all duration-200"
      style={{ borderLeftColor: borderColor }}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          {config.icon} {config.label}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {canShareAsImage && (
            <button
              onClick={handleShareAsImage}
              disabled={sharing}
              className="p-1 rounded text-gray-400 hover:text-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-all disabled:opacity-50"
              aria-label="Share as image"
              title="Share as quote card image"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
          )}
          <button
            onClick={startEdit}
            className="p-1 rounded text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all"
            aria-label="Edit annotation"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
            aria-label="Delete annotation"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3 leading-relaxed">
        {annotation.content}
      </p>

      {/* Note */}
      {annotation.note && (
        <div className="mt-2 px-2.5 py-1.5 rounded-md bg-white dark:bg-gray-700/50 text-xs text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600">
          {annotation.note}
        </div>
      )}

      {/* Tags */}
      {annotation.tags && annotation.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {annotation.tags.map((tag) => (
            <span
              key={tag}
              className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                tag === 'discuss'
                  ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300'
                  : tag === 'important'
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                  : tag === 'question'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Page location */}
      {annotation.location?.pageIndex != null && (
        <p className="text-[10px] text-gray-400 mt-2">
          Page {annotation.location.pageIndex + 1}
        </p>
      )}
    </div>
  );
}
