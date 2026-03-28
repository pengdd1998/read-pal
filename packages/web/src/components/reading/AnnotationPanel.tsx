'use client';

import { useState } from 'react';

interface Annotation {
  id: string;
  type: 'highlight' | 'note' | 'bookmark';
  content: string;
  color?: string;
  note?: string;
  location: {
    pageIndex: number;
    position: number;
  };
}

interface AnnotationPanelProps {
  annotations: Annotation[];
  onAddHighlight: (content: string, color: string) => void;
  onAddNote: (content: string, note: string) => void;
  onAddBookmark: (location: { pageIndex: number; position: number }) => void;
  onDeleteAnnotation: (id: string) => void;
}

const HIGHLIGHT_COLORS = ['#FFEB3B', '#FF9800', '#4CAF50', '#2196F3', '#9C27B0'];

export function AnnotationPanel({
  annotations,
  onAddHighlight,
  onAddNote,
  onAddBookmark,
  onDeleteAnnotation,
}: AnnotationPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [selectedColor, setSelectedColor] = useState(HIGHLIGHT_COLORS[0]);
  const [noteText, setNoteText] = useState('');

  const handleTextSelection = () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text) {
      setSelectedText(text);
      setIsOpen(true);
    }
  };

  const handleAddHighlight = () => {
    if (selectedText) {
      onAddHighlight(selectedText, selectedColor);
      setSelectedText('');
      setIsOpen(false);
    }
  };

  const handleAddNote = () => {
    if (selectedText && noteText.trim()) {
      onAddNote(selectedText, noteText.trim());
      setSelectedText('');
      setNoteText('');
      setIsOpen(false);
    }
  };

  const handleAddBookmark = () => {
    onAddBookmark({ pageIndex: 0, position: 0 }); // TODO: Get actual position
    setIsOpen(false);
  };

  return (
    <>
      {/* Selection Hint */}
      <div className="fixed bottom-4 right-4 z-50">
        {!isOpen && (
          <button
            onClick={handleTextSelection}
            className="btn btn-primary shadow-lg"
            title="Highlight selected text"
          >
            📝 Annotate Selection
          </button>
        )}
      </div>

      {/* Annotation Panel */}
      {isOpen && (
        <div className="fixed right-0 top-0 h-full w-96 bg-white dark:bg-gray-800 shadow-xl z-50 overflow-y-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">Add Annotation</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                ✕
              </button>
            </div>

            {selectedText && (
              <div className="mb-6">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  Selected text:
                </p>
                <blockquote className="border-l-4 border-primary-500 pl-4 italic">
                  {selectedText}
                </blockquote>
              </div>
            )}

            {/* Highlight */}
            <div className="mb-6">
              <h3 className="font-medium mb-3">Highlight</h3>
              <div className="flex gap-2 mb-3">
                {HIGHLIGHT_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setSelectedColor(color)}
                    className={`w-8 h-8 rounded border-2 ${
                      selectedColor === color
                        ? 'border-gray-900 dark:border-white'
                        : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={`Select ${color} color`}
                  />
                ))}
              </div>
              <button
                onClick={handleAddHighlight}
                className="btn btn-primary w-full"
              >
                Add Highlight
              </button>
            </div>

            {/* Note */}
            <div className="mb-6">
              <h3 className="font-medium mb-3">Add Note</h3>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Write your note here..."
                className="input mb-3"
                rows={4}
              />
              <button
                onClick={handleAddNote}
                disabled={!noteText.trim()}
                className="btn btn-primary w-full disabled:opacity-50"
              >
                Add Note
              </button>
            </div>

            {/* Bookmark */}
            <div>
              <h3 className="font-medium mb-3">Bookmark</h3>
              <button
                onClick={handleAddBookmark}
                className="btn btn-secondary w-full"
              >
                🔖 Add Bookmark
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Existing Annotations Sidebar */}
      {annotations.length > 0 && (
        <div className="fixed left-0 top-16 h-[calc(100vh-4rem)] w-80 bg-white dark:bg-gray-800 shadow-lg overflow-y-auto border-r">
          <div className="p-4">
            <h2 className="text-lg font-semibold mb-4">
              Annotations ({annotations.length})
            </h2>

            <div className="space-y-3">
              {annotations.map((annotation) => (
                <div
                  key={annotation.id}
                  className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700 border-l-4"
                  style={{
                    borderColor:
                      annotation.color || annotation.type === 'highlight'
                        ? '#FFEB3B'
                        : 'transparent',
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-medium uppercase text-gray-500">
                      {annotation.type}
                    </span>
                    <button
                      onClick={() => onDeleteAnnotation(annotation.id)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      Delete
                    </button>
                  </div>

                  <p className="text-sm line-clamp-3 mb-2">
                    {annotation.content}
                  </p>

                  {annotation.note && (
                    <div className="text-xs bg-white dark:bg-gray-600 p-2 rounded mb-2">
                      {annotation.note}
                    </div>
                  )}

                  <p className="text-xs text-gray-500">
                    Page {annotation.location.pageIndex + 1}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
