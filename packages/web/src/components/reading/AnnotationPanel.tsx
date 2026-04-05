'use client';

import { useState, useEffect } from 'react';
import { ANNOTATION_COLORS } from '@read-pal/shared';
import type { Annotation } from '@read-pal/shared';

interface AnnotationPanelProps {
  annotations: Annotation[];
  currentPageIndex: number;
  onAddHighlight: (content: string, color: string) => void;
  onAddNote: (content: string, note: string) => void;
  onAddBookmark: (location: { pageIndex: number; position: number }) => void;
  onDeleteAnnotation: (id: string) => void;
}

export function AnnotationPanel({
  annotations,
  currentPageIndex,
  onAddHighlight,
  onAddNote,
  onAddBookmark,
  onDeleteAnnotation,
}: AnnotationPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [selectedColor, setSelectedColor] = useState<string>(ANNOTATION_COLORS[0]);
  const [noteText, setNoteText] = useState('');
  const [hasSelection, setHasSelection] = useState(false);

  // Capture text selection in real-time via mouseup on the reading content
  useEffect(() => {
    const handleMouseUp = () => {
      // Small delay to let the browser finalize selection
      setTimeout(() => {
        const selection = window.getSelection();
        const text = selection?.toString().trim();
        if (text && text.length > 0) {
          setSelectedText(text);
          setHasSelection(true);
        } else {
          setHasSelection(false);
        }
      }, 10);
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const openAnnotationPanel = () => {
    // Re-read selection in case it was captured by the listener
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text) {
      setSelectedText(text);
    }
    if (selectedText || text) {
      setIsOpen(true);
    }
  };

  const handleAddHighlight = () => {
    if (selectedText) {
      onAddHighlight(selectedText, selectedColor);
      setSelectedText('');
      setHasSelection(false);
      setIsOpen(false);
    }
  };

  const handleAddNote = () => {
    if (selectedText && noteText.trim()) {
      onAddNote(selectedText, noteText.trim());
      setSelectedText('');
      setNoteText('');
      setHasSelection(false);
      setIsOpen(false);
    }
  };

  const handleAddBookmark = () => {
    onAddBookmark({ pageIndex: currentPageIndex, position: 0 });
    setIsOpen(false);
  };

  /** Derive border color from annotation, falling back to type-based defaults. */
  function getAnnotationBorderColor(annotation: Annotation): string {
    if (annotation.color) return annotation.color;
    switch (annotation.type) {
      case 'highlight': return ANNOTATION_COLORS[0]; // yellow
      case 'note': return ANNOTATION_COLORS[3]; // blue
      case 'bookmark': return ANNOTATION_COLORS[4]; // purple
      default: return 'transparent';
    }
  }

  return (
    <>
      {/* Annotate button */}
      <div className="fixed bottom-4 right-4 z-50 flex gap-2">
        {annotations.length > 0 && !isOpen && (
          <button
            onClick={() => setShowAnnotations(!showAnnotations)}
            className="btn btn-secondary shadow-lg"
            title="View annotations"
          >
            {'\uD83D\uDCCB'} {annotations.length}
          </button>
        )}
        {!isOpen && (
          <button
            onClick={openAnnotationPanel}
            className={`btn shadow-lg transition-all duration-200 ${
              hasSelection
                ? 'btn-primary ring-2 ring-primary-300 ring-offset-2'
                : 'btn-secondary opacity-70'
            }`}
            title={hasSelection ? 'Annotate selected text' : 'Select text first, then click here'}
          >
            {'\uD83D\uDCDD'} {hasSelection ? 'Annotate' : 'Select text'}
          </button>
        )}
      </div>

      {/* Annotation Panel */}
      {isOpen && (
        <div className="fixed right-0 top-0 h-full w-full md:w-96 bg-white dark:bg-gray-800 shadow-xl z-50 overflow-y-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">Add Annotation</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                {'\u2715'}
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
                {ANNOTATION_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setSelectedColor(color)}
                    className={`w-8 h-8 rounded border-2 transition-colors ${
                      selectedColor === color
                        ? 'border-gray-900 dark:border-white ring-2 ring-primary-300'
                        : 'border-transparent hover:border-gray-400'
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={`Select color ${color}`}
                  />
                ))}
              </div>
              <button
                onClick={handleAddHighlight}
                disabled={!selectedText}
                className="btn btn-primary w-full disabled:opacity-50"
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
                disabled={!selectedText || !noteText.trim()}
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
                {'\uD83D\uDD16'} Add Bookmark
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Existing Annotations Sidebar */}
      {showAnnotations && annotations.length > 0 && (
        <div className="fixed left-0 top-0 h-full w-full md:top-16 md:h-[calc(100vh-4rem)] md:w-80 bg-white dark:bg-gray-800 shadow-lg overflow-y-auto z-40 md:border-r">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4 md:justify-start md:gap-4">
              <h2 className="text-lg font-semibold">
                Annotations ({annotations.length})
              </h2>
              <button
                onClick={() => setShowAnnotations(false)}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 md:hidden"
              >
                {'\u2715'}
              </button>
            </div>

            <div className="space-y-3">
              {annotations.map((annotation) => (
                <div
                  key={annotation.id}
                  className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700 border-l-4"
                  style={{ borderColor: getAnnotationBorderColor(annotation) }}
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

                  {annotation.location?.pageIndex != null && (
                    <p className="text-xs text-gray-500">
                      Page {annotation.location.pageIndex + 1}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
