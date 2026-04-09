'use client';

import { useState } from 'react';
import type { Annotation } from '@read-pal/shared';
import { api } from '@/lib/api';

const TYPE_CONFIG = {
  highlight: { icon: '\u{1F58D}', label: 'Highlight', defaultColor: '#FFEB3B' },
  note: { icon: '\u{1F4DD}', label: 'Note', defaultColor: '#2196F3' },
  bookmark: { icon: '\u{1F516}', label: 'Bookmark', defaultColor: '#9C27B0' },
} as const;

const COLORS = ['#FFEB3B', '#FF9800', '#4CAF50', '#2196F3', '#9C27B0', '#F44336'];

interface AnnotationCardProps {
  annotation: Annotation;
  onDelete: () => void;
  onUpdate: (updated: Annotation) => void;
  onClick: () => void;
}

export function AnnotationCard({ annotation, onDelete, onUpdate, onClick }: AnnotationCardProps) {
  const [editing, setEditing] = useState(false);
  const [editNote, setEditNote] = useState(annotation.note || '');
  const [editColor, setEditColor] = useState(annotation.color || '');
  const [saving, setSaving] = useState(false);

  const config = TYPE_CONFIG[annotation.type as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG.highlight;
  const borderColor = editing ? editColor : (annotation.color || config.defaultColor);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {};
      if (editNote !== (annotation.note || '')) updates.note = editNote;
      if (editColor !== (annotation.color || '')) updates.color = editColor;

      if (Object.keys(updates).length > 0) {
        const res = await api.patch<Annotation>(
          `/api/annotations/${annotation.id}`,
          updates,
        );
        if (res.success && res.data) {
          onUpdate(res.data as unknown as Annotation);
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
    setEditing(true);
  };

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
              className={`w-5 h-5 rounded-full border-2 transition-transform ${
                editColor === c ? 'scale-125 border-gray-800 dark:border-white' : 'border-transparent hover:scale-110'
              }`}
              style={{ backgroundColor: c }}
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

      {/* Page location */}
      {annotation.location?.pageIndex != null && (
        <p className="text-[10px] text-gray-400 mt-2">
          Page {annotation.location.pageIndex + 1}
        </p>
      )}
    </div>
  );
}
