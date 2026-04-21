'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { api } from '@/lib/api';
import { analytics } from '@/lib/analytics';
import type { Chapter, Annotation } from '@read-pal/shared';

interface AnnotationActionsOptions {
  bookId: string;
  currentChapter: number;
  chapters: Chapter[];
  contentRef: React.RefObject<HTMLElement | null>;
  selectionRange: Range | null;
  annotations: Annotation[];
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
  toastError: (msg: string) => void;
  toast: {
    failed_load_annotations: string;
    failed_save_highlight: string;
    failed_save_note: string;
    failed_remove_bookmark: string;
    failed_add_bookmark: string;
    failed_delete_annotation: string;
    failed_save_progress: string;
  };
}

function computeOffsets(range: Range, container: HTMLElement): { start: number; end: number } {
  try {
    const preRange = document.createRange();
    preRange.selectNodeContents(container);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    const end = start + range.toString().length;
    return { start, end };
  } catch {
    return { start: 0, end: range.toString().length };
  }
}

export function useAnnotationActions(options: AnnotationActionsOptions) {
  const {
    bookId, currentChapter, chapters, contentRef, selectionRange,
    annotations, setAnnotations, toastError, toast,
  } = options;

  const loadAnnotations = useCallback(async () => {
    try {
      const result = await api.get<Annotation[]>('/api/annotations', { book_id: bookId });
      if (result.success && result.data) {
        const data = result.data;
        setAnnotations(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load annotations:', err);
      toastError(toast.failed_load_annotations);
    }
  }, [bookId, setAnnotations, toastError, toast.failed_load_annotations]);

  const dismissSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
  }, []);

  const handleAddHighlight = useCallback(async (text: string, color: string, tags?: string[]) => {
    try {
      const chapter = chapters[currentChapter];
      if (!chapter) return;
      const offsets = selectionRange && contentRef.current
        ? computeOffsets(selectionRange, contentRef.current)
        : { start: 0, end: text.length };

      const result = await api.post<Annotation>('/api/annotations', {
        bookId, type: 'highlight', content: text, color,
        tags: tags || [],
        location: { chapterId: chapter.id, pageIndex: currentChapter, position: 0, selection: offsets },
      });

      if (result.success && result.data) {
        setAnnotations((prev) => [...prev, result.data!]);
        analytics.track('annotation_created', { type: 'highlight' });
      }
    } catch (err) {
      console.error('Failed to add highlight:', err);
      toastError(toast.failed_save_highlight);
    }
    dismissSelection();
  }, [bookId, currentChapter, chapters, selectionRange, contentRef, setAnnotations, toastError, toast.failed_save_highlight, dismissSelection]);

  const handleAddNote = useCallback(async (text: string, note: string) => {
    try {
      const chapter = chapters[currentChapter];
      if (!chapter) return;
      const offsets = selectionRange && contentRef.current
        ? computeOffsets(selectionRange, contentRef.current)
        : { start: 0, end: text.length };

      const result = await api.post<Annotation>('/api/annotations', {
        bookId, type: 'note', content: text, note,
        location: { chapterId: chapter.id, pageIndex: currentChapter, position: 0, selection: offsets },
      });

      if (result.success && result.data) {
        setAnnotations((prev) => [...prev, result.data!]);
        analytics.track('annotation_created', { type: 'note' });
      }
    } catch (err) {
      console.error('Failed to add note:', err);
      toastError(toast.failed_save_note);
    }
    dismissSelection();
  }, [bookId, currentChapter, chapters, selectionRange, contentRef, setAnnotations, toastError, toast.failed_save_note, dismissSelection]);

  const handleToggleBookmark = useCallback(async () => {
    const isBookmarked = annotations.some(
      (a) => a.type === 'bookmark' && a.location?.pageIndex === currentChapter,
    );
    if (isBookmarked) {
      const bookmark = annotations.find(
        (a) => a.type === 'bookmark' && a.location?.pageIndex === currentChapter,
      );
      if (bookmark) {
        try {
          await api.delete(`/api/annotations/${bookmark.id}`);
          setAnnotations((prev) => prev.filter((a) => a.id !== bookmark.id));
        } catch (err) {
          console.error('Failed to remove bookmark:', err);
          toastError(toast.failed_remove_bookmark);
        }
      }
    } else {
      try {
        const chapter = chapters[currentChapter];
        const result = await api.post<Annotation>('/api/annotations', {
          bookId, type: 'bookmark',
          content: `Bookmark: ${chapter.title}`,
          location: { chapterId: chapter.id, pageIndex: currentChapter, position: 0, selection: { start: 0, end: 0 } },
        });
        if (result.success && result.data) {
          setAnnotations((prev) => [...prev, result.data!]);
          analytics.track('annotation_created', { type: 'bookmark' });
        }
      } catch (err) {
        console.error('Failed to add bookmark:', err);
        toastError(toast.failed_add_bookmark);
      }
    }
  }, [annotations, currentChapter, bookId, chapters, setAnnotations, toastError, toast.failed_remove_bookmark, toast.failed_add_bookmark]);

  const handleDeleteAnnotation = useCallback(async (id: string) => {
    try {
      await api.delete(`/api/annotations/${id}`);
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error('Failed to delete annotation:', err);
      toastError(toast.failed_delete_annotation);
    }
  }, [setAnnotations, toastError, toast.failed_delete_annotation]);

  const handleScrollToAnnotation = useCallback((annotation: Annotation) => {
    const mark = contentRef.current?.querySelector(`[data-annotation-id="${annotation.id}"]`);
    if (mark) {
      mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const original = (mark as HTMLElement).style.backgroundColor;
      (mark as HTMLElement).style.backgroundColor = 'rgba(217, 119, 6, 0.5)';
      setTimeout(() => { (mark as HTMLElement).style.backgroundColor = original; }, 1500);
    }
  }, [contentRef]);

  const handleUpdateAnnotation = useCallback((updated: Annotation) => {
    setAnnotations((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }, [setAnnotations]);

  // Derived counts
  const highlightCount = useMemo(
    () => annotations.filter((a) => a.type === 'highlight' && a.location?.pageIndex === currentChapter).length,
    [annotations, currentChapter],
  );
  const bookmarkCount = useMemo(() => annotations.filter((a) => a.type === 'bookmark').length, [annotations]);
  const totalHighlights = useMemo(() => annotations.filter((a) => a.type === 'highlight').length, [annotations]);
  const totalNotes = useMemo(() => annotations.filter((a) => a.type === 'note').length, [annotations]);
  const isBookmarked = useMemo(
    () => annotations.some((a) => a.type === 'bookmark' && a.location?.pageIndex === currentChapter),
    [annotations, currentChapter],
  );

  return {
    loadAnnotations,
    dismissSelection,
    handleAddHighlight,
    handleAddNote,
    handleToggleBookmark,
    handleDeleteAnnotation,
    handleScrollToAnnotation,
    handleUpdateAnnotation,
    highlightCount,
    bookmarkCount,
    totalHighlights,
    totalNotes,
    isBookmarked,
  };
}
