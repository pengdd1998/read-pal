import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { api } from '../../lib/api';
import { Colors, Spacing, Typography, BorderRadius, defaultStyles } from '../../lib/theme';
import type { User } from '@read-pal/shared';
import { API_ROUTES } from '@read-pal/shared';

interface DashboardStats {
  booksRead: number;
  totalPages: number;
  pagesRead: number;
  readingStreak: number;
  totalTime: string;
  conceptsLearned: number;
  connections: number;
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

interface ProfileProps {
  navigation: any;
  setAuth: (token: string | null) => void;
}

export function ProfileScreen({ navigation, setAuth }: ProfileProps) {
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    booksRead: 0,
    totalPages: 0,
    pagesRead: 0,
    readingStreak: 0,
    totalTime: '0m',
    conceptsLearned: 0,
    connections: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      try {
        const [userRes, statsRes] = await Promise.all([
          api.get<User>(API_ROUTES.AUTH_ME),
          api.get<DashboardResponse>(API_ROUTES.STATS_DASHBOARD),
        ]);
        if (userRes.success && userRes.data) setUser(userRes.data as unknown as User);
        if (statsRes.success && statsRes.data) {
          const dashboard = statsRes.data as unknown as DashboardResponse;
          setStats(dashboard.stats);
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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
          <Text style={styles.statLabel}>Day Streak</Text>
        </View>
      </View>

      <TouchableOpacity style={defaultStyles.button} onPress={handleLogout}>
        <Text style={defaultStyles.buttonText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: Spacing.lg },
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
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.xxl },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  statValue: { ...Typography.h2, color: Colors.primary },
  statLabel: { ...Typography.caption, color: Colors.textSecondary, marginTop: Spacing.xs },
});
