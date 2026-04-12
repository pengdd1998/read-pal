import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  ClipboardStatic,
} from 'react-native';
import { api } from '../../lib/api';
import { Colors, Spacing, Typography, BorderRadius } from '../../lib/theme';
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

interface BookInfo {
  id: string;
  title: string;
  author: string;
  totalPages: number;
  currentPage: number;
  progress: number;
  status: string;
}

interface Annotation {
  id: string;
  type: 'highlight' | 'note' | 'bookmark';
  content: string;
  note?: string;
  createdAt: string;
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

function normalizeProgress(value: number): number {
  if (value > 1) return value / 100;
  return value;
}

export function ReaderScreen({ route }: ReaderProps) {
  const { bookId, title } = route.params;
  const [displayText, setDisplayText] = useState('');
  const [book, setBook] = useState<BookInfo | null>(null);
  const [fontSize, setFontSize] = useState(16);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [pendingAnnotationType, setPendingAnnotationType] = useState<'highlight' | 'note'>('highlight');
  const [showAnnotations, setShowAnnotations] = useState(false);

  useEffect(() => {
    async function loadContent() {
      try {
        const [contentRes, bookRes, annRes] = await Promise.all([
          api.get<ContentResponse>(API_ROUTES.BOOK_CONTENT(bookId)),
          api.get<BookInfo>(API_ROUTES.BOOK_DETAIL(bookId)),
          api.get<Annotation[]>(`/api/annotations?bookId=${bookId}&limit=500`).catch(() => ({ success: false, data: null })),
        ]);

        if (contentRes.success && contentRes.data) {
          const data = contentRes.data as unknown as ContentResponse;
          const rawText = data.chapters?.length
            ? data.chapters.map((ch) => `${ch.title}\n\n${ch.content}`).join('\n\n---\n\n')
            : data.content;
          setDisplayText(stripHtml(rawText));
          setTotalPages(data.book?.totalPages || 0);
        }

        if (bookRes.success && bookRes.data) {
          const b = bookRes.data as unknown as BookInfo;
          setBook(b);
          setProgress(normalizeProgress(b.progress));
          setFontSize(16);
        }

        if (annRes.success && annRes.data) {
          setAnnotations((annRes.data as unknown as Annotation[]) || []);
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

  async function createAnnotation(type: 'highlight' | 'note' | 'bookmark', content: string, note?: string) {
    try {
      const res = await api.post('/api/annotations', {
        bookId,
        type,
        content: content.slice(0, 5000),
        note: note || undefined,
        location: { pageNumber: Math.round(progress * totalPages) },
      });
      if (res.success && res.data) {
        setAnnotations((prev) => [...prev, res.data as unknown as Annotation]);
      }
    } catch {
      Alert.alert('Error', 'Failed to save annotation.');
    }
  }

  async function handleAnnotationAction(type: 'highlight' | 'note' | 'bookmark') {
    if (type === 'bookmark') {
      await createAnnotation('bookmark', `Bookmark at page ${Math.round(progress * totalPages)}`);
      Alert.alert('Bookmark', 'Bookmark saved!');
      return;
    }

    // Get selected text from clipboard (user selects text, which copies to clipboard)
    let selectedText = '';
    try {
      selectedText = await ClipboardStatic.getString();
    } catch {
      // Fallback: empty
    }

    if (!selectedText || selectedText.length < 3) {
      Alert.alert(
        type === 'highlight' ? 'Highlight' : 'Note',
        'Select text first, then tap this button. The selected text will be used.',
      );
      return;
    }

    if (type === 'highlight') {
      await createAnnotation('highlight', selectedText);
      Alert.alert('Highlight', 'Highlight saved!');
    } else {
      setPendingAnnotationType('note');
      setNoteText('');
      setShowNoteModal(true);
    }
  }

  function submitNote() {
    // The selected text should still be in clipboard
    ClipboardStatic.getString().then((selectedText) => {
      if (selectedText && selectedText.length >= 3) {
        createAnnotation('note', selectedText, noteText);
      }
      setShowNoteModal(false);
      setNoteText('');
    });
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const highlights = annotations.filter((a) => a.type === 'highlight').length;
  const notes = annotations.filter((a) => a.type === 'note').length;
  const bookmarks = annotations.filter((a) => a.type === 'bookmark').length;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={400}
      >
        <Text style={styles.chapterTitle}>{title}</Text>
        <Text style={[styles.bodyText, { fontSize }]} selectable>{displayText}</Text>
      </ScrollView>

      {/* Annotation stats bar */}
      <View style={styles.annotationBar}>
        <Text style={styles.annotationStat}>{highlights} highlights</Text>
        <Text style={styles.annotationStat}>{notes} notes</Text>
        <Text style={styles.annotationStat}>{bookmarks} bookmarks</Text>
        <TouchableOpacity onPress={() => setShowAnnotations(!showAnnotations)}>
          <Text style={styles.annotationToggle}>{showAnnotations ? 'Hide' : 'Show'}</Text>
        </TouchableOpacity>
      </View>

      {/* Annotations list */}
      {showAnnotations && annotations.length > 0 && (
        <View style={styles.annotationsList}>
          <ScrollView style={styles.annotationsScroll} nestedScrollEnabled>
            {annotations.slice(0, 20).map((ann) => (
              <View key={ann.id} style={styles.annotationItem}>
                <View style={[styles.annotationDot, {
                  backgroundColor: ann.type === 'highlight' ? '#f59e0b' : ann.type === 'note' ? '#14b8a6' : '#6366f1',
                }]} />
                <View style={styles.annotationContent}>
                  <Text style={styles.annotationText} numberOfLines={2}>{ann.content}</Text>
                  {ann.note ? <Text style={styles.annotationNote}>{ann.note}</Text> : null}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.controlBtn} onPress={() => setFontSize((s) => Math.max(12, s - 2))}>
          <Text style={styles.controlText}>A-</Text>
        </TouchableOpacity>
        <Text style={styles.controlLabel}>{fontSize}px</Text>
        <TouchableOpacity style={styles.controlBtn} onPress={() => setFontSize((s) => Math.min(28, s + 2))}>
          <Text style={styles.controlText}>A+</Text>
        </TouchableOpacity>

        <View style={styles.controlDivider} />

        <TouchableOpacity style={styles.annotationBtn} onPress={() => handleAnnotationAction('highlight')}>
          <Text style={styles.annotationBtnIcon}>H</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.annotationBtn} onPress={() => handleAnnotationAction('note')}>
          <Text style={styles.annotationBtnIcon}>N</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.annotationBtn} onPress={() => handleAnnotationAction('bookmark')}>
          <Text style={styles.annotationBtnIcon}>B</Text>
        </TouchableOpacity>

        <Text style={styles.progressLabel}>
          {Math.round(progress * 100)}%
        </Text>
      </View>

      {/* Note modal */}
      <Modal visible={showNoteModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Note</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="Write your note..."
              placeholderTextColor={Colors.textSecondary}
              value={noteText}
              onChangeText={setNoteText}
              multiline
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setShowNoteModal(false)}>
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnSave} onPress={submitNote}>
                <Text style={styles.modalBtnSaveText}>Save Note</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  annotationBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  annotationStat: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  annotationToggle: {
    ...Typography.caption,
    color: Colors.primary,
    fontWeight: '600',
  },
  annotationsList: {
    maxHeight: 150,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  annotationsScroll: { padding: Spacing.sm },
  annotationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.xs,
    gap: Spacing.sm,
  },
  annotationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  annotationContent: { flex: 1 },
  annotationText: {
    ...Typography.caption,
    color: Colors.text,
    lineHeight: 16,
  },
  annotationNote: {
    ...Typography.caption,
    color: Colors.primary,
    fontStyle: 'italic',
    marginTop: 2,
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
  controlDivider: {
    width: 1,
    height: 20,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.xs,
  },
  annotationBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.gray100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  annotationBtnIcon: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  progressLabel: { ...Typography.caption, color: Colors.success, marginLeft: Spacing.md },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl || 20,
    borderTopRightRadius: BorderRadius.xl || 20,
    padding: Spacing.lg,
  },
  modalTitle: {
    ...Typography.h3 || { fontSize: 18, fontWeight: '600' },
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    minHeight: 100,
    ...Typography.body,
    color: Colors.text,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  modalBtnCancel: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  modalBtnCancelText: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  modalBtnSave: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
  },
  modalBtnSaveText: {
    ...Typography.body,
    color: Colors.white,
    fontWeight: '600',
  },
});
