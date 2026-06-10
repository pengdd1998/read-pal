import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useReaderStore } from '@/stores/reader-store';
import { useReadingSession } from '@/hooks/useReadingSession';
import { useAnnotationActions } from '@/hooks/useAnnotationActions';
import EpubReader from '@/components/reader/EpubReader';
import ReaderHeader from '@/components/reader/ReaderHeader';
import SelectionToolbar from '@/components/reader/SelectionToolbar';
import ReaderSettingsSheet from '@/components/reader/ReaderSettingsSheet';
import ChapterList from '@/components/reader/ChapterList';
import AIAssistantButton from '@/components/reader/AIAssistantButton';
import { colors, spacing } from '@/lib/theme';
import type { Book, Chapter } from '@read-pal/shared';

export default function ReaderScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const theme = useReaderStore((s) => s.theme);
  const saveProgress = useReaderStore((s) => s.saveProgress);
  const progressSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentChapterRef = useRef(0);

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
  const [showChrome, setShowChrome] = useState(false);

  // Selection state
  const [selection, setSelection] = useState<{ text: string; cfiRange: string; rect: any; offsets?: { start: number; end: number } } | null>(null);

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

  // Keep ref in sync
  useEffect(() => { currentChapterRef.current = currentChapter; }, [currentChapter]);

  const handleProgress = useCallback((progress: number) => {
    if (progressSaveTimer.current) clearTimeout(progressSaveTimer.current);
    progressSaveTimer.current = setTimeout(() => {
      saveProgress(bookId, currentChapterRef.current, progress);
    }, 500);
  }, [bookId, saveProgress]);

  const handleChapterChange = useCallback((index: number) => {
    setCurrentChapter(index);
  }, []);

  const handleSelection = useCallback((text: string, cfiRange: string, rect: any, offsets?: { start: number; end: number }) => {
    setSelection({ text, cfiRange, rect, offsets });
    setShowChrome(false);
  }, []);

  const handleHighlight = useCallback(async (color: string) => {
    if (!selection) return;
    const chapter = chapters[currentChapter];
    await addHighlight(selection.text, color, chapter?.id, currentChapter, selection.cfiRange, selection.offsets);
    setSelection(null);
  }, [selection, chapters, currentChapter, addHighlight]);

  const handleNote = useCallback(async (text: string, note: string) => {
    if (!selection) return;
    const chapter = chapters[currentChapter];
    await addNote(text, note, chapter?.id, currentChapter, selection.cfiRange, selection.offsets);
    setSelection(null);
  }, [selection, chapters, currentChapter, addNote]);

  const handleBookmark = useCallback(async () => {
    const chapter = chapters[currentChapter];
    if (chapter) {
      await toggleBookmark(chapter.id, currentChapter, chapter.title);
    }
  }, [chapters, currentChapter, toggleBookmark]);

  // Toggle chrome on center tap
  const toggleChrome = useCallback(() => {
    if (selection) {
      setSelection(null);
    } else {
      setShowChrome((prev) => !prev);
    }
  }, [selection]);

  const bgColor = theme === 'dark' ? '#1a1a2e' : theme === 'sepia' ? '#f4ecd8' : '#fefdfb';

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: 'slide_from_right' }} />
      <View style={[styles.container, { backgroundColor: bgColor }]}>

        {/* Header (show/hide) */}
        {showChrome && (
          <ReaderHeader
            title={book?.title || 'Reading'}
            chapterIndex={currentChapter}
            totalChapters={chapters.length}
            isBookmarked={isBookmarked(currentChapter)}
            onBookmark={handleBookmark}
            onToggleSettings={() => setShowSettings(true)}
            onToggleToc={() => setShowToc(true)}
          />
        )}

        <EpubReader
          chapters={chapters}
          currentChapter={currentChapter}
          onChapterChange={handleChapterChange}
          onSelection={handleSelection}
          onProgress={handleProgress}
        />

        {/* Center tap area */}
        <TouchableOpacity
          style={styles.tapZone}
          onPress={toggleChrome}
          activeOpacity={1}
        />

        {/* AI FAB */}
        <View style={styles.fabContainer}>
          <AIAssistantButton
            hasSelection={!!selection}
            onPress={() => {
              const question = selection?.text || '';
              setSelection(null);
              setShowChrome(false);
              router.push(`/chat/${bookId}?initialQuestion=${encodeURIComponent(question)}` as any);
            }}
          />
        </View>

        {/* Selection Toolbar */}
        <SelectionToolbar
          visible={!!selection}
          selectedText={selection?.text || ''}
          onHighlight={handleHighlight}
          onNote={handleNote}
          onAskAI={() => {
            const question = selection?.text || '';
            setSelection(null);
            setShowChrome(false);
            router.push(`/chat/${bookId}?initialQuestion=${encodeURIComponent(question)}` as any);
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
  tapZone: {
    position: 'absolute',
    top: '30%',
    left: '20%',
    right: '20%',
    height: '40%',
    zIndex: 1,
  },
  fabContainer: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xxl,
    zIndex: 5,
  },
});
