'use client';

import { useState, useRef, useEffect } from 'react';

interface NotePopoverProps {
  selectedText: string;
  onSave: (note: string) => void;
  onCancel: () => void;
}

export function NotePopover({ selectedText, onSave, onCancel }: NotePopoverProps) {
  const [note, setNote] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (note.trim()) {
      onSave(note.trim());
    }
  };

  return (
    <div className="mt-2 w-80 max-w-[90vw] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg animate-scale-in p-4">
      {/* Selected text quote */}
      <blockquote className="border-l-2 border-primary-500 pl-3 py-1 text-sm italic text-gray-600 dark:text-gray-400 mb-3 line-clamp-3">
        {selectedText}
      </blockquote>

      <form onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Write your note..."
          className="input mb-3 text-sm"
          rows={3}
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-ghost text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!note.trim()}
            className="btn btn-primary text-sm disabled:opacity-50"
          >
            Save Note
          </button>
        </div>
      </form>
    </div>
  );
}
