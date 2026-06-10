import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, ActivityIndicator, RefreshControl, StyleSheet, Dimensions, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import BookUploader from '@/components/library/BookUploader';
import { GridIcon, ListIcon, SearchIcon, BookPlaceholderIcon, CheckmarkIcon, AISparkleIcon, ChatBubbleIcon } from '@/components/shared/Icons';
import { colors, typography, radius, shadows, spacing } from '@/lib/theme';
import type { Book } from '@read-pal/shared';

type ViewMode = 'grid' | 'list';
type FilterType = 'all' | 'reading' | 'completed' | 'unread';
const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_COLUMNS = 3;
const GRID_GAP = 8;
const GRID_PADDING = 16;
const CARD_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

export default function LibraryScreen() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['books'],
    queryFn: async () => {
      const result = await api.get<Book[]>('/api/books');
      if (!result.success) throw new Error(result.error?.message || 'Failed to load books');
      return result.data || [];
    },
  });

  const allBooks = data || [];

  // Filter + search
  const books = allBooks.filter((b) => {
    if (filter === 'reading' && b.status !== 'reading') return false;
    if (filter === 'completed' && b.status !== 'completed') return false;
    if (filter === 'unread' && b.status !== 'unread' && b.status !== undefined) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (b.title?.toLowerCase().includes(q) || b.author?.toLowerCase().includes(q));
    }
    return true;
  });

  const currentlyReading = allBooks.filter((b) => b.status === 'reading');
  const heroBook = currentlyReading[0];

  const renderGridItem = ({ item }: { item: Book }) => (
    <TouchableOpacity style={styles.gridCard} onPress={() => router.push(`/(tabs)/library/${item.id}`)} activeOpacity={0.7}>
      <View style={styles.gridCoverContainer}>
        {item.coverUrl ? (
          <Image source={{ uri: item.coverUrl }} style={styles.gridCover} resizeMode="cover" />
        ) : (
          <View style={[styles.gridCover, styles.gridCoverPlaceholder]}>
            <BookPlaceholderIcon size={28} color="#d4b896" />
            <Text style={styles.gridPlaceholderTitle} numberOfLines={2}>{item.title}</Text>
          </View>
        )}
        {item.status === 'reading' && (
          <View style={styles.gridProgressBar}>
            <View style={[styles.gridProgressFill, { width: `${Math.round(item.progress || 0)}%` }]} />
          </View>
        )}
        {item.status === 'completed' && (
          <View style={styles.completedBadge}>
            <CheckmarkIcon size={12} color="#fff" />
          </View>
        )}
      </View>
      <Text style={styles.gridTitle} numberOfLines={2}>{item.title}</Text>
      <Text style={styles.gridAuthor} numberOfLines={1}>{item.author}</Text>
    </TouchableOpacity>
  );

  const renderListItem = ({ item }: { item: Book }) => (
    <TouchableOpacity style={styles.listCard} onPress={() => router.push(`/(tabs)/library/${item.id}`)} activeOpacity={0.7}>
      <View style={styles.listCoverContainer}>
        {item.coverUrl ? (
          <Image source={{ uri: item.coverUrl }} style={styles.listCover} resizeMode="cover" />
        ) : (
          <View style={[styles.listCover, styles.listCoverPlaceholder]}>
            <BookPlaceholderIcon size={24} color="#d4b896" />
          </View>
        )}
        {item.status === 'reading' && (
          <View style={styles.listProgressBar}>
            <View style={[styles.listProgressFill, { width: `${Math.round(item.progress || 0)}%` }]} />
          </View>
        )}
      </View>
      <View style={styles.listInfo}>
        <Text style={styles.listTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.listAuthor} numberOfLines={1}>{item.author}</Text>
        <View style={styles.listMeta}>
          {item.status === 'reading' && (
            <Text style={styles.listProgress}>{Math.round(item.progress || 0)}% read</Text>
          )}
          {item.status === 'completed' && (
            <View style={styles.completedRow}>
              <CheckmarkIcon size={14} color="#6b9e76" />
              <Text style={styles.completedText}>Completed</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary[500]} /></View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Library</Text>
        </View>
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Connection Error</Text>
          <Text style={styles.emptySub}>{error.message}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()} activeOpacity={0.7}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={books}
        renderItem={viewMode === 'grid' ? renderGridItem : renderListItem}
        key={viewMode}
        keyExtractor={(item) => item.id}
        numColumns={viewMode === 'grid' ? GRID_COLUMNS : 1}
        columnWrapperStyle={viewMode === 'grid' ? styles.gridRow : undefined}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary[500]} />}
        ListHeaderComponent={
          <>
            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={styles.headerTitle}>Library</Text>
                <Text style={styles.headerSub}>{allBooks.length} books</Text>
              </View>
              <View style={styles.headerActions}>
                <TouchableOpacity onPress={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')} style={styles.iconBtn}>
                  {viewMode === 'grid' ? <ListIcon size={20} color={colors.navy[500]} /> : <GridIcon size={20} color={colors.navy[500]} />}
                </TouchableOpacity>
              </View>
            </View>

            {/* Search */}
            <View style={styles.searchRow}>
              <View style={styles.searchInput}>
                <SearchIcon size={18} color={colors.navy[300]} />
                <TextInput
                  style={styles.searchText}
                  placeholder="Search books..."
                  placeholderTextColor={colors.navy[300]}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
            </View>

            {/* Filter chips */}
            <View style={styles.filterRow}>
              {(['all', 'reading', 'completed', 'unread'] as FilterType[]).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterChip, filter === f && styles.filterChipActive]}
                  onPress={() => setFilter(f)}
                >
                  <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
                    {f === 'all' ? 'All' : f === 'reading' ? 'Reading' : f === 'completed' ? 'Done' : 'New'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Continue Reading Hero */}
            {heroBook && filter === 'all' && !searchQuery && (
              <TouchableOpacity
                style={styles.heroCard}
                onPress={() => router.push(`/reader/${heroBook.id}`)}
                activeOpacity={0.8}
              >
                <View style={styles.heroContent}>
                  <Text style={styles.heroLabel}>Continue Reading</Text>
                  <Text style={styles.heroTitle} numberOfLines={2}>{heroBook.title}</Text>
                  <Text style={styles.heroAuthor}>{heroBook.author}</Text>
                  <View style={styles.heroProgressRow}>
                    <View style={styles.heroProgressBar}>
                      <View style={[styles.heroProgressFill, { width: `${Math.round(heroBook.progress || 0)}%` }]} />
                    </View>
                    <Text style={styles.heroProgressText}>{Math.round(heroBook.progress || 0)}%</Text>
                  </View>
                </View>
                <View style={styles.heroActions}>
                  <TouchableOpacity style={styles.heroReadBtn} onPress={() => router.push(`/reader/${heroBook.id}`)}>
                    <Text style={styles.heroReadBtnText}>Read</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.heroChatBtn} onPress={() => router.push(`/chat/${heroBook.id}` as any)}>
                    <AISparkleIcon size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            )}

            <BookUploader onUploaded={() => queryClient.invalidateQueries({ queryKey: ['books'] })} />
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <BookPlaceholderIcon size={48} color="#d4b896" />
            <Text style={styles.emptyTitle}>{searchQuery ? 'No matches found' : 'No books yet'}</Text>
            <Text style={styles.emptySub}>{searchQuery ? 'Try a different search' : 'Upload an EPUB or PDF to get started'}</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f5f0' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  headerTitle: { ...typography.display, color: colors.navy[700] },
  headerSub: { ...typography.caption, color: colors.navy[300], marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface[0], justifyContent: 'center', alignItems: 'center', ...shadows.sm },
  searchRow: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  searchInput: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface[0], borderRadius: radius.full, paddingHorizontal: spacing.lg, height: 42, ...shadows.sm },
  searchText: { flex: 1, ...typography.body, color: colors.navy[700], marginLeft: spacing.sm, padding: 0 },
  filterRow: { flexDirection: 'row', paddingHorizontal: spacing.xl, paddingVertical: spacing.xs, gap: 8 },
  filterChip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.full, backgroundColor: colors.surface[0] },
  filterChipActive: { backgroundColor: colors.primary[500] },
  filterChipText: { ...typography.captionMedium, color: colors.navy[300] },
  filterChipTextActive: { color: '#ffffff' },
  // Hero card
  heroCard: { marginHorizontal: spacing.xl, marginVertical: spacing.md, backgroundColor: colors.surface[0], borderRadius: radius.lg, padding: spacing.xxl, ...shadows.md, borderWidth: 1, borderColor: colors.primary[200] },
  heroContent: {},
  heroLabel: { ...typography.overline, color: colors.primary[500], marginBottom: 6 },
  heroTitle: { ...typography.title, color: colors.navy[700], fontSize: 18 },
  heroAuthor: { ...typography.caption, color: colors.navy[300], marginTop: 2 },
  heroProgressRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, gap: spacing.sm },
  heroProgressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.surface[2] },
  heroProgressFill: { height: '100%', borderRadius: 2, backgroundColor: colors.primary[500] },
  heroProgressText: { ...typography.captionMedium, color: colors.primary[500], minWidth: 32 },
  heroActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  heroReadBtn: { backgroundColor: colors.primary[500], borderRadius: radius.md, paddingHorizontal: spacing.xxl, paddingVertical: spacing.md, flex: 1, alignItems: 'center' },
  heroReadBtnText: { ...typography.button, color: '#ffffff', fontSize: 14 },
  heroChatBtn: { backgroundColor: colors.forest, borderRadius: radius.md, width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  // Grid
  gridRow: { paddingHorizontal: GRID_PADDING, gap: GRID_GAP },
  gridCard: { width: CARD_WIDTH, marginBottom: spacing.lg },
  gridCoverContainer: { width: '100%', aspectRatio: 2 / 3, borderRadius: radius.sm, overflow: 'hidden', position: 'relative', ...shadows.sm },
  gridCover: { width: '100%', height: '100%' },
  gridCoverPlaceholder: { backgroundColor: colors.surface[2], justifyContent: 'center', alignItems: 'center', padding: spacing.sm },
  gridPlaceholderTitle: { ...typography.caption, color: colors.navy[400], textAlign: 'center', marginTop: 4, fontSize: 11 },
  gridProgressBar: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: colors.surface[3] },
  gridProgressFill: { height: '100%', backgroundColor: colors.primary[500] },
  gridTitle: { ...typography.captionMedium, color: colors.navy[700], marginTop: 6, fontSize: 12 },
  gridAuthor: { ...typography.caption, color: colors.navy[300], fontSize: 11, marginTop: 1 },
  completedBadge: { position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.sage, justifyContent: 'center', alignItems: 'center' },
  // List
  listCard: { flexDirection: 'row', backgroundColor: colors.surface[0], borderRadius: radius.md, marginHorizontal: spacing.xl, marginBottom: spacing.md, padding: spacing.md, ...shadows.sm },
  listCoverContainer: { width: 56, height: 76, borderRadius: radius.sm, overflow: 'hidden', position: 'relative' },
  listCover: { width: '100%', height: '100%' },
  listCoverPlaceholder: { backgroundColor: colors.surface[2], justifyContent: 'center', alignItems: 'center' },
  listProgressBar: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: colors.surface[3] },
  listProgressFill: { height: '100%', backgroundColor: colors.primary[500] },
  listInfo: { flex: 1, marginLeft: spacing.md, justifyContent: 'center' },
  listTitle: { ...typography.bodyMedium, color: colors.navy[700], fontSize: 14 },
  listAuthor: { ...typography.caption, color: colors.navy[300], marginTop: 2 },
  listMeta: { marginTop: 4 },
  listProgress: { ...typography.caption, color: colors.primary[500], fontWeight: '500' },
  completedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  completedText: { ...typography.caption, color: colors.sage, fontWeight: '500' },
  // Empty
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyTitle: { ...typography.title, color: colors.navy[500], fontSize: 16, marginTop: spacing.lg },
  emptySub: { ...typography.caption, color: colors.navy[300], marginTop: 4, textAlign: 'center', paddingHorizontal: spacing.xxxl },
  retryBtn: { backgroundColor: colors.primary[500], paddingHorizontal: spacing.xxl, paddingVertical: spacing.md, borderRadius: radius.md, marginTop: spacing.lg },
  retryBtnText: { ...typography.button, color: '#ffffff', fontSize: 14 },
});
