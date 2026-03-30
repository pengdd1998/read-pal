'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ReaderView } from '@/components/reading/ReaderView';
import { AnnotationPanel } from '@/components/reading/AnnotationPanel';
import { CompanionChat } from '@/components/reading/CompanionChat';
import { api } from '@/lib/api';

interface Chapter {
  id: string;
  title: string;
  content: string;
  startIndex: number;
  endIndex: number;
  order: number;
}

export default function ReadPage() {
  const params = useParams();
  const bookId = params.bookId as string;

  const [book, setBook] = useState<any>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadBookContent();
  }, [bookId]);

  const loadBookContent = async () => {
    try {
      setLoading(true);

      const result = await api.get<{
        book: any;
        chapters: Chapter[];
        content: string;
      }>(`/api/upload/books/${bookId}/content`);

      if (result.success && result.data) {
        setBook(result.data.book);
        setChapters(result.data.chapters);
        setCurrentChapter(result.data.book.currentPage || 0);

        // Load annotations
        loadAnnotations();
      } else {
        setError(result.error?.message || 'Failed to load book');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const loadAnnotations = async () => {
    try {
      const result = await api.get('/api/annotations', { bookId });
      if (result.success) {
        setAnnotations((result.data as any[]) || []);
      }
    } catch (err) {
      console.error('Failed to load annotations:', err);
    }
  };

  const handleChapterChange = async (chapterIndex: number) => {
    setCurrentChapter(chapterIndex);

    // Update progress
    try {
      await api.patch(`/api/books/${bookId}`, { currentPage: chapterIndex });
    } catch (err) {
      console.error('Failed to update progress:', err);
    }
  };

  const handleAddHighlight = async (text: string, color: string) => {
    try {
      const chapter = chapters[currentChapter];

      const result = await api.post('/api/annotations', {
        bookId,
        type: 'highlight',
        content: text,
        color,
        location: {
          chapterId: chapter.id,
          pageIndex: currentChapter,
          position: 0,
          selection: { start: 0, end: text.length },
        },
      });

      if (result.success && result.data) {
        setAnnotations([...annotations, result.data]);
      }
    } catch (err) {
      console.error('Failed to add highlight:', err);
    }
  };

  const handleAddNote = async (text: string, note: string) => {
    try {
      const chapter = chapters[currentChapter];

      const result = await api.post('/api/annotations', {
        bookId,
        type: 'note',
        content: text,
        note,
        location: {
          chapterId: chapter.id,
          pageIndex: currentChapter,
          position: 0,
          selection: { start: 0, end: text.length },
        },
      });

      if (result.success && result.data) {
        setAnnotations([...annotations, result.data]);
      }
    } catch (err) {
      console.error('Failed to add note:', err);
    }
  };

  const handleAddBookmark = async () => {
    try {
      const chapter = chapters[currentChapter];

      const result = await api.post('/api/annotations', {
        bookId,
        type: 'bookmark',
        content: `Bookmark: ${chapter.title}`,
        location: {
          chapterId: chapter.id,
          pageIndex: currentChapter,
          position: 0,
          selection: { start: 0, end: 0 },
        },
      });

      if (result.success && result.data) {
        setAnnotations([...annotations, result.data]);
      }
    } catch (err) {
      console.error('Failed to add bookmark:', err);
    }
  };

  const handleDeleteAnnotation = async (id: string) => {
    try {
      await api.delete(`/api/annotations/${id}`);
      setAnnotations(annotations.filter((a) => a.id !== id));
    } catch (err) {
      console.error('Failed to delete annotation:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (error || !book || chapters.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-xl font-semibold mb-4">
            {error || 'Unable to load book'}
          </p>
          <a href="/library" className="btn btn-primary">
            Back to Library
          </a>
        </div>
      </div>
    );
  }

  const chapter = chapters[currentChapter];

  return (
    <div className="relative">
      <ReaderView
        bookId={bookId}
        content={chapter.content}
        title={`${book.title} - ${chapter.title}`}
        currentPage={currentChapter}
        totalPages={chapters.length}
        onPageChange={handleChapterChange}
      />
      <AnnotationPanel
        annotations={annotations}
        onAddHighlight={handleAddHighlight}
        onAddNote={handleAddNote}
        onAddBookmark={handleAddBookmark}
        onDeleteAnnotation={handleDeleteAnnotation}
      />
      <CompanionChat bookId={bookId} currentPage={currentChapter} />
    </div>
  );
}
