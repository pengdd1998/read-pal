'use client';

import { useState, useEffect } from 'react';
import type { Annotation } from '@read-pal/shared';
import { AnnotationCard } from './AnnotationCard';

interface AnnotationsSidebarProps {
  annotations: Annotation[];
  bookId: string;
  bookTitle?: string;
  author?: string;
  isOpen: boolean;
  onClose: () => void;
  onDeleteAnnotation: (id: string) => void;
  onUpdateAnnotation: (updated: Annotation) => void;
  onScrollToAnnotation: (annotation: Annotation) => void;
}

type FilterTab = 'all' | 'highlight' | 'note' | 'bookmark';

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'highlight', label: 'Highlights' },
  { key: 'note', label: 'Notes' },
  { key: 'bookmark', label: 'Bookmarks' },
];

export function AnnotationsSidebar({
  annotations,
  bookId,
  bookTitle,
  author,
  isOpen,
  onClose,
  onDeleteAnnotation,
  onUpdateAnnotation,
  onScrollToAnnotation,
}: AnnotationsSidebarProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [exporting, setExporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleExport = async (format: 'markdown' | 'json') => {
    try {
      setExporting(true);
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : '';
      const res = await fetch(`${baseUrl}/api/annotations/export?bookId=${bookId}&format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `annotations-${bookId}.${format === 'json' ? 'json' : 'md'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Silently fail
    } finally {
      setExporting(false);
    }
  };

  // Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const filtered = (activeTab === 'all'
    ? annotations
    : annotations.filter((a) => a.type === activeTab)
  ).filter((a) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (a.content || '').toLowerCase().includes(q) ||
      (a.note || '').toLowerCase().includes(q)
    );
  });

  const counts = {
    all: annotations.length,
    highlight: annotations.filter((a) => a.type === 'highlight').length,
    note: annotations.filter((a) => a.type === 'note').length,
    bookmark: annotations.filter((a) => a.type === 'bookmark').length,
  };

  return (
    <>
      {/* Backdrop — always visible when open, click to close */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 animate-fade-in z-30"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed right-0 top-0 h-screen w-full md:w-[360px] bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-lg z-30 transform transition-transform duration-300 ease-out overflow-hidden flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-amber-200/50 dark:border-amber-900/30">
          <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100">
            Annotations
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
            aria-label="Close annotations (Esc)"
            title="Close (Esc)"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {annotations.length > 0 && (
            <div className="relative group">
              <button
                disabled={exporting}
                className="p-2 rounded-lg text-gray-500 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors disabled:opacity-50"
                title="Export annotations"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
              <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-40">
                <button
                  onClick={() => handleExport('markdown')}
                  className="w-full px-3 py-2 text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-t-lg"
                >
                  Export as Markdown
                </button>
                <button
                  onClick={() => handleExport('json')}
                  className="w-full px-3 py-2 text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-b-lg"
                >
                  Export as JSON
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Filter tabs */}
        <div className="px-3 pt-3 pb-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search annotations..."
            className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-1 focus:ring-amber-400/50 focus:border-amber-400 transition-all"
          />
        </div>
        <div className="flex border-b border-gray-200 dark:border-gray-700 px-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors relative ${
                activeTab === tab.key
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
              {counts[tab.key] > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                  activeTab === tab.key
                    ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                }`}>
                  {counts[tab.key]}
                </span>
              )}
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary-500 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Annotations list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl opacity-30 mb-3">
                {activeTab === 'bookmark' ? '\u{1F516}' : activeTab === 'note' ? '\u{1F4DD}' : activeTab === 'highlight' ? '\u{1F58D}' : '\u{1F4CB}'}
              </div>
              <p className="text-sm text-amber-700/50 dark:text-amber-400/40">
                {activeTab === 'all'
                  ? 'No annotations yet. Select text to start highlighting.'
                  : activeTab === 'highlight'
                  ? 'No highlights yet. Select text and pick a color.'
                  : activeTab === 'note'
                  ? 'No notes yet. Select text and tap the note button.'
                  : 'No bookmarks yet. Tap the bookmark icon to save your place.'}
              </p>
            </div>
          ) : (
            filtered.map((annotation) => (
              <AnnotationCard
                key={annotation.id}
                annotation={annotation}
                bookTitle={bookTitle}
                author={author}
                onDelete={() => onDeleteAnnotation(annotation.id)}
                onUpdate={(updated) => onUpdateAnnotation(updated)}
                onClick={() => onScrollToAnnotation(annotation)}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}
