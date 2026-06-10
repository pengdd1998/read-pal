import { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/auth-store';
import { useCompanionStore } from '@/stores/companion-store';
import { PERSONAS } from '@/lib/personas';
import { api } from '@/lib/api';
import { colors, typography, spacing, radius, shadows } from '@/lib/theme';
import type { Book } from '@read-pal/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardStats {
  booksRead: number;
  totalPages: number;
  pagesRead: number;
  readingStreak: number;
  totalTime: string;
  conceptsLearned: number;
  connections: number;
}

interface DashboardData {
  stats: DashboardStats;
  recentBooks: {
    id: string;
    title: string;
    author: string;
    progress: number;
    lastRead: string;
    coverUrl?: string;
  }[];
  weeklyActivity: { day: string; pages: number }[];
  booksByStatus: { unread: number; reading: number; completed: number };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}

function getPersonaGreeting(personaKey: string): string {
  const greetings: Record<string, string[]> = {
    sage: [
      'Every page turned is a step toward wisdom.',
      'The best time to read was yesterday. The next best time is now.',
      'A book is a garden carried in the pocket.',
    ],
    penny: [
      'Ready for another amazing reading adventure?',
      "Let's discover something wonderful today!",
      'Your curiosity is your superpower!',
    ],
    alex: [
      "Let's make today's reading session count.",
      'Structured learning builds lasting knowledge.',
      'Focus and consistency lead to mastery.',
    ],
    quinn: [
      'What stories will unfold in your mind today?',
      'Every book is a doorway to a new universe.',
      "Let's find the unexpected connections today!",
    ],
    sam: [
      'Hey! Grab a coffee and a good chapter.',
      "No pressure, just progress. Let's go!",
      'Your reading buddy is ready when you are.',
    ],
  };
  const pool = greetings[personaKey] || greetings.sage;
  return pool[new Date().getDate() % pool.length];
}

function getLastSevenDays(): { label: string; active: boolean }[] {
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const result: { label: string; active: boolean }[] = [];
  const today = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    result.push({
      label: days[d.getDay()],
      active: i === 0, // We mark today; actual activity comes from API data
    });
  }
  return result;
}

