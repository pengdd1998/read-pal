'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { api } from '@/lib/api';
import { analytics } from '@/lib/analytics';
import type { Chapter, Annotation } from '@read-pal/shared';

interface AnnotationActionsOptions {
  bookId: string;
  currentChapter: number;
  chapters: Chapter[];
  contentRef: React.RefObject<HTMLElement | null>;
  selectionRange: Range | null;
  selectionOffsets: { start: number; end: number } | null;
  annotations: Annotation[];
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
  onChapterChange?: (chapterIndex: number) => Promise<void>;
  toastError: (msg: string) => void;
  toast: {
    failed_load_annotations: string;
    failed_save_highlight: string;
    failed_save_note: string;
    failed_remove_bookmark: string;
    failed_add_bookmark: string;
    failed_delete_annotation: string;
    failed_update_annotation: string;
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
  } catch (err) {
    console.warn('computeOffsets: range computation failed, using fallback', err);
    return { start: 0, end: range.toString().length };
  }
}

export function useAnnotationActions(options: AnnotationActionsOptions) {
  const {
    bookId, currentChapter, chapters, contentRef, selectionRange,
    selectionOffsets, annotations, setAnnotations, onChapterChange, toastError, toast,
  } = options;

  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCreatingRef = useRef(false);
  const mountedRef = useRef(true);

  const loadAnnotations = useCallback(async () => {
    try {
      const result = await api.get<Annotation[]>('/api/annotations', { book_id: bookId });
      if (result.success && result.data) {
        const data = result.data;
        if (mountedRef.current) setAnnotations(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.warn('AnnotationActions: failed to load annotations', e);
      if (mountedRef.current) toastError(toast.failed_load_annotations);
    }
  }, [bookId, setAnnotations, toastError, toast.failed_load_annotations]);

  const dismissSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
  }, []);

  const handleAddHighlight = useCallback(async (text: string, color: string, tags?: string[]) => {
    if (isCreatingRef.current) return;
    isCreatingRef.current = true;
    try {
      const chapter = chapters[currentChapter];
      if (!chapter) return;
      const offsets = selectionOffsets || (selectionRange && contentRef.current
        ? computeOffsets(selectionRange, contentRef.current)
        : { start: 0, end: text.length });

      const location = { chapterId: chapter.id, pageIndex: currentChapter, position: 0, selection: offsets };
      const result = await api.post<Annotation>('/api/annotations', {
        book_id: bookId, type: 'highlight', content: text, color,
        tags: tags || [],
        location,
      });

      if (result.success) {
        const annotation = result.data || {
          id: `offline-${Date.now()}`,
          userId: '',
          bookId,
          type: 'highlight' as const,
          content: text,
          color,
          tags: tags || [],
          location,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        setAnnotations((prev) => [...prev, annotation]);
        analytics.track('annotation_created', { type: 'highlight' });
      }
    } catch (e) {
      console.warn('AnnotationActions: failed to save highlight', e);
      toastError(toast.failed_save_highlight);
    }
    dismissSelection();
    isCreatingRef.current = false;
  }, [bookId, currentChapter, chapters, selectionRange, selectionOffsets, contentRef, setAnnotations, toastError, toast.failed_save_highlight, dismissSelection]);

  const handleAddNote = useCallback(async (text: string, note: string, tags?: string[]) => {
    try {
      const chapter = chapters[currentChapter];
      if (!chapter) return;
      const offsets = selectionOffsets || (selectionRange && contentRef.current
        ? computeOffsets(selectionRange, contentRef.current)
        : { start: 0, end: text.length });

      const location = { chapterId: chapter.id, pageIndex: currentChapter, position: 0, selection: offsets };
      const result = await api.post<Annotation>('/api/annotations', {
        book_id: bookId, type: 'note', content: text, note,
        tags: tags || [],
        location,
      });

      if (result.success) {
        const annotation = result.data || {
          id: `offline-${Date.now()}`,
          userId: '',
          bookId,
          type: 'note' as const,
          content: text,
          note,
          tags: tags || [],
          location,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        setAnnotations((prev) => [...prev, annotation]);
        analytics.track('annotation_created', { type: 'note' });
      }
    } catch (e) {
      console.warn('AnnotationActions: failed to save note', e);
      toastError(toast.failed_save_note);
    }
    dismissSelection();
  }, [bookId, currentChapter, chapters, selectionRange, selectionOffsets, contentRef, setAnnotations, toastError, toast.failed_save_note, dismissSelection]);

  const handleToggleBookmark = useCallback(async () => {
    const isBookmarked = annotations.some(
      (a) => a.type === 'bookmark' && Number(a.location?.pageIndex) === currentChapter,
    );
    if (isBookmarked) {
      const bookmark = annotations.find(
        (a) => a.type === 'bookmark' && Number(a.location?.pageIndex) === currentChapter,
      );
      if (bookmark) {
        // Optimistic delete with functional rollback
        const removedId = bookmark.id;
        setAnnotations((p) => p.filter((a) => a.id !== removedId));
        try {
          await api.delete(`/api/annotations/${removedId}`);
        } catch (e) {
          console.warn('AnnotationActions: failed to remove bookmark', e);
          setAnnotations((p) => [...p, annotations.find((a) => a.id === removedId)!].filter(Boolean));
          toastError(toast.failed_remove_bookmark);
        }
      }
    } else {
      try {
        const chapter = chapters[currentChapter];
        const location = { chapterId: chapter.id, pageIndex: currentChapter, position: 0, selection: { start: 0, end: 0 } };
        const result = await api.post<Annotation>('/api/annotations', {
          book_id: bookId, type: 'bookmark',
          content: `Bookmark: ${chapter.title}`,
          location,
        });
        if (result.success) {
          const annotation = result.data || {
            id: `offline-${Date.now()}`,
            userId: '',
            bookId,
            type: 'bookmark' as const,
            content: `Bookmark: ${chapter.title}`,
            location,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          setAnnotations((prev) => [...prev, annotation]);
          analytics.track('annotation_created', { type: 'bookmark' });
        }
      } catch (e) {
        console.warn('AnnotationActions: failed to add bookmark', e);
        toastError(toast.failed_add_bookmark);
      }
    }
  }, [annotations, currentChapter, bookId, chapters, setAnnotations, toastError, toast.failed_remove_bookmark, toast.failed_add_bookmark]);

  const handleDeleteAnnotation = useCallback(async (id: string) => {
    // Optimistic delete — capture item for rollback before removing
    const removed = annotations.find((a) => a.id === id);
    setAnnotations((p) => p.filter((a) => a.id !== id));
    try {
      await api.delete(`/api/annotations/${id}`);
    } catch (e) {
      console.warn('AnnotationActions: failed to delete annotation', e);
      if (removed) setAnnotations((p) => [...p, removed]);
      toastError(toast.failed_delete_annotation);
    }
  }, [annotations, setAnnotations, toastError, toast.failed_delete_annotation]);

  const handleScrollToAnnotation = useCallback(async (annotation: Annotation) => {
    const targetChapter = annotation.location?.pageIndex;
    if (targetChapter != null && targetChapter !== currentChapter && onChapterChange) {
      await onChapterChange(targetChapter);
      // Wait for chapter content to render before querying
      await new Promise<void>((r) => setTimeout(r, 300));
    }
    const mark = contentRef.current?.querySelector(`[data-annotation-id="${annotation.id}"]`);
    if (mark) {
      mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const original = (mark as HTMLElement).style.backgroundColor;
      (mark as HTMLElement).style.backgroundColor = 'rgba(217, 119, 6, 0.5)';
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => {
        (mark as HTMLElement).style.backgroundColor = original;
        highlightTimerRef.current = null;
      }, 1500);
    }
  }, [contentRef, currentChapter, onChapterChange]);

  const handleUpdateAnnotation = useCallback(async (updated: Annotation) => {
    const prev = annotations;
    setAnnotations((p) => p.map((a) => (a.id === updated.id ? updated : a)));
    try {
      await api.patch(`/api/annotations/${updated.id}`, updated as unknown as Record<string, unknown>);
    } catch (e) {
      console.warn('AnnotationActions: failed to update annotation', e);
      setAnnotations(prev);
      toastError(toast.failed_update_annotation);
    }
  }, [annotations, setAnnotations, toastError, toast.failed_update_annotation]);

  // Derived counts
  const highlightCount = useMemo(
    () => annotations.filter((a) => a.type === 'highlight' && a.location?.pageIndex === currentChapter).length,
    [annotations, currentChapter],
  );
  const bookmarkCount = useMemo(() => annotations.filter((a) => a.type === 'bookmark').length, [annotations]);
  const totalHighlights = useMemo(() => annotations.filter((a) => a.type === 'highlight').length, [annotations]);
  const totalNotes = useMemo(() => annotations.filter((a) => a.type === 'note').length, [annotations]);
  const isBookmarked = useMemo(
    () => annotations.some((a) => a.type === 'bookmark' && Number(a.location?.pageIndex) === currentChapter),
    [annotations, currentChapter],
  );

  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

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
