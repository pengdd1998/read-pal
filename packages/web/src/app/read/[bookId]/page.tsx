'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ReaderView } from '@/components/reading/ReaderView';
import { AnnotationPanel } from '@/components/reading/AnnotationPanel';
import { CompanionChat } from '@/components/reading/CompanionChat';

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
      const token = localStorage.getItem('auth_token') || '';

      const response = await fetch(`/api/upload/books/${bookId}/content`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();

      if (result.success) {
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
      const token = localStorage.getItem('auth_token') || '';
      const response = await fetch(`/api/annotations?bookId=${bookId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        setAnnotations(result.data || []);
      }
    } catch (err) {
      console.error('Failed to load annotations:', err);
    }
  };

  const handleChapterChange = async (chapterIndex: number) => {
    setCurrentChapter(chapterIndex);

    // Update progress
    try {
      const token = localStorage.getItem('auth_token') || '';
      await fetch(`/api/books/${bookId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPage: chapterIndex }),
      });
    } catch (err) {
      console.error('Failed to update progress:', err);
    }
  };

  const handleAddHighlight = async (text: string, color: string) => {
    try {
      const token = localStorage.getItem('auth_token') || '';
      const chapter = chapters[currentChapter];

      const response = await fetch('/api/annotations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
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
        }),
      });

      const result = await response.json();
      if (result.success) {
        setAnnotations([...annotations, result.data]);
      }
    } catch (err) {
      console.error('Failed to add highlight:', err);
    }
  };

  const handleAddNote = async (text: string, note: string) => {
    try {
      const token = localStorage.getItem('auth_token') || '';
      const chapter = chapters[currentChapter];

      const response = await fetch('/api/annotations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
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
        }),
      });

      const result = await response.json();
      if (result.success) {
        setAnnotations([...annotations, result.data]);
      }
    } catch (err) {
      console.error('Failed to add note:', err);
    }
  };

  const handleAddBookmark = async () => {
    try {
      const token = localStorage.getItem('auth_token') || '';
      const chapter = chapters[currentChapter];

      const response = await fetch('/api/annotations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          bookId,
          type: 'bookmark',
          content: `Bookmark: ${chapter.title}`,
          location: {
            chapterId: chapter.id,
            pageIndex: currentChapter,
            position: 0,
            selection: { start: 0, end: 0 },
          },
        }),
      });

      const result = await response.json();
      if (result.success) {
        setAnnotations([...annotations, result.data]);
      }
    } catch (err) {
      console.error('Failed to add bookmark:', err);
    }
  };

  const handleDeleteAnnotation = async (id: string) => {
    try {
      const token = localStorage.getItem('auth_token') || '';
      await fetch(`/api/annotations/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
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
