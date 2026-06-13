'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import type { Annotation } from '@read-pal/shared';
import { OutlinePanel } from './OutlinePanel';
import { SidebarHeader } from './SidebarHeader';
import { SidebarBackdrop } from './SidebarBackdrop';
import { AnnotationSearchBar } from './AnnotationSearchBar';
import { AnnotationList } from './AnnotationList';
import { TagFilterChips } from './TagFilterChips';
import { FilterTabs, type FilterTab } from './FilterTabs';
import { BulkActionBar } from './BulkActionBar';
import { useAnnotationFilters } from './useAnnotationFilters';

const ShareDialog = dynamic(() => import('./ShareDialog').then((m) => ({ default: m.ShareDialog })), {
 ssr: false,
});
const ExportPreviewModal = dynamic(() => import('./ExportPreviewModal').then((m) => ({ default: m.ExportPreviewModal })), {
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

export const AnnotationsSidebar = React.memo(function AnnotationsSidebar({
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
 const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

 const handleToggleViewMode = useCallback(() => setViewMode((v) => v === 'list' ? 'outline' : 'list'), []);
 const handleToggleBulkMode = useCallback(() => setBulkMode((v) => !v), []);
 const handleShowShareDialog = useCallback(() => setShowShareDialog(true), []);
 const handleShowExportModal = useCallback(() => setShowExportModal(true), []);
 const handleClearTags = useCallback(() => setSelectedTags([]), []);
 const handleCloseExport = useCallback(() => setShowExportModal(false), []);
 const handleCloseShare = useCallback(() => setShowShareDialog(false), []);

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

 const { filtered, tagCounts, uniqueTags, counts } = useAnnotationFilters({
 annotations,
 activeTab,
 searchQuery,
 selectedTags,
 });

 const toggleTag = useCallback((tag: string) => {
 setSelectedTags((prev) =>
  prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
 );
 }, []);

 const toggleSelect = useCallback((id: string) => {
 setSelectedIds((prev) => {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
 });
 }, []);

 const selectAll = useCallback(() => setSelectedIds(new Set(filtered.map((a) => a.id))), [filtered]);
 const deselectAll = useCallback(() => setSelectedIds(new Set()), []);

 const bulkDelete = useCallback(() => {
 for (const id of selectedIds) onDeleteAnnotation(id);
 setSelectedIds(new Set());
 setBulkMode(false);
 setConfirmBulkDelete(false);
 }, [selectedIds, onDeleteAnnotation]);

 const requestBulkDelete = useCallback(() => {
 setConfirmBulkDelete(true);
 }, []);

 const exitBulkMode = useCallback(() => {
 setBulkMode(false);
 setSelectedIds(new Set());
 setConfirmBulkDelete(false);
 }, []);

 const handleCancelBulkDelete = useCallback(() => setConfirmBulkDelete(false), []);

 return (
 <>
  <SidebarBackdrop visible={isOpen} onClose={onClose} />

  {/* Sidebar */}
  <div
  role="dialog"
  aria-modal="true"
  aria-label={t("sidebar_annotations")}
  tabIndex={-1}
  onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
  className={`fixed right-0 top-[61px] bottom-0 w-full md:w-[360px] bg-surface-0 border-l border-surface-3 shadow-lg z-30 transform transition-transform duration-300 ease-out overflow-hidden flex flex-col overscroll-contain ${
   isOpen ? 'translate-x-0' : 'translate-x-full'
  }`}
  >
  <SidebarHeader
   annotationCount={annotations.length}
   viewMode={viewMode}
   bulkMode={bulkMode}
   onClose={onClose}
   onToggleViewMode={handleToggleViewMode}
   onToggleBulkMode={handleToggleBulkMode}
   onShowShareDialog={handleShowShareDialog}
   onShowExportModal={handleShowExportModal}
  />

  <AnnotationSearchBar value={searchQuery} onChange={setSearchQuery} />

  <TagFilterChips
   tags={uniqueTags}
   tagCounts={tagCounts}
   selectedTags={selectedTags}
   onToggleTag={toggleTag}
   onClearTags={handleClearTags}
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
   confirmDelete={confirmBulkDelete}
   onBulkDelete={requestBulkDelete}
   onConfirmBulkDelete={bulkDelete}
   onCancelBulkDelete={handleCancelBulkDelete}
   onSelectAll={selectAll}
   onDeselectAll={deselectAll}
   onExitBulkMode={exitBulkMode}
   />
  )}

  {/* Content */}
  {viewMode === 'outline' ? (
   <OutlinePanel
   annotations={filtered}
   onScrollToAnnotation={onScrollToAnnotation}
   />
  ) : (
   <div role="tabpanel" className="flex-1 overflow-y-auto p-3 space-y-2">
   <AnnotationList
    annotations={filtered}
    activeTab={activeTab}
    bulkMode={bulkMode}
    selectedIds={selectedIds}
    bookTitle={bookTitle}
    author={author}
    onDelete={onDeleteAnnotation}
    onUpdate={onUpdateAnnotation}
    onScrollToAnnotation={onScrollToAnnotation}
    onToggleSelect={toggleSelect}
   />
   </div>
  )}
  </div>

  {/* Export modal */}
  {showExportModal && (
  <ExportPreviewModal
   bookId={bookId}
   bookTitle={bookTitle}
   availableTags={uniqueTags}
   onClose={handleCloseExport}
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
   onClose={handleCloseShare}
  />
  )}
 </>
 );
});
