import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { useStudyStore } from '@/stores/study-store';
import { colors, typography, spacing, radius, shadows } from '@/lib/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Flashcard {
  id: string;
  bookId: string;
  front: string;
  back: string;
  dueAt: string;
  interval: number;
  easeFactor: number;
  repetitions: number;
}

interface DueCardsResponse {
  cards: Flashcard[];
  totalDue: number;
}

interface ReviewResponse {
  nextReview: string;
  interval: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - spacing.xl * 2;

const RATINGS = [
  { key: 'again', label: 'Again', rating: 0, color: colors.gamification.again, estimate: '10m' },
  { key: 'hard', label: 'Hard', rating: 2, color: colors.gamification.hard, estimate: '1d' },
  { key: 'good', label: 'Good', rating: 4, color: colors.gamification.good, estimate: '3d' },
  { key: 'easy', label: 'Easy', rating: 5, color: colors.gamification.easy, estimate: '7d' },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function getEncouragement(accuracy: number): string {
  if (accuracy >= 90) return "Outstanding work! You truly know this material inside out.";
  if (accuracy >= 75) return "Great session! Your recall is getting stronger every day.";
  if (accuracy >= 50) return "Nice effort! Every review brings you closer to mastery.";
  return "Keep going! Repetition is the key to lasting knowledge.";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StudySessionScreen() {
  const { cardsReviewed, totalCards, addReview, clearSession } = useStudyStore();

  // Card state
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Session timing
  const startTime = useRef(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Flip animation
  const flipAnim = useRef(new Animated.Value(0)).current;
  const frontOpacity = flipAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0, 0],
  });
  const backOpacity = flipAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });
  const frontRotate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '90deg'],
  });
  const backRotate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['-90deg', '0deg'],
  });

  const currentCard = cards[currentIndex] || null;
  const isComplete = cards.length > 0 && currentIndex >= cards.length;
  const progress = cards.length > 0 ? Math.min(currentIndex / cards.length, 1) : 0;
  const accuracy =
    cardsReviewed > 0
      ? Math.round(
          (useStudyStore
            .getState()
            .reviewResults.filter((r) => r.rating >= 3).length /
            cardsReviewed) *
            100,
        )
      : 0;

  // ---------------------------------------------------------------------------
  // Fetch due cards on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function fetchCards() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await api.get<DueCardsResponse>('/api/flashcards/due');
        if (cancelled) return;
        if (!result.success) {
          setError(result.error?.message || 'Failed to load cards');
          return;
        }
        const fetched = result.data?.cards || [];
        if (fetched.length === 0) {
          setError('No cards due for review right now.');
          return;
        }
        setCards(fetched);
      } catch {
        if (!cancelled) setError('Something went wrong loading your cards.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchCards();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Session timer
  // ---------------------------------------------------------------------------

  useEffect(() => {
    startTime.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime.current) / 1000));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Flip logic
  // ---------------------------------------------------------------------------

  const flipToFront = useCallback(() => {
    Animated.timing(flipAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setIsFlipped(false));
  }, [flipAnim]);

  const flipToBack = useCallback(() => {
    Animated.timing(flipAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setIsFlipped(true));
  }, [flipAnim]);

  const handleFlip = useCallback(() => {
    if (isFlipped) {
      flipToFront();
    } else {
      flipToBack();
    }
  }, [isFlipped, flipToFront, flipToBack]);

  // ---------------------------------------------------------------------------
  // Rate card
  // ---------------------------------------------------------------------------

  const handleRate = useCallback(
    async (rating: number) => {
      if (!currentCard || isReviewing) return;
      setIsReviewing(true);

      // Record locally
      addReview(currentCard.id, rating);

      // Send to server
      await api.post<ReviewResponse>(`/api/flashcards/${currentCard.id}/review`, {
        rating,
      });

      // Move to next card
      setIsFlipped(false);
      flipAnim.setValue(0);
      setCurrentIndex((prev) => prev + 1);
      setIsReviewing(false);
    },
    [currentCard, isReviewing, addReview, flipAnim],
  );

  // ---------------------------------------------------------------------------
  // Finish session
  // ---------------------------------------------------------------------------

  const handleDone = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    clearSession();
    router.back();
  }, [clearSession]);

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={handleDone} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={colors.navy[400]} />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
          <Text style={styles.loadingText}>Loading your cards...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------------------
  // Error / no cards
  // ---------------------------------------------------------------------------

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={handleDone} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={colors.navy[400]} />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <Ionicons name="school-outline" size={56} color={colors.navy[200]} />
          <Text style={styles.emptyTitle}>No Cards to Review</Text>
          <Text style={styles.emptySub}>{error}</Text>
          <TouchableOpacity style={styles.doneBtn} onPress={handleDone}>
            <Text style={styles.doneBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------------------
  // Session Complete
  // ---------------------------------------------------------------------------

  if (isComplete) {
    if (timerRef.current) clearInterval(timerRef.current);

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          {/* Celebration card */}
          <View style={styles.celebrationCard}>
            <View style={styles.celebrationIcon}>
              <Ionicons name="checkmark-circle" size={56} color={colors.gamification.completion} />
            </View>
            <Text style={styles.celebrationTitle}>Session Complete!</Text>

            <View style={styles.celebrationStats}>
              <View style={styles.celebrationStat}>
                <Text style={styles.celebrationStatValue}>{cardsReviewed}</Text>
                <Text style={styles.celebrationStatLabel}>Cards Reviewed</Text>
              </View>
              <View style={styles.celebrationDivider} />
              <View style={styles.celebrationStat}>
                <Text style={styles.celebrationStatValue}>{accuracy}%</Text>
                <Text style={styles.celebrationStatLabel}>Accuracy</Text>
              </View>
              <View style={styles.celebrationDivider} />
              <View style={styles.celebrationStat}>
                <Text style={styles.celebrationStatValue}>{formatTime(elapsedSeconds)}</Text>
                <Text style={styles.celebrationStatLabel}>Time Spent</Text>
              </View>
            </View>

            {/* AI encouragement */}
            <View style={styles.encouragementCard}>
              <Ionicons name="sparkles" size={16} color={colors.primary[500]} />
              <Text style={styles.encouragementText}>
                {getEncouragement(accuracy)}
              </Text>
            </View>

            <TouchableOpacity style={styles.doneBtn} onPress={handleDone} activeOpacity={0.7}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------------------
  // Active Review
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.container}>
      {/* Header / Close */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={handleDone} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={colors.navy[400]} />
        </TouchableOpacity>
        <Text style={styles.headerCount}>
          {currentIndex + 1} / {cards.length}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Progress Bar */}
      <View style={styles.progressTrack}>
        <Animated.View
          style={[
            styles.progressFill,
            { width: `${Math.round(progress * 100)}%` },
          ]}
        />
      </View>

      {/* Flashcard */}
      <View style={styles.cardContainer}>
        <TouchableOpacity
          activeOpacity={0.95}
          onPress={handleFlip}
          style={styles.cardTouchable}
        >
          {/* Front */}
          <Animated.View
            style={[
              styles.cardFace,
              styles.cardFront,
              {
                opacity: frontOpacity,
                transform: [{ perspective: 1000 }, { rotateY: frontRotate }],
              },
            ]}
            pointerEvents={isFlipped ? 'none' : 'auto'}
          >
            <View style={styles.cardLabelRow}>
              <Text style={styles.cardLabel}>QUESTION</Text>
            </View>
            <Text style={styles.cardFrontText}>{currentCard?.front}</Text>
            <Text style={styles.cardTapHint}>Tap to reveal answer</Text>
          </Animated.View>

          {/* Back */}
          <Animated.View
            style={[
              styles.cardFace,
              styles.cardBack,
              {
                opacity: backOpacity,
                transform: [{ perspective: 1000 }, { rotateY: backRotate }],
              },
            ]}
            pointerEvents={isFlipped ? 'auto' : 'none'}
          >
            <View style={styles.cardLabelRow}>
              <Text style={[styles.cardLabel, { color: colors.gamification.good }]}>ANSWER</Text>
            </View>
            <Text style={styles.cardBackText}>{currentCard?.back}</Text>
          </Animated.View>
        </TouchableOpacity>
      </View>

      {/* Rating Buttons */}
      {isFlipped && (
        <View style={styles.ratingContainer}>
          <Text style={styles.ratingPrompt}>How well did you know this?</Text>
          <View style={styles.ratingRow}>
            {RATINGS.map((r) => (
              <TouchableOpacity
                key={r.key}
                style={[styles.ratingBtn, { backgroundColor: r.color }]}
                onPress={() => handleRate(r.rating)}
                disabled={isReviewing}
                activeOpacity={0.7}
              >
                <Text style={styles.ratingBtnLabel}>{r.label}</Text>
                <Text style={styles.ratingBtnEstimate}>{r.estimate}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
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
    paddingHorizontal: spacing.xl,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCount: {
    ...typography.bodyMedium,
    color: colors.navy[400],
    fontSize: 14,
  },

  // Progress Bar
  progressTrack: {
    height: 3,
    backgroundColor: colors.surface[2],
    marginHorizontal: spacing.xl,
    borderRadius: 1.5,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary[500],
    borderRadius: 1.5,
  },

  // Card
  cardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTouchable: {
    width: CARD_WIDTH,
    height: 380,
  },
  cardFace: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: radius.xl,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
    backfaceVisibility: 'hidden',
    ...shadows.lg,
  },
  cardFront: {
    backgroundColor: colors.surface[0],
  },
  cardBack: {
    backgroundColor: '#fefdfb',
    borderWidth: 2,
    borderColor: 'rgba(107, 158, 118, 0.15)',
  },
  cardLabelRow: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.lg,
  },
  cardLabel: {
    ...typography.overline,
    color: colors.navy[300],
    letterSpacing: 1.0,
  },
  cardFrontText: {
    ...typography.display,
    fontFamily: 'Crimson Pro',
    fontSize: 22,
    lineHeight: 30,
    color: colors.navy[700],
    textAlign: 'center',
  },
  cardBackText: {
    ...typography.display,
    fontFamily: 'Crimson Pro',
    fontSize: 20,
    lineHeight: 28,
    color: colors.navy[600],
    textAlign: 'center',
  },
  cardTapHint: {
    ...typography.caption,
    color: colors.navy[200],
    position: 'absolute',
    bottom: spacing.lg,
  },

  // Rating
  ratingContainer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  ratingPrompt: {
    ...typography.caption,
    color: colors.navy[300],
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ratingBtn: {
    flex: 1,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
  },
  ratingBtnLabel: {
    ...typography.button,
    color: '#ffffff',
    fontSize: 13,
  },
  ratingBtnEstimate: {
    ...typography.caption,
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 11,
    marginTop: 2,
  },

  // Session Complete
  celebrationCard: {
    width: '100%',
    backgroundColor: colors.surface[0],
    borderRadius: radius.xl,
    padding: spacing.xxxl,
    alignItems: 'center',
    ...shadows.lg,
  },
  celebrationIcon: {
    marginBottom: spacing.lg,
  },
  celebrationTitle: {
    ...typography.display,
    fontSize: 24,
    color: colors.navy[700],
    marginBottom: spacing.xxl,
  },
  celebrationStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  celebrationStat: {
    flex: 1,
    alignItems: 'center',
  },
  celebrationStatValue: {
    ...typography.title,
    fontSize: 20,
    color: colors.navy[700],
    marginBottom: 4,
  },
  celebrationStatLabel: {
    ...typography.caption,
    color: colors.navy[300],
    fontSize: 11,
  },
  celebrationDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.surface[2],
  },
  encouragementCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.ai.bubble,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.xxl,
    width: '100%',
    gap: spacing.sm,
  },
  encouragementText: {
    ...typography.body,
    color: colors.navy[500],
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  doneBtn: {
    backgroundColor: colors.primary[500],
    borderRadius: radius.md,
    paddingHorizontal: spacing.xxxl,
    paddingVertical: spacing.lg,
    width: '100%',
    alignItems: 'center',
  },
  doneBtnText: {
    ...typography.button,
    color: '#ffffff',
    fontSize: 15,
  },

  // Loading / Empty
  loadingText: {
    ...typography.caption,
    color: colors.navy[300],
    marginTop: spacing.md,
  },
  emptyTitle: {
    ...typography.title,
    color: colors.navy[500],
    fontSize: 16,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  emptySub: {
    ...typography.caption,
    color: colors.navy[300],
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
});
