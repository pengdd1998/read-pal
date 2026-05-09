import { View, Text, FlatList, TouchableOpacity, Image, ActivityIndicator, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import BookUploader from '@/components/library/BookUploader';
import type { Book } from '@read-pal/shared';

export default function LibraryScreen() {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['books'],
    queryFn: async () => {
      const result = await api.get<Book[]>('/api/books');
      return result.success ? result.data || [] : [];
    },
  });

  const books = data || [];

  const renderBook = ({ item }: { item: Book }) => (
    <TouchableOpacity
      style={styles.bookCard}
      onPress={() => router.push(`/(tabs)/library/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.bookInner}>
        <View style={styles.coverContainer}>
          {item.coverUrl ? (
            <Image source={{ uri: item.coverUrl }} style={styles.cover} resizeMode="cover" />
          ) : (
            <View style={[styles.cover, styles.coverPlaceholder]}>
              <Text style={{ fontSize: 32 }}>📖</Text>
            </View>
          )}
          {item.status === 'reading' && (
            <View style={styles.progressOverlay}>
              <View style={[styles.progressBar, { width: `${Math.round(item.progress * 100)}%` }]} />
            </View>
          )}
        </View>
        <View style={styles.bookInfo}>
          <Text style={styles.bookTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.bookAuthor} numberOfLines={1}>{item.author}</Text>
          {item.status === 'reading' && (
            <Text style={styles.bookProgress}>{Math.round(item.progress * 100)}% read</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#d97706" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Library</Text>
        <Text style={styles.headerSub}>{books.length} books</Text>
      </View>

      <BookUploader onUploaded={() => queryClient.invalidateQueries({ queryKey: ['books'] })} />

      <FlatList
        data={books}
        renderItem={renderBook}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>📚</Text>
            <Text style={styles.emptyTitle}>No books yet</Text>
            <Text style={styles.emptySub}>Upload an EPUB or PDF to get started</Text>
          </View>
        }
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#d97706" />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f5f0' },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  headerTitle: { fontSize: 28, fontWeight: '700', color: '#1e2a38', fontFamily: 'Crimson Pro' },
  headerSub: { fontSize: 14, color: '#8a99ae', marginTop: 2 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  bookCard: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', shadowColor: '#1e2a38', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  bookInner: { flexDirection: 'row', padding: 12 },
  coverContainer: { width: 70, height: 96, borderRadius: 8, overflow: 'hidden', position: 'relative' },
  cover: { width: '100%', height: '100%' },
  coverPlaceholder: { backgroundColor: '#f0e9e0', justifyContent: 'center', alignItems: 'center' },
  progressOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: '#e0e0e0' },
  progressBar: { height: '100%', backgroundColor: '#d97706' },
  bookInfo: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  bookTitle: { fontSize: 15, fontWeight: '600', color: '#1e2a38', lineHeight: 20 },
  bookAuthor: { fontSize: 13, color: '#8a99ae', marginTop: 2 },
  bookProgress: { fontSize: 12, color: '#d97706', marginTop: 4, fontWeight: '500' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#3d5578' },
  emptySub: { fontSize: 14, color: '#8a99ae', marginTop: 4 },
});
