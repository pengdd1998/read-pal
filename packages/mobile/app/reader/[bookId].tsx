import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api, API_BASE_URL } from '@/lib/api';
import { useReaderStore } from '@/stores/reader-store';
import { useReadingSession } from '@/hooks/useReadingSession';
import { useAnnotationActions } from '@/hooks/useAnnotationActions';
import EpubReader from '@/components/reader/EpubReader';
import ReaderHeader from '@/components/reader/ReaderHeader';
import SelectionToolbar from '@/components/reader/SelectionToolbar';
import ReaderSettingsSheet from '@/components/reader/ReaderSettingsSheet';
import ChapterList from '@/components/reader/ChapterList';
import type { Book, Chapter } from '@read-pal/shared';

export default function ReaderScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const theme = useReaderStore((s) => s.theme);

  const { data: book } = useQuery({
    queryKey: ['book', bookId],
    queryFn: async () => {
      const result = await api.get<Book>(`/api/books/${bookId}`);
      return result.success ? result.data : null;
    },
  });

  const { data: content } = useQuery({
    queryKey: ['bookContent', bookId],
    queryFn: async () => {
      const result = await api.get<{ chapters: Chapter[] }>(`/api/upload/books/${bookId}/content`);
      return result.success ? result.data : null;
    },
    enabled: !!bookId,
  });

  const chapters = content?.chapters || [];
  const [currentChapter, setCurrentChapter] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showToc, setShowToc] = useState(false);

  // Selection state
  const [selection, setSelection] = useState<{ text: string; cfiRange: string; rect: any } | null>(null);

  // Annotations
  const {
    annotations,
    loadAnnotations,
    addHighlight,
    addNote,
    toggleBookmark,
    isBookmarked,
  } = useAnnotationActions({ bookId });

  useEffect(() => { loadAnnotations(); }, [loadAnnotations]);

  // Reading session tracking
  useReadingSession({
    bookId,
    loading: !content,
    currentChapter,
    chaptersLength: chapters.length,
  });

  const handleChapterChange = useCallback((index: number) => {
    setCurrentChapter(index);
  }, []);

  const handleSelection = useCallback((text: string, cfiRange: string, rect: any) => {
    setSelection({ text, cfiRange, rect });
  }, []);

  const handleHighlight = useCallback(async (color: string) => {
    if (!selection) return;
    const chapter = chapters[currentChapter];
    await addHighlight(selection.text, color, chapter?.id, currentChapter, selection.cfiRange);
    setSelection(null);
  }, [selection, chapters, currentChapter, addHighlight]);

  const handleNote = useCallback(async (text: string, note: string) => {
    if (!selection) return;
    const chapter = chapters[currentChapter];
    await addNote(text, note, chapter?.id, currentChapter, selection.cfiRange);
    setSelection(null);
  }, [selection, chapters, currentChapter, addNote]);

  const handleBookmark = useCallback(async () => {
    const chapter = chapters[currentChapter];
    if (chapter) {
      await toggleBookmark(chapter.id, currentChapter, chapter.title);
    }
  }, [chapters, currentChapter, toggleBookmark]);

  // Construct book content URL for epub.js
  const bookContentUrl = `${API_BASE_URL}/api/upload/books/${bookId}/content`;

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: 'slide_from_right' }} />
      <View style={[styles.container, { backgroundColor: theme === 'dark' ? '#0f1419' : '#fefdfb' }]}>
        <ReaderHeader
          title={book?.title || 'Reading'}
          chapterIndex={currentChapter}
          totalChapters={chapters.length}
          isBookmarked={isBookmarked(currentChapter)}
          onBookmark={handleBookmark}
          onToggleSettings={() => setShowSettings(true)}
          onToggleToc={() => setShowToc(true)}
          onTapCenter={() => {}}
        />

        <EpubReader
          bookUrl={bookContentUrl}
          initialChapter={currentChapter}
          onChapterChange={handleChapterChange}
          onSelection={handleSelection}
          onProgress={() => {}}
          annotations={annotations}
        />

        <SelectionToolbar
          visible={!!selection}
          selectedText={selection?.text || ''}
          onHighlight={handleHighlight}
          onNote={handleNote}
          onAskAI={() => {
            setSelection(null);
            // Navigate to chat with context
          }}
          onDismiss={() => setSelection(null)}
        />

        <ReaderSettingsSheet
          visible={showSettings}
          onClose={() => setShowSettings(false)}
        />

        <ChapterList
          visible={showToc}
          chapters={chapters.map((c, i) => ({ id: c.id, title: c.title, order: i }))}
          currentChapter={currentChapter}
          onSelect={(index) => setCurrentChapter(index)}
          onClose={() => setShowToc(false)}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
