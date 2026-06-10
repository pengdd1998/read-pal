import { useState, useCallback, useMemo, useRef } from 'react';
import { api } from '@/lib/api';
import type { Annotation } from '@read-pal/shared';

interface UseAnnotationActionsOptions {
  bookId: string;
}

export function useAnnotationActions({ bookId }: UseAnnotationActionsOptions) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const annotationsRef = useRef<Annotation[]>([]);
  annotationsRef.current = annotations;

  const loadAnnotations = useCallback(async () => {
    try {
      const result = await api.get<Annotation[]>('/api/annotations', { book_id: bookId });
      if (result.success && result.data) {
        const loaded = Array.isArray(result.data) ? result.data : [];
        setAnnotations(loaded);
      }
    } catch (err) {
      console.error('Failed to load annotations:', err);
    }
  }, [bookId]);

  const addHighlight = useCallback(async (
    text: string,
    color: string,
    chapterId: string | undefined,
    chapterIndex: number,
    cfiRange?: string,
    offsets?: { start: number; end: number },
  ) => {
    try {
      const result = await api.post<Annotation>('/api/annotations', {
        book_id: bookId,
        type: 'highlight',
        content: text,
        color,
        tags: [],
        location: {
          chapterId,
          pageIndex: chapterIndex,
          position: 0,
          selection: offsets || { start: 0, end: text.length },
          cfiRange,
        },
      });
      if (result.success && result.data) {
        setAnnotations((prev) => [...prev, result.data!]);
      }
    } catch (err) {
      console.error('Failed to add highlight:', err);
    }
  }, [bookId]);

  const addNote = useCallback(async (
    text: string,
    note: string,
    chapterId: string | undefined,
    chapterIndex: number,
    cfiRange?: string,
    offsets?: { start: number; end: number },
  ) => {
    try {
      const result = await api.post<Annotation>('/api/annotations', {
        book_id: bookId,
        type: 'note',
        content: text,
        note,
        location: {
          chapterId,
          pageIndex: chapterIndex,
          position: 0,
          selection: offsets || { start: 0, end: text.length },
          cfiRange,
        },
      });
      if (result.success && result.data) {
        setAnnotations((prev) => [...prev, result.data!]);
      }
    } catch (err) {
      console.error('Failed to add note:', err);
    }
  }, [bookId]);

  const deleteAnnotation = useCallback(async (id: string) => {
    try {
      await api.delete(`/api/annotations/${id}`);
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error('Failed to delete annotation:', err);
    }
  }, []);

  const toggleBookmark = useCallback(async (chapterId: string | undefined, chapterIndex: number, chapterTitle: string) => {
    const currentAnnotations = annotationsRef.current;
    const existing = currentAnnotations.find(
      (a) => a.type === 'bookmark' && a.location?.pageIndex === chapterIndex,
    );
    if (existing) {
      await api.delete(`/api/annotations/${existing.id}`);
      setAnnotations((prev) => prev.filter((a) => a.id !== existing.id));
    } else {
      const result = await api.post<Annotation>('/api/annotations', {
        book_id: bookId,
        type: 'bookmark',
        content: `Bookmark: ${chapterTitle}`,
        location: { chapterId, pageIndex: chapterIndex, position: 0, selection: { start: 0, end: 0 } },
      });
      if (result.success && result.data) {
        setAnnotations((prev) => [...prev, result.data!]);
      }
    }
  }, [bookId]);

  const chapterHighlights = useMemo(
    () => (chapterIndex: number) => annotations.filter(
      (a) => a.type === 'highlight' && a.location?.pageIndex === chapterIndex,
    ),
    [annotations],
  );

  const isBookmarked = useCallback(
    (chapterIndex: number) => annotationsRef.current.some(
      (a) => a.type === 'bookmark' && a.location?.pageIndex === chapterIndex,
    ),
    [],
  );

  return {
    annotations,
    loadAnnotations,
    addHighlight,
    addNote,
    deleteAnnotation,
    toggleBookmark,
    chapterHighlights,
    isBookmarked,
  };
}
