import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { api } from '../../lib/api';
import { Colors, Spacing, Typography, BorderRadius, defaultStyles } from '../../lib/theme';
import { API_ROUTES } from '@read-pal/shared';

/** Subset of User fields we actually display – avoids relying on strict shared types
 *  that require Date objects (JSON returns strings). */
interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

interface DashboardStats {
  booksRead: number;
  totalPages: number;
  pagesRead: number;
  readingStreak: number;
  totalTime: string;
  conceptsLearned: number;
  connections: number;
  chatMessageCount?: number;
  memoryBookCount?: number;
}

interface DashboardResponse {
  stats: DashboardStats;
  recentBooks: Array<{
    id: string;
    title: string;
    author: string;
    progress: number;
    lastRead: string;
    coverUrl?: string;
  }>;
  weeklyActivity: Array<{
    day: string;
    pages: number;
    minutes: number;
  }>;
  booksByStatus: Record<string, number>;
}

interface SessionData {
  id: string;
  startedAt: string;
  duration: number;
  pagesRead: number;
}

interface ProfileProps {
  navigation: any;
  setAuth: (token: string | null) => void;
}

export function ProfileScreen({ setAuth }: ProfileProps) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    booksRead: 0,
    totalPages: 0,
    pagesRead: 0,
    readingStreak: 0,
    totalTime: '0m',
    conceptsLearned: 0,
    connections: 0,
  });
  const [weeklyActivity, setWeeklyActivity] = useState<Array<{ day: string; pages: number; minutes: number }>>([]);
  const [recentSessions, setRecentSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      try {
        const [userRes, statsRes, sessionsRes] = await Promise.all([
          api.get<UserProfile>(API_ROUTES.AUTH_ME),
          api.get<DashboardResponse>(API_ROUTES.STATS_DASHBOARD),
          api.get<SessionData[]>('/api/reading-sessions?limit=7').catch(() => ({ success: false, data: null })),
        ]);
        if (userRes.success && userRes.data) setUser(userRes.data as unknown as UserProfile);
        if (statsRes.success && statsRes.data) {
          const dashboard = statsRes.data as unknown as DashboardResponse;
          setStats(dashboard.stats);
          setWeeklyActivity(dashboard.weeklyActivity || []);
        }
        if (sessionsRes.success && sessionsRes.data) {
          setRecentSessions((sessionsRes.data as unknown as SessionData[]) || []);
        }
      } catch {
        // Profile load failure
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  async function handleLogout() {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.post(API_ROUTES.AUTH_LOGOUT);
          } catch {
            // Logout endpoint failure is non-critical
          }
          setAuth(null);
        },
      },
    ]);
  }

  function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
  }

  const maxWeeklyPages = Math.max(...weeklyActivity.map((d) => d.pages), 1);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.container}>
      <View style={styles.avatarRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.name?.charAt(0)?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <View style={styles.nameCol}>
          <Text style={{ ...Typography.h3, color: Colors.text }}>{user?.name ?? 'Reader'}</Text>
          <Text style={{ ...Typography.bodySmall, color: Colors.textSecondary }}>{user?.email ?? ''}</Text>
        </View>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.booksRead}</Text>
          <Text style={styles.statLabel}>Books</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.pagesRead}</Text>
          <Text style={styles.statLabel}>Pages</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.readingStreak}</Text>
          <Text style={styles.statLabel}>Streak</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.totalTime}</Text>
          <Text style={styles.statLabel}>Time</Text>
        </View>
      </View>

      {/* Weekly Activity Chart */}
      {weeklyActivity.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>This Week</Text>
          <View style={styles.barChart}>
            {weeklyActivity.map((day, i) => {
              const height = Math.max(4, (day.pages / maxWeeklyPages) * 80);
              return (
                <View key={i} style={styles.barCol}>
                  <Text style={styles.barValue}>{day.pages}</Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { height }]} />
                  </View>
                  <Text style={styles.barLabel}>{day.day}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Recent Sessions */}
      {recentSessions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Sessions</Text>
          {recentSessions.slice(0, 5).map((session, i) => (
            <View key={i} style={styles.sessionRow}>
              <View style={styles.sessionDot} />
              <Text style={styles.sessionDate}>
                {new Date(session.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </Text>
              <Text style={styles.sessionPages}>{session.pagesRead} pages</Text>
              <Text style={styles.sessionDuration}>{formatDuration(session.duration)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Achievements Preview */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Achievements</Text>
        <View style={styles.achievementsRow}>
          {[
            { emoji: '📖', label: 'First Book', unlocked: stats.booksRead >= 1 },
            { emoji: '🔥', label: '7-Day Streak', unlocked: stats.readingStreak >= 7 },
            { emoji: '💡', label: '10 Highlights', unlocked: stats.conceptsLearned >= 10 },
            { emoji: '🏆', label: '5 Books', unlocked: stats.booksRead >= 5 },
          ].map((badge) => (
            <View key={badge.label} style={[styles.badge, !badge.unlocked && styles.badgeLocked]}>
              <Text style={[styles.badgeEmoji, !badge.unlocked && styles.badgeEmojiLocked]}>{badge.emoji}</Text>
              <Text style={styles.badgeLabel}>{badge.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <TouchableOpacity style={defaultStyles.button} onPress={handleLogout}>
        <Text style={defaultStyles.buttonText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1, backgroundColor: Colors.background },
  container: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  avatarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.xl },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  avatarText: { ...Typography.h2, color: Colors.white },
  nameCol: { flex: 1 },
  statsRow: { flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.lg },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  statValue: { ...Typography.h3, color: Colors.primary, fontSize: 18 },
  statLabel: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2, fontSize: 10 },
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
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 100,
    gap: Spacing.xs,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  barValue: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  barTrack: {
    width: '100%',
    height: 80,
    backgroundColor: Colors.gray100,
    borderRadius: 4,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 4,
    minHeight: 4,
  },
  barLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    gap: Spacing.sm,
  },
  sessionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  sessionDate: {
    ...Typography.caption,
    color: Colors.textSecondary,
    flex: 1,
  },
  sessionPages: {
    ...Typography.caption,
    color: Colors.text,
  },
  sessionDuration: {
    ...Typography.caption,
    color: Colors.primary,
    fontWeight: '600',
    minWidth: 40,
    textAlign: 'right',
  },
  achievementsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  badge: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
  },
  badgeLocked: { opacity: 0.4 },
  badgeEmoji: { fontSize: 24, marginBottom: 2 },
  badgeEmojiLocked: { opacity: 0.5 },
  badgeLabel: { fontSize: 9, color: Colors.textSecondary, textAlign: 'center' },
});