function getInsightForBook(book: Book): string {
  const progress = Math.round(book.progress || 0);
  const chapter = Math.max(1, Math.floor((book.currentPage / Math.max(1, book.totalPages)) * 12));

  if (progress === 0) {
    return "You haven't started yet -- the first page awaits!";
  }
  if (progress < 25) {
    return `You're just getting started at Chapter ${chapter}. The story is building!`;
  }
  if (progress < 50) {
    return `Halfway through the first act at Chapter ${chapter}. Things are getting interesting!`;
  }
  if (progress < 75) {
    return `You left off around Chapter ${chapter} -- the plot is about to thicken!`;
  }
  if (progress < 100) {
    return `Almost there! Chapter ${chapter} and the finale is within reach.`;
  }
  return 'You finished this one! Time for the next adventure.';
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function GreetingHeader() {
  const user = useAuthStore((s) => s.user);
  const { selectedPersona, lastGreeting, setGreeting } = useCompanionStore();
  const persona = PERSONAS[selectedPersona];

  const greeting = useMemo(() => {
    const timeGreeting = getTimeGreeting();
    const name = user?.name ? `, ${user.name.split(' ')[0]}` : '';
    return `${timeGreeting}${name}`;
  }, [user?.name]);

  const personaLine = useMemo(() => {
    if (lastGreeting) return lastGreeting;
    const line = getPersonaGreeting(selectedPersona);
    setGreeting(line);
    return line;
  }, [selectedPersona, lastGreeting, setGreeting]);

  return (
    <View style={styles.greetingContainer}>
      <View style={styles.greetingTopRow}>
        <View style={styles.greetingTextContainer}>
          <Text style={styles.greetingText}>{greeting}</Text>
          <Text style={styles.greetingSub}>{personaLine}</Text>
        </View>
        <View style={[styles.personaBadge, { backgroundColor: persona.avatarBg }]}>
          <Ionicons name={persona.icon as any} size={22} color={persona.color} />
          <Text style={[styles.personaBadgeName, { color: persona.textColor }]}>
            {persona.name}
          </Text>
        </View>
      </View>
    </View>
  );
}

function StreakCard({ streak, weeklyActivity }: { streak: number; weeklyActivity?: { day: string; pages: number }[] }) {
  const days = getLastSevenDays();

  // Map weekly activity to our 7-day row
  const activityMap = new Map<string, number>();
  if (weeklyActivity && weeklyActivity.length > 0) {
    weeklyActivity.forEach((d) => activityMap.set(d.day, d.pages));
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date();

  return (
    <View style={styles.streakCard}>
      <View style={styles.streakHeader}>
        <Ionicons name="flame" size={24} color={colors.gamification.streak} />
        <Text style={styles.streakCount}>{streak}</Text>
        <Text style={styles.streakLabel}>day streak</Text>
      </View>
      <View style={styles.streakDotsRow}>
        {days.map((day, i) => {
          const d = new Date(today);
          d.setDate(d.getDate() - (6 - i));
          const dayLabel = dayNames[d.getDay()];
          const pagesForDay = activityMap.get(dayLabel) ?? 0;
          const isActive = pagesForDay > 0 || (i === 6 && streak > 0);

          return (
            <View key={i} style={styles.streakDotContainer}>
              <View
                style={[
                  styles.streakDot,
                  isActive
                    ? { backgroundColor: colors.gamification.streak }
                    : { backgroundColor: colors.surface[2] },
                ]}
              />
              <Text style={[styles.streakDotLabel, isActive && styles.streakDotLabelActive]}>
                {day.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function CurrentlyReadingHero({ book }: { book: Book }) {
  const { selectedPersona } = useCompanionStore();
  const persona = PERSONAS[selectedPersona];
  const progressPercent = Math.round(book.progress || 0);

  const insight = useMemo(() => getInsightForBook(book), [book]);

  const handlePress = () => {
    router.push(`/reader/${book.id}` as any);
  };

  return (
    <TouchableOpacity
      style={styles.heroCard}
      onPress={handlePress}
      activeOpacity={0.75}
      accessibilityLabel={`Continue reading ${book.title}, ${progressPercent}% complete`}
      accessibilityRole="button"
    >
      <Text style={styles.heroLabel}>Currently Reading</Text>
      <Text style={styles.heroTitle} numberOfLines={2}>
        {book.title}
      </Text>
      <Text style={styles.heroAuthor} numberOfLines={1}>
        {book.author}
      </Text>

      <View style={styles.heroProgressRow}>
        <View style={styles.heroProgressBar}>
          <View
            style={[styles.heroProgressFill, { width: `${progressPercent}%` }]}
          />
        </View>
        <Text style={styles.heroProgressText}>{progressPercent}%</Text>
      </View>

      {/* AI Insight Bubble */}
      <View style={[styles.insightBubble, { borderLeftColor: persona.color }]}>
        <View style={styles.insightBubbleHeader}>
          <Ionicons name={persona.icon as any} size={14} color={persona.color} />
          <Text style={[styles.insightBubbleName, { color: persona.textColor }]}>
            {persona.name}
          </Text>
        </View>
        <Text style={styles.insightBubbleText}>{insight}</Text>
      </View>
    </TouchableOpacity>
  );
}

function StatsStrip({ stats }: { stats: DashboardStats | null }) {
  const streak = stats?.readingStreak ?? 0;

  return (
    <View style={styles.statsStrip}>
      <View style={styles.statsStreakBox}>
        <Ionicons name="flame" size={24} color={colors.gamification.streak} />
        <Text style={styles.statsStreakValue}>{streak}</Text>
        <Text style={styles.statsStreakLabel}>day streak</Text>
      </View>
      <View style={styles.statsSecondaryRow}>
        <View style={styles.statsSecondaryBox}>
          <Text style={styles.statsSecondaryValue}>{stats?.booksRead ?? 0}</Text>
          <Text style={styles.statsSecondaryLabel}>books</Text>
        </View>
        <View style={styles.statsSecondaryBox}>
          <Text style={styles.statsSecondaryValue}>{stats?.pagesRead ?? 0}</Text>
          <Text style={styles.statsSecondaryLabel}>pages this week</Text>
        </View>
      </View>
    </View>
  );
}

function FlashcardReviewPrompt({ dueCount }: { dueCount: number }) {
  if (dueCount <= 0) return null;

  return (
    <View style={styles.flashcardCard}>
      <View style={styles.flashcardLeft}>
        <Ionicons name="layers-outline" size={22} color={colors.primary[500]} />
        <View style={styles.flashcardTextContainer}>
          <Text style={styles.flashcardTitle}>{dueCount} cards due for review</Text>
          <Text style={styles.flashcardSub}>Spaced repetition keeps knowledge fresh</Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.flashcardBtn}
        onPress={() => router.push('/(tabs)/study/session' as any)}
        activeOpacity={0.7}
        accessibilityLabel={`Start reviewing ${dueCount} flashcards`}
      >
        <Text style={styles.flashcardBtnText}>Start Review</Text>
      </TouchableOpacity>
    </View>
  );
}

function EmptyReadingState() {
  return (
    <View style={styles.emptyReadingCard}>
      <Ionicons name="book-outline" size={36} color={colors.navy[300]} />
      <Text style={styles.emptyReadingTitle}>No book in progress</Text>
      <Text style={styles.emptyReadingSub}>
        Head to your Library to start reading, and your current book will appear here.
      </Text>
      <TouchableOpacity
        style={styles.emptyReadingBtn}
        onPress={() => router.push('/(tabs)/library' as any)}
        activeOpacity={0.7}
        accessibilityLabel="Browse your library"
      >
        <Text style={styles.emptyReadingBtnText}>Browse Library</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting skeleton */}
        <View style={styles.greetingContainer}>
          <View style={styles.skeletonWide} />
          <View style={[styles.skeletonNarrow, { marginTop: spacing.sm }]} />
        </View>

        {/* Streak card skeleton */}
        <View style={[styles.streakCard, { marginHorizontal: spacing.xl }]}>
          <View style={styles.skeletonWide} />
          <View style={[styles.skeletonDots, { marginTop: spacing.md }]} />
        </View>

        {/* Hero card skeleton */}
        <View style={[styles.heroCard, { marginHorizontal: spacing.xl, height: 220 }]}>
          <View style={styles.skeletonWide} />
          <View style={[styles.skeletonNarrow, { marginTop: spacing.md }]} />
          <View style={[styles.skeletonBar, { marginTop: spacing.lg }]} />
        </View>

        {/* Stats skeleton */}
        <View style={[styles.statsStrip, { marginHorizontal: spacing.xl }]}>
          <View style={[styles.statsStreakBox, { backgroundColor: colors.surface[2] }]}>
            <View style={styles.skeletonWide} />
          </View>
          <View style={[styles.statsSecondaryRow, { marginTop: spacing.md }]}>
            {[0, 1].map((i) => (
              <View key={i} style={styles.statsSecondaryBox}>
                <View style={styles.skeletonNarrow} />
                <View style={[styles.skeletonTiny, { marginTop: spacing.xs }]} />
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Error State
// ---------------------------------------------------------------------------

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.centerContent}>
        <Ionicons name="cloud-offline-outline" size={48} color={colors.navy[300]} />
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorSub}>
          We couldn't load your dashboard. Please check your connection and try again.
        </Text>
        <TouchableOpacity style={styles.retryBtn} onPress={onRetry} activeOpacity={0.7}>
          <Text style={styles.retryBtnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function HomeScreen() {
  const {
    data: dashboardData,
    isLoading: dashboardLoading,
    error: dashboardError,
    refetch: refetchDashboard,
    isRefetching,
  } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const result = await api.get<DashboardData>('/api/stats/dashboard');
      if (!result.success) throw new Error(result.error?.message || 'Failed to load dashboard');
      return result.data!;
    },
  });

  const { data: booksData } = useQuery({
    queryKey: ['books'],
    queryFn: async () => {
      const result = await api.get<Book[]>('/api/books');
      if (!result.success) throw new Error(result.error?.message || 'Failed to load books');
      return result.data || [];
    },
  });

  const { data: dueCards } = useQuery({
    queryKey: ['flashcards-due'],
    queryFn: async () => {
      const result = await api.get<{ due: number }>('/api/flashcards/due');
      if (!result.success) return { due: 0 };
      return result.data ?? { due: 0 };
    },
  });

  const stats = dashboardData?.stats ?? null;
  const weeklyActivity = dashboardData?.weeklyActivity;
  const streak = stats?.readingStreak ?? 0;

  // Find the first book currently being read
  const currentlyReading = useMemo(() => {
    if (!booksData || booksData.length === 0) return null;
    // Prefer the most recently read book with status 'reading'
    const reading = booksData
      .filter((b) => b.status === 'reading')
      .sort((a, b) => {
        const aTime = a.lastReadAt ? new Date(a.lastReadAt).getTime() : 0;
        const bTime = b.lastReadAt ? new Date(b.lastReadAt).getTime() : 0;
        return bTime - aTime;
      });
    return reading[0] || null;
  }, [booksData]);

  const dueCardCount = dueCards?.due ?? 0;

  const handleRefresh = () => {
    refetchDashboard();
  };

  // Full-page loading state
  if (dashboardLoading && !dashboardData) {
    return <LoadingSkeleton />;
  }

  // Full-page error state (only if no cached data)
  if (dashboardError && !dashboardData) {
    return <ErrorState onRetry={() => refetchDashboard()} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            tintColor={colors.primary[500]}
          />
        }
      >
        {/* 1. Greeting Header */}
        <GreetingHeader />

        {/* 2. Reading Streak Card */}
        <StreakCard streak={streak} weeklyActivity={weeklyActivity} />

        {/* 3. Currently Reading Hero */}
        {currentlyReading ? (
          <CurrentlyReadingHero book={currentlyReading} />
        ) : (
          <EmptyReadingState />
        )}

        {/* 4. Stats Strip */}
        <StatsStrip stats={stats} />

        {/* 5. Flashcard Review Prompt */}
        <FlashcardReviewPrompt dueCount={dueCardCount} />

        {/* Bottom padding for tab bar */}
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

  scrollContent: {
    paddingTop: spacing.md,
  },

  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxxl,
  },

  // ---- Greeting Header ----

  greetingContainer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },

  greetingTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  greetingTextContainer: {
    flex: 1,
    paddingRight: spacing.md,
  },

  greetingText: {
    ...typography.display,
    fontSize: 26,
    color: colors.navy[700],
  },

  greetingSub: {
    ...typography.body,
    color: colors.navy[400],
    marginTop: spacing.xs,
  },

  personaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    gap: spacing.xs,
  },

  personaBadgeName: {
    ...typography.captionMedium,
  },

  // ---- Streak Card ----

  streakCard: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.surface[0],
    borderRadius: radius.lg,
    ...shadows.sm,
  },

  streakHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },

  streakCount: {
    ...typography.display,
    fontSize: 28,
    color: colors.gamification.streak,
  },

  streakLabel: {
    ...typography.body,
    color: colors.navy[400],
  },

  streakDotsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.sm,
  },

  streakDotContainer: {
    alignItems: 'center',
    gap: spacing.xs,
  },

  streakDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },

  streakDotLabel: {
    ...typography.caption,
    fontSize: 11,
    color: colors.navy[300],
  },

  streakDotLabelActive: {
    color: colors.gamification.streak,
    fontWeight: '600',
  },

  // ---- Currently Reading Hero ----

  heroCard: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    padding: spacing.xxl,
    backgroundColor: colors.surface[0],
    borderRadius: radius.lg,
    ...shadows.md,
    borderWidth: 1,
    borderColor: colors.primary[200],
  },

  heroLabel: {
    ...typography.overline,
    color: colors.primary[500],
    marginBottom: spacing.xs,
  },

  heroTitle: {
    ...typography.title,
    fontSize: 18,
    color: colors.navy[700],
  },

  heroAuthor: {
    ...typography.caption,
    color: colors.navy[300],
    marginTop: spacing.xs,
  },

  heroProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },

  heroProgressBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surface[2],
    overflow: 'hidden',
  },

  heroProgressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.primary[500],
  },

  heroProgressText: {
    ...typography.captionMedium,
    color: colors.primary[500],
    minWidth: 36,
  },

  // ---- AI Insight Bubble ----

  insightBubble: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.ai.bubble,
    borderRadius: radius.md,
  },

  insightBubbleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },

  insightBubbleName: {
    ...typography.captionMedium,
  },

  insightBubbleText: {
    ...typography.caption,
    color: colors.navy[600],
    lineHeight: 18,
  },

  // ---- Stats Strip ----

  statsStrip: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
  },

  statsStreakBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.06)',
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },

  statsStreakValue: {
    ...typography.display,
    fontSize: 28,
    color: colors.gamification.streak,
  },

  statsStreakLabel: {
    ...typography.body,
    color: colors.navy[400],
    flex: 1,
  },

  statsSecondaryRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },

  statsSecondaryBox: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },

  statsSecondaryValue: {
    ...typography.title,
    fontSize: 18,
    color: colors.navy[700],
  },

  statsSecondaryLabel: {
    ...typography.caption,
    color: colors.navy[400],
    marginTop: 1,
  },

  // ---- Flashcard Review Prompt ----

  flashcardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    padding: spacing.lg,
    backgroundColor: 'rgba(107, 158, 118, 0.06)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(107, 158, 118, 0.12)',
  },

  flashcardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
  },

  flashcardTextContainer: {
    flex: 1,
  },

  flashcardTitle: {
    ...typography.bodyMedium,
    color: colors.navy[700],
    fontSize: 14,
  },

  flashcardSub: {
    ...typography.caption,
    color: colors.navy[300],
    marginTop: 2,
  },

  flashcardBtn: {
    backgroundColor: colors.primary[500],
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginLeft: spacing.md,
  },

  flashcardBtnText: {
    ...typography.button,
    color: '#ffffff',
    fontSize: 13,
  },

  // ---- Empty Reading State ----

  emptyReadingCard: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    padding: spacing.xxxl,
    backgroundColor: colors.surface[0],
    borderRadius: radius.lg,
    ...shadows.sm,
    alignItems: 'center',
  },

  emptyReadingTitle: {
    ...typography.title,
    fontSize: 16,
    color: colors.navy[500],
    marginTop: spacing.md,
  },

  emptyReadingSub: {
    ...typography.caption,
    color: colors.navy[300],
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 18,
    paddingHorizontal: spacing.md,
  },

  emptyReadingBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary[500],
    borderRadius: radius.md,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
  },

  emptyReadingBtnText: {
    ...typography.button,
    color: '#ffffff',
    fontSize: 14,
  },

  // ---- Error State ----

  errorTitle: {
    ...typography.title,
    color: colors.navy[500],
    marginTop: spacing.lg,
  },

  errorSub: {
    ...typography.body,
    color: colors.navy[300],
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 22,
  },

  retryBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary[500],
    borderRadius: radius.md,
    paddingHorizontal: spacing.xxxl,
    paddingVertical: spacing.lg,
  },

  retryBtnText: {
    ...typography.button,
    color: '#ffffff',
  },

  // ---- Skeleton ----

  skeletonWide: {
    width: '60%',
    height: 20,
    borderRadius: radius.sm,
    backgroundColor: colors.surface[2],
  },

  skeletonNarrow: {
    width: '40%',
    height: 14,
    borderRadius: radius.sm,
    backgroundColor: colors.surface[2],
  },

  skeletonTiny: {
    width: '30%',
    height: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.surface[2],
  },

  skeletonBar: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surface[2],
  },

  skeletonCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface[2],
  },

  skeletonDots: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
});
