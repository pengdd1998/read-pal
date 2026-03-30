import React, { useState, useCallback } from 'react';
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { api } from '../../lib/api';
import { Colors, Spacing, Typography, BorderRadius } from '../../lib/theme';
import { API_ROUTES } from '@read-pal/shared';

/** Subset of Book fields used in the library list. Avoids importing the strict
 *  shared `Book` type which requires Date objects that don't survive JSON. */
interface BookItem {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  fileType: string;
  totalPages: number;
  currentPage: number;
  progress: number;
  status: 'unread' | 'reading' | 'completed';
}

export function LibraryScreen({ navigation }: any) {
  const [books, setBooks] = useState<BookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchBooks = useCallback(async () => {
    try {
      const res = await api.get<BookItem[]>(API_ROUTES.BOOKS);
      if (res.success && res.data) {
        setBooks(res.data as unknown as BookItem[]);
      }
    } catch {
      // silently fail - shows empty state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchBooks();
  }, [fetchBooks]);

  async function handleUpload() {
    if (uploading) return;
    setUploading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/epub+zip', 'application/pdf'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) {
        setUploading(false);
        return;
      }

      const file = result.assets[0];
      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        name: file.name,
        type: file.mimeType || 'application/octet-stream',
      } as any);

      const res = await api.upload<{ book: BookItem }>(API_ROUTES.BOOK_UPLOAD, formData);
      if (res.success) {
        fetchBooks();
      } else {
        Alert.alert('Upload Failed', res.error?.message || 'Could not upload file');
      }
    } catch (err: any) {
      Alert.alert('Upload Error', err.message || 'Something went wrong');
    } finally {
      setUploading(false);
    }
  }

  function openBook(item: BookItem) {
    // Navigate to the Reader screen in the root stack (not tab)
    navigation.getParent()?.navigate('Reader', { bookId: item.id, title: item.title });
  }

  /** Normalise progress to 0-1 range for display. */
  function displayProgress(value: number): number {
    if (value > 1) return value / 100;
    return value;
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
      <FlatList
        data={books}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.grid}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={{ ...Typography.body, color: Colors.textSecondary }}>
              No books yet. Upload one to get started!
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.bookCard} onPress={() => openBook(item)}>
            <View style={styles.coverPlaceholder}>
              <Text style={styles.coverTitle} numberOfLines={3}>{item.title}</Text>
            </View>
            <Text style={styles.bookTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.bookAuthor} numberOfLines={1}>{item.author}</Text>
            {item.status === 'reading' && (
              <View style={styles.progressBadge}>
                <Text style={styles.progressText}>
                  {Math.round(displayProgress(item.progress) * 100)}%
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity
        style={[styles.fab, uploading && styles.fabDisabled]}
        onPress={handleUpload}
        disabled={uploading}
      >
        {uploading ? (
          <ActivityIndicator size="small" color={Colors.white} />
        ) : (
          <Text style={styles.fabText}>+</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  grid: { padding: Spacing.sm },
  bookCard: {
    flex: 1,
    margin: Spacing.xs,
    maxWidth: '50%',
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  coverPlaceholder: {
    aspectRatio: 2 / 3,
    backgroundColor: Colors.gray200,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.sm,
  },
  coverTitle: { ...Typography.body, color: Colors.gray600, textAlign: 'center' },
  bookTitle: {
    ...Typography.bodySmall,
    fontWeight: '600',
    color: Colors.text,
    padding: Spacing.sm,
    paddingBottom: 2,
  },
  bookAuthor: {
    ...Typography.caption,
    color: Colors.textSecondary,
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  progressBadge: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  progressText: { ...Typography.caption, color: Colors.white },
  fab: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabDisabled: {
    opacity: 0.6,
  },
  fabText: { fontSize: 28, color: Colors.white, lineHeight: 32 },
});
