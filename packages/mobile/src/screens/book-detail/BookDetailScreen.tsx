import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { api } from '../../lib/api';
import { Colors, Spacing, Typography, BorderRadius } from '../../lib/theme';

interface BookDetail {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  fileType: string;
  totalPages: number;
  currentPage: number;
  progress: number;
  status: 'unread' | 'reading' | 'completed';
  tags: string[];
  addedAt: string;
  lastReadAt?: string;
}

interface AnnotationItem {
  id: string;
  type: 'highlight' | 'note' | 'bookmark';
  content: string;
  note?: string;
  createdAt: string;
}

interface BookDetailProps {
  route: any;
  navigation: any;
}

export function BookDetailScreen({ route, navigation }: BookDetailProps) {
  const bookId = route.params?.bookId;
  const [book, setBook] = useState<BookDetail | null>(null);
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (bookId) loadBookDetail();
  }, [bookId]);

  async function loadBookDetail() {
    try {
      const [bookRes, annotRes] = await Promise.all([
        api.get<BookDetail>(`/api/books/${bookId}`),
        api.get<AnnotationItem[]>(`/api/annotations?bookId=${bookId}&limit=20`).catch(() => ({ success: false, data: null })),
      ]);
      if (bookRes.success && bookRes.data) {
        setBook(bookRes.data as unknown as BookDetail);
      }
      if (annotRes.success && annotRes.data) {
        setAnnotations((annotRes.data as unknown as AnnotationItem[]) || []);
      }
    } catch {
      // Handle error
    } finally {
      setLoading(false);
    }
  }

  function displayProgress(val: number): number {
    return val > 1 ? val / 100 : val;
  }

  function formatDate(dateStr?: string): string {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function getAnnotationIcon(type: string): string {
    switch (type) {
      case 'highlight': return '\uD83D\uDD16';
      case 'note': return '\uD83D\uDCDD';
      case 'bookmark': return '\uD83D\uDD16';
      default: return '\uD83D\uDCDD';
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!book) {
    return (
      <View style={styles.centered}>
        <Text style={{ ...Typography.body, color: Colors.textSecondary }}>Book not found</Text>
      </View>
    );
  }

  const pct = Math.round(displayProgress(book.progress) * 100);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Book Header */}
      <View style={styles.header}>
        <View style={styles.cover}>
          <Text style={styles.coverTitle} numberOfLines={4}>{book.title}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.bookTitle} numberOfLines={2}>{book.title}</Text>
          <Text style={styles.bookAuthor}>{book.author}</Text>
          <Text style={styles.bookMeta}>{book.totalPages} pages · {book.fileType.toUpperCase()}</Text>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>
              {book.status === 'reading' ? 'Reading' : book.status === 'completed' ? 'Completed' : 'Not started'}
            </Text>
          </View>
        </View>
      </View>

      {/* Progress */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Progress</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>
        <View style={styles.progressRow}>
          <Text style={styles.progressLabel}>Page {book.currentPage} of {book.totalPages}</Text>
          <Text style={styles.progressPct}>{pct}%</Text>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatDate(book.addedAt)}</Text>
          <Text style={styles.statLabel}>Added</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatDate(book.lastReadAt)}</Text>
          <Text style={styles.statLabel}>Last Read</Text>
        </View>
      </View>

      {/* Tags */}
      {book.tags && book.tags.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tags</Text>
          <View style={styles.tagsRow}>
            {book.tags.map((tag, i) => (
              <View key={i} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Annotations */}
      {annotations.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Highlights & Notes ({annotations.length})</Text>
          {annotations.slice(0, 10).map((a) => (
            <View key={a.id} style={styles.annotationCard}>
              <View style={styles.annotationHeader}>
                <Text style={styles.annotationIcon}>{getAnnotationIcon(a.type)}</Text>
                <Text style={styles.annotationType}>{a.type}</Text>
              </View>
              <Text style={styles.annotationContent} numberOfLines={3}>{a.content}</Text>
              {a.note && <Text style={styles.annotationNote}>{a.note}</Text>}
            </View>
          ))}
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.readBtn}
          onPress={() => navigation.getParent()?.navigate('Reader', { bookId: book.id, title: book.title })}
        >
          <Text style={styles.readBtnText}>
            {book.status === 'reading' ? 'Continue Reading' : 'Start Reading'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg },
  cover: {
    width: 90,
    height: 130,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.gray200,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xs,
  },
  coverTitle: {
    ...Typography.bodySmall,
    color: Colors.gray600,
    textAlign: 'center',
    fontWeight: '600',
  },
  headerInfo: { flex: 1 },
  bookTitle: {
    ...Typography.h3,
    color: Colors.text,
    fontWeight: '700',
    marginBottom: 2,
  },
  bookAuthor: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  bookMeta: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primaryLight + '30',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    ...Typography.caption,
    color: Colors.primary,
    fontWeight: '600',
    textTransform: 'uppercase',
    fontSize: 10,
  },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.body,
    color: Colors.text,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.gray100,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  progressLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  progressPct: {
    ...Typography.caption,
    color: Colors.primary,
    fontWeight: '700',
  },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
  },
  statValue: {
    ...Typography.bodySmall,
    color: Colors.text,
    fontWeight: '600',
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontSize: 10,
    marginTop: 2,
  },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  tag: {
    backgroundColor: Colors.gray100,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  tagText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontSize: 11,
  },
  annotationCard: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  annotationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: 4,
  },
  annotationIcon: { fontSize: 14 },
  annotationType: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textTransform: 'capitalize',
    fontSize: 10,
  },
  annotationContent: {
    ...Typography.bodySmall,
    color: Colors.text,
    lineHeight: 18,
  },
  annotationNote: {
    ...Typography.caption,
    color: Colors.primary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  actions: { marginTop: Spacing.md },
  readBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  readBtnText: {
    ...Typography.body,
    color: Colors.white,
    fontWeight: '700',
  },
});
