'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { Annotation } from '@read-pal/shared';
import { AnnotationCard } from './AnnotationCard';
import { ExportPreviewModal } from './ExportPreviewModal';

// ShareDialog is heavy (~400 lines + export utils) — only load when user clicks Share
const ShareDialog = dynamic(() => import('./ShareDialog').then((m) => ({ default: m.ShareDialog })), {
  ssr: false,
});

interface AnnotationsSidebarProps {
  annotations: Annotation[];
  bookId: string;
  bookTitle?: string;
  author?: string;
  totalPages?: number;
  currentPage?: number;
  progress?: number;
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
  totalPages,
  currentPage,
  progress,
  isOpen,
  onClose,
  onDeleteAnnotation,
  onUpdateAnnotation,
  onScrollToAnnotation,
}: AnnotationsSidebarProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [showExportModal, setShowExportModal] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showExportModal) setShowExportModal(false);
        else if (showShareDialog) setShowShareDialog(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, showExportModal, showShareDialog]);

  const filtered = (activeTab === 'all'
    ? annotations
    : annotations.filter((a) => a.type === activeTab)
  ).filter((a) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (a.content || '').toLowerCase().includes(q) ||
      (a.note || '').toLowerCase().includes(q) ||
      (a.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  }).filter((a) => {
    if (selectedTags.length === 0) return true;
    return selectedTags.some((tag) => (a.tags || []).includes(tag));
  });

  // Extract unique tags from current annotations
  const tagCounts: Record<string, number> = {};
  for (const a of annotations) {
    for (const t of a.tags || []) {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    }
  }
  const uniqueTags = Object.entries(tagCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([name]) => name);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const counts = useMemo(() => {
    const c = { all: 0, highlight: 0, note: 0, bookmark: 0 };
    for (const a of annotations) {
      c.all++;
      if (a.type === 'highlight' || a.type === 'note' || a.type === 'bookmark') {
        c[a.type]++;
      }
    }
    return c;
  }, [annotations]);

  return (
    <>
      {/* Backdrop — always visible when open, click to close */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 animate-fade-in z-30"
          onClick={onClose}
          onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
          tabIndex={-1}
          role="button"
          aria-label="Close annotations"
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed right-0 top-0 h-screen w-full md:w-[360px] bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-lg z-30 transform transition-transform duration-300 ease-out overflow-hidden flex flex-col overscroll-contain ${
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
            <>
              <button
                aria-label="Share & export"
                onClick={() => setShowShareDialog(true)}
                className="p-2 rounded-lg text-gray-500 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                title="Share & export"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </button>
              <button
                aria-label="Export annotations"
                onClick={() => setShowExportModal(true)}
                className="p-2 rounded-lg text-gray-500 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                title="Export annotations"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Filter tabs */}
        <div className="px-3 pt-3 pb-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search annotations..."
            aria-label="Search annotations"
            className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-1 focus:ring-amber-400/50 focus:border-amber-400 transition-all"
          />
        </div>

        {/* Tag filter chips */}
        {uniqueTags.length > 0 && (
          <div className="px-3 pt-2 pb-1">
            <div className="flex flex-wrap gap-1">
              {uniqueTags.slice(0, 8).map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium transition-all duration-150 active:scale-95 ${
                    selectedTags.includes(tag)
                      ? tag === 'discuss'
                        ? 'bg-teal-500 text-white'
                        : tag === 'important'
                        ? 'bg-red-500 text-white'
                        : tag === 'question'
                        ? 'bg-blue-500 text-white'
                        : 'bg-amber-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  #{tag}
                  <span className="ml-1 text-[9px] opacity-60">
                    {tagCounts[tag]}
                  </span>
                </button>
              ))}
              {selectedTags.length > 0 && (
                <button
                  onClick={() => setSelectedTags([])}
                  className="px-1.5 py-0.5 rounded-full text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
        <div role="tablist" aria-label="Filter annotations" className="flex border-b border-gray-200 dark:border-gray-700 px-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              role="tab"
              aria-selected={activeTab === tab.key}
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
        <div role="tabpanel" className="flex-1 overflow-y-auto p-3 space-y-2">
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

      {/* Export modal */}
      {showExportModal && (
        <ExportPreviewModal
          bookId={bookId}
          bookTitle={bookTitle}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {/* Share & export dialog */}
      {showShareDialog && (
        <ShareDialog
          annotations={annotations}
          bookId={bookId}
          bookTitle={bookTitle}
          author={author}
          totalPages={totalPages}
          currentPage={currentPage}
          progress={progress}
          onClose={() => setShowShareDialog(false)}
        />
      )}
    </>
  );
}
