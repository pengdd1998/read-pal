import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { api } from '../../lib/api';
import { Colors, Spacing, Typography, BorderRadius } from '../../lib/theme';
import type { Book } from '@read-pal/shared';
import { API_ROUTES } from '@read-pal/shared';

interface ContentResponse {
  book: {
    id: string;
    title: string;
    author: string;
    currentPage: number;
    totalPages: number;
  };
  chapters: Array<{
    id: string;
    title: string;
    content: string;
    order: number;
  }>;
  content: string;
}

interface ReaderProps {
  route: { params: { bookId: string; title: string } };
  navigation: any;
}

/** Strip basic HTML tags and decode common entities for plain-text display. */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function ReaderScreen({ route }: ReaderProps) {
  const { bookId, title } = route.params;
  const [displayText, setDisplayText] = useState('');
  const [book, setBook] = useState<Book | null>(null);
  const [fontSize, setFontSize] = useState(16);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    async function loadContent() {
      try {
        const [contentRes, bookRes] = await Promise.all([
          api.get<ContentResponse>(API_ROUTES.BOOK_CONTENT(bookId)),
          api.get<Book>(API_ROUTES.BOOK_DETAIL(bookId)),
        ]);

        if (contentRes.success && contentRes.data) {
          const data = contentRes.data as unknown as ContentResponse;
          // Prefer chapter-by-chapter content over raw content
          const rawText = data.chapters?.length
            ? data.chapters.map((ch) => `${ch.title}\n\n${ch.content}`).join('\n\n---\n\n')
            : data.content;
          setDisplayText(stripHtml(rawText));
          setTotalPages(data.book?.totalPages || 0);
        }

        if (bookRes.success && bookRes.data) {
          const b = bookRes.data as unknown as Book;
          setBook(b);
          setProgress(b.progress);
          setFontSize(16);
        }
      } catch {
        // Content load failure handled by empty state
      } finally {
        setLoading(false);
      }
    }
    loadContent();
  }, [bookId]);

  const updateProgress = useCallback(
    async (page: number) => {
      if (!book || totalPages === 0) return;
      const newProgress = page / totalPages;
      setProgress(newProgress);
      try {
        await api.patch(API_ROUTES.BOOK_UPDATE(bookId), {
          currentPage: page,
          status: 'reading',
        });
      } catch {
        // Progress save failure is non-critical
      }
    },
    [book, bookId, totalPages],
  );

  // Estimate page from scroll position
  function handleScroll(event: any) {
    if (totalPages === 0) return;
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    if (contentSize.height <= layoutMeasurement.height) return;
    const scrollRatio = contentOffset.y / (contentSize.height - layoutMeasurement.height);
    const estimatedPage = Math.round(scrollRatio * totalPages);
    const clampedPage = Math.max(0, Math.min(totalPages, estimatedPage));
    const currentApprox = Math.round(progress * totalPages);
    if (Math.abs(clampedPage - currentApprox) >= 1) {
      updateProgress(clampedPage);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={400}
      >
        <Text style={styles.chapterTitle}>{title}</Text>
        <Text style={[styles.bodyText, { fontSize }]}>{displayText}</Text>
      </ScrollView>
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.controlBtn}
          onPress={() => setFontSize((s) => Math.max(12, s - 2))}
        >
          <Text style={styles.controlText}>A-</Text>
        </TouchableOpacity>
        <Text style={styles.controlLabel}>{fontSize}px</Text>
        <TouchableOpacity
          style={styles.controlBtn}
          onPress={() => setFontSize((s) => Math.min(28, s + 2))}
        >
          <Text style={styles.controlText}>A+</Text>
        </TouchableOpacity>
        <Text style={styles.progressLabel}>
          {Math.round(progress * 100)}% complete
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: Spacing.lg },
  chapterTitle: {
    ...Typography.h2,
    color: Colors.text,
    marginBottom: Spacing.lg,
  },
  bodyText: {
    ...Typography.body,
    color: Colors.text,
    lineHeight: 28,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: Spacing.sm,
  },
  controlBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.gray100,
  },
  controlText: { ...Typography.body, color: Colors.primary, fontWeight: '600' },
  controlLabel: { ...Typography.caption, color: Colors.textSecondary, minWidth: 36, textAlign: 'center' },
  progressLabel: { ...Typography.caption, color: Colors.success, marginLeft: Spacing.md },
});
