import { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { useStudyStore } from '@/stores/study-store';
import { colors, typography, spacing, radius, shadows } from '@/lib/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FlashcardDeck {
  id: string;
  bookId: string;
  bookTitle: string;
  bookAuthor?: string;
  totalCards: number;
  dueCards: number;
  mastery: number; // 0-1
}

interface DecksResponse {
  decks: FlashcardDeck[];
  totalCards: number;
  totalDue: number;
}

interface DueCardsResponse {
  items: any[];
  count: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMastery(value: number): string {
  return `${Math.round(value * 100)}%`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StudyDashboardScreen() {
  const queryClient = useQueryClient();
  const { startSession } = useStudyStore();

  // Fetch decks
  const {
    data: decksData,
    isLoading: decksLoading,
    error: decksError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['flashcard-decks'],
    queryFn: async () => {
      const result = await api.get<DecksResponse>('/api/flashcards/decks');
      if (!result.success) throw new Error(result.error?.message || 'Failed to load decks');
      const data = result.data as DecksResponse | null;
      return data?.decks || [];
    },
  });

  // Fetch due cards summary
  const { data: dueData, isLoading: dueLoading } = useQuery({
    queryKey: ['flashcards-due'],
    queryFn: async () => {
      const result = await api.get<DueCardsResponse>('/api/flashcards/due');
      if (!result.success) throw new Error(result.error?.message || 'Failed to load due cards');
      const data = result.data as DueCardsResponse | null;
      return data?.count ?? 0;
    },
  });

  // Study stats - derive from dashboard stats since /flashcards/stats doesn't exist
  const { data: statsData } = useQuery({
    queryKey: ['study-stats'],
    queryFn: async () => {
      const result = await api.get<any>('/api/stats/dashboard');
      if (!result.success) return { reviewedToday: 0, currentStreak: 0, mastery: 0 };
      const s = result.data?.stats;
      return {
        reviewedToday: s?.pagesRead || 0,
        currentStreak: s?.readingStreak || 0,
        mastery: 0,
      };
    },
  });

  const decks = decksData || [];
  const totalDue = dueData ?? 0;
  const stats = statsData || { reviewedToday: 0, currentStreak: 0, mastery: 0 };

  const handleStartReview = useCallback(() => {
    router.push('/(tabs)/study/session' as any);
  }, []);

  const handleDeckPress = useCallback(
    (deck: FlashcardDeck) => {
      startSession(deck.bookId, deck.dueCards);
      router.push('/(tabs)/study/session' as any);
    },
    [startSession],
  );

  const handleRetry = useCallback(() => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['flashcards-due'] });
    queryClient.invalidateQueries({ queryKey: ['study-stats'] });
  }, [refetch, queryClient]);

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  if (decksLoading || dueLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Study</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------------------
  // Error
  // ---------------------------------------------------------------------------

  if (decksError) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Study</Text>
        </View>
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.navy[300]} />
          <Text style={styles.emptyTitle}>Connection Error</Text>
          <Text style={styles.emptySub}>{decksError.message}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={handleRetry} activeOpacity={0.7}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRetry}
            tintColor={colors.primary[500]}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Study</Text>
            <Text style={styles.headerSub}>Review your flashcards</Text>
          </View>
        </View>

        {/* Due Cards Prompt */}
        {totalDue > 0 && (
          <TouchableOpacity
            style={styles.heroCard}
            onPress={handleStartReview}
            activeOpacity={0.8}
          >
            <View style={styles.heroContent}>
              <View style={styles.heroTextContainer}>
                <Text style={styles.heroTitle}>Time to review!</Text>
                <Text style={styles.heroSub}>
                  {totalDue} card{totalDue !== 1 ? 's' : ''} waiting. A quick session keeps your knowledge fresh.
                </Text>
              </View>
              <View style={styles.heroButton}>
                <Text style={styles.heroButtonText}>Review</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.surface[0]} />
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={[styles.statBox, { backgroundColor: 'rgba(217, 119, 6, 0.06)' }]}>
            <Ionicons name="checkmark-done-outline" size={16} color={colors.primary[500]} />
            <Text style={styles.statValue}>{stats.reviewedToday}</Text>
            <Text style={styles.statLabel}>Reviewed Today</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: 'rgba(245, 158, 11, 0.06)' }]}>
            <Ionicons name="flame-outline" size={16} color={colors.gamification.streak} />
            <Text style={styles.statValue}>{stats.currentStreak}</Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: 'rgba(107, 158, 118, 0.06)' }]}>
            <Ionicons name="trophy-outline" size={16} color={colors.gamification.mastery} />
            <Text style={styles.statValue}>{formatMastery(stats.mastery)}</Text>
            <Text style={styles.statLabel}>Mastery</Text>
          </View>
        </View>

        {/* Decks Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your Decks</Text>
          <Text style={styles.sectionCount}>{decks.length} deck{decks.length !== 1 ? 's' : ''}</Text>
        </View>

        {decks.length === 0 ? (
          /* Empty State */
          <View style={styles.emptyState}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="school-outline" size={56} color={colors.navy[200]} />
            </View>
            <Text style={styles.emptyTitle}>No flashcards yet</Text>
            <Text style={styles.emptySub}>
              Read and highlight to create flashcards automatically.
              They will appear here as study decks.
            </Text>
          </View>
        ) : (
          /* Deck List */
          decks.map((deck) => (
            <TouchableOpacity
              key={deck.id}
              style={styles.deckCard}
              onPress={() => handleDeckPress(deck)}
              activeOpacity={0.7}
            >
              <View style={styles.deckHeader}>
                <View style={styles.deckInfo}>
                  <Text style={styles.deckTitle} numberOfLines={1}>
                    {deck.bookTitle}
                  </Text>
                  {deck.bookAuthor ? (
                    <Text style={styles.deckAuthor} numberOfLines={1}>
                      {deck.bookAuthor}
                    </Text>
                  ) : null}
                </View>
                {deck.dueCards > 0 && (
                  <View style={styles.dueBadge}>
                    <Text style={styles.dueBadgeText}>{deck.dueCards} due</Text>
                  </View>
                )}
              </View>

              {/* Progress bar */}
              <View style={styles.deckProgressRow}>
                <View style={styles.deckProgressBar}>
                  <View
                    style={[
                      styles.deckProgressFill,
                      { width: `${Math.round(deck.mastery * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.deckProgressText}>
                  {formatMastery(deck.mastery)} mastery
                </Text>
              </View>

              <View style={styles.deckMeta}>
                <Text style={styles.deckMetaText}>
                  {deck.totalCards} card{deck.totalCards !== 1 ? 's' : ''}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}

        {/* Bottom spacing for tab bar */}
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface[1],
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  scrollContent: {
    paddingBottom: 20,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    ...typography.display,
    color: colors.navy[700],
  },
  headerSub: {
    ...typography.caption,
    color: colors.navy[300],
    marginTop: 2,
  },

  // Hero Card
  heroCard: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    backgroundColor: 'rgba(217, 119, 6, 0.06)',
    borderRadius: radius.lg,
    padding: spacing.xxl,
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.15)',
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  heroTextContainer: {
    flex: 1,
  },
  heroTitle: {
    ...typography.title,
    fontSize: 17,
    color: colors.navy[700],
  },
  heroSub: {
    ...typography.caption,
    color: colors.navy[400],
    marginTop: 4,
    lineHeight: 18,
  },
  heroButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary[500],
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    gap: spacing.xs,
  },
  heroButtonText: {
    ...typography.button,
    color: '#ffffff',
    fontSize: 14,
  },

  // Stats Row
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.surface[0],
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    ...shadows.sm,
  },
  statValue: {
    ...typography.title,
    fontSize: 18,
    color: colors.navy[700],
    marginBottom: 2,
  },
  statLabel: {
    ...typography.caption,
    color: colors.navy[300],
    fontSize: 11,
  },

  // Section
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.title,
    fontSize: 18,
    color: colors.navy[700],
  },
  sectionCount: {
    ...typography.caption,
    color: colors.navy[300],
  },

  // Deck Card
  deckCard: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    backgroundColor: colors.surface[0],
    borderRadius: radius.md,
    padding: spacing.lg,
    ...shadows.sm,
  },
  deckHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  deckInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  deckTitle: {
    ...typography.bodyMedium,
    color: colors.navy[700],
    fontSize: 15,
  },
  deckAuthor: {
    ...typography.caption,
    color: colors.navy[300],
    marginTop: 2,
  },
  dueBadge: {
    backgroundColor: 'rgba(217, 119, 6, 0.12)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  dueBadgeText: {
    ...typography.captionMedium,
    color: colors.primary[600],
    fontSize: 12,
  },
  deckProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  deckProgressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surface[2],
  },
  deckProgressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.gamification.mastery,
  },
  deckProgressText: {
    ...typography.caption,
    color: colors.navy[300],
    minWidth: 70,
    textAlign: 'right',
  },
  deckMeta: {
    marginTop: spacing.xs,
  },
  deckMetaText: {
    ...typography.caption,
    color: colors.navy[200],
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: 32,
    paddingHorizontal: spacing.xxxl,
  },
  emptyIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surface[2],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    ...typography.title,
    color: colors.navy[500],
    fontSize: 16,
    marginBottom: spacing.xs,
  },
  emptySub: {
    ...typography.caption,
    color: colors.navy[300],
    textAlign: 'center',
    lineHeight: 20,
  },

  // Error / Retry
  retryBtn: {
    backgroundColor: colors.primary[500],
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.lg,
  },
  retryBtnText: {
    ...typography.button,
    color: '#ffffff',
    fontSize: 14,
  },
});
