'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import type { Annotation } from '@read-pal/shared';
import { AnnotationCard } from './AnnotationCard';
import { ExportPreviewModal } from './ExportPreviewModal';
import { OutlinePanel } from './OutlinePanel';
import { SidebarHeader } from './SidebarHeader';
import { TagFilterChips } from './TagFilterChips';
import { FilterTabs, type FilterTab } from './FilterTabs';
import { BulkActionBar } from './BulkActionBar';

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

type ViewMode = 'list' | 'outline';

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
  const t = useTranslations('reader');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [showExportModal, setShowExportModal] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('list');

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
      (a.tags || []).some((tag) => tag.toLowerCase().includes(q))
    );
  }).filter((a) => {
    if (selectedTags.length === 0) return true;
    return selectedTags.some((tag) => (a.tags || []).includes(tag));
  });

  // Extract unique tags from current annotations
  const tagCounts: Record<string, number> = {};
  for (const a of annotations) {
    for (const tag of a.tags || []) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
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

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(filtered.map((a) => a.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const bulkDelete = () => {
    for (const id of selectedIds) onDeleteAnnotation(id);
    setSelectedIds(new Set());
    setBulkMode(false);
  };

  const exitBulkMode = () => {
    setBulkMode(false);
    setSelectedIds(new Set());
  };

  const counts = useMemo(() => {
    const c: Record<FilterTab, number> = { all: 0, highlight: 0, note: 0, bookmark: 0 };
    for (const a of annotations) {
      c.all++;
      if (a.type === 'highlight' || a.type === 'note' || a.type === 'bookmark') {
        c[a.type as FilterTab]++;
      }
    }
    return c;
  }, [annotations]);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 animate-fade-in z-30"
          onClick={onClose}
          onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
          tabIndex={-1}
          role="button"
          aria-label={t('sidebar_close_annotations')}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed right-0 top-[61px] bottom-0 w-full md:w-[360px] bg-surface-0 border-l border-gray-200 dark:border-gray-700 shadow-lg z-30 transform transition-transform duration-300 ease-out overflow-hidden flex flex-col overscroll-contain ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <SidebarHeader
          annotationCount={annotations.length}
          viewMode={viewMode}
          bulkMode={bulkMode}
          onClose={onClose}
          onToggleViewMode={() => setViewMode((v) => v === 'list' ? 'outline' : 'list')}
          onToggleBulkMode={() => setBulkMode((v) => !v)}
          onShowShareDialog={() => setShowShareDialog(true)}
          onShowExportModal={() => setShowExportModal(true)}
        />

        {/* Search */}
        <div className="px-3 pt-3 pb-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('sidebar_search_annotations')}
            aria-label={t('sidebar_search_annotations')}
            className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-1 focus:ring-amber-400/50 focus:border-amber-400 transition-all"
          />
        </div>

        <TagFilterChips
          tags={uniqueTags}
          tagCounts={tagCounts}
          selectedTags={selectedTags}
          onToggleTag={toggleTag}
          onClearTags={() => setSelectedTags([])}
        />

        {viewMode === 'list' && (
          <FilterTabs
            activeTab={activeTab}
            counts={counts}
            onTabChange={setActiveTab}
          />
        )}

        {viewMode === 'list' && bulkMode && (
          <BulkActionBar
            selectedCount={selectedIds.size}
            totalCount={filtered.length}
            onBulkDelete={bulkDelete}
            onSelectAll={selectAll}
            onDeselectAll={deselectAll}
            onExitBulkMode={exitBulkMode}
          />
        )}

        {/* Content */}
        {viewMode === 'outline' ? (
          <OutlinePanel
            annotations={filtered}
            bookTitle={bookTitle}
            onScrollToAnnotation={onScrollToAnnotation}
          />
        ) : (
        <div role="tabpanel" className="flex-1 overflow-y-auto p-3 space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl opacity-30 mb-3">
                {activeTab === 'bookmark' ? '\u{1F516}' : activeTab === 'note' ? '\u{1F4DD}' : activeTab === 'highlight' ? '\u{1F58D}' : '\u{1F4CB}'}
              </div>
              <p className="text-sm text-amber-700/50 dark:text-amber-400/40">
                {activeTab === 'all'
                  ? t('sidebar_empty_all')
                  : activeTab === 'highlight'
                  ? t('sidebar_empty_highlights')
                  : activeTab === 'note'
                  ? t('sidebar_empty_notes')
                  : t('sidebar_empty_bookmarks')}
              </p>
            </div>
          ) : (
            filtered.map((annotation) => (
              <div key={annotation.id} className="relative">
                {bulkMode && (
                  <div className="absolute top-3 left-2 z-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(annotation.id)}
                      onChange={() => toggleSelect(annotation.id)}
                      aria-label={t('sidebar_select_annotation')}
                      className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-400 cursor-pointer"
                    />
                  </div>
                )}
                <div className={bulkMode ? 'pl-7' : ''}>
                  <AnnotationCard
                    annotation={annotation}
                    bookTitle={bookTitle}
                    author={author}
                    onDelete={() => onDeleteAnnotation(annotation.id)}
                    onUpdate={(updated) => onUpdateAnnotation(updated)}
                    onClick={bulkMode ? () => toggleSelect(annotation.id) : () => onScrollToAnnotation(annotation)}
                  />
                </div>
              </div>
            ))
          )}
        </div>
        )}
      </div>

      {/* Export modal */}
      {showExportModal && (
        <ExportPreviewModal
          bookId={bookId}
          bookTitle={bookTitle}
          availableTags={uniqueTags}
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
