import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { api } from '../../lib/api';
import { Colors, Spacing, Typography, BorderRadius } from '../../lib/theme';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

function getNotificationIcon(type: string): string {
  switch (type) {
    case 'reading_reminder': return '📖';
    case 'streak_alert':
    case 'streak_milestone': return '🔥';
    case 'friend_message': return '💬';
    case 'book_completed': return '🎉';
    case 'goal_progress': return '🎯';
    default: return '📬';
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

export function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadNotifications();
  }, []);

  async function loadNotifications() {
    try {
      const res = await api.get<Notification[]>('/api/notifications?limit=30');
      if (res.success && res.data) {
        setNotifications((res.data as unknown as Notification[]) || []);
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function markAsRead(id: string) {
    try {
      await api.patch(`/api/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
    } catch {
      // Non-critical
    }
  }

  async function markAllRead() {
    try {
      await api.post('/api/notifications/mark-all-read');
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // Non-critical
    }
  }

  function handleRefresh() {
    setRefreshing(true);
    loadNotifications();
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  function renderItem({ item }: { item: Notification }) {
    return (
      <TouchableOpacity
        style={[styles.notifCard, !item.read && styles.notifCardUnread]}
        onPress={() => !item.read && markAsRead(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.notifRow}>
          <Text style={styles.notifIcon}>{getNotificationIcon(item.type)}</Text>
          <View style={styles.notifContent}>
            <View style={styles.notifHeader}>
              <Text style={styles.notifTitle}>{item.title}</Text>
              {!item.read && <View style={styles.unreadDot} />}
            </View>
            <Text style={styles.notifBody} numberOfLines={3}>{item.body}</Text>
            <Text style={styles.notifTime}>{timeAgo(item.createdAt)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
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
      {/* Header bar */}
      {unreadCount > 0 && (
        <View style={styles.headerBar}>
          <Text style={styles.headerText}>{unreadCount} unread</Text>
          <TouchableOpacity onPress={markAllRead}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={notifications.length === 0 ? styles.emptyList : undefined}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📬</Text>
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptyDesc}>
              Reading reminders, streak alerts, and friend insights will appear here.
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerText: { ...Typography.caption, color: Colors.textSecondary, fontWeight: '600' },
  markAllText: { ...Typography.caption, color: Colors.primary, fontWeight: '600' },
  emptyList: { flexGrow: 1 },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
  },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
  emptyTitle: { ...Typography.h3, color: Colors.text, marginBottom: Spacing.xs },
  emptyDesc: { ...Typography.bodySmall, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  notifCard: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  notifCardUnread: {
    backgroundColor: Colors.primaryLight + '15',
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  notifRow: { flexDirection: 'row', gap: Spacing.md },
  notifIcon: { fontSize: 28, marginTop: 2 },
  notifContent: { flex: 1 },
  notifHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: 2 },
  notifTitle: { ...Typography.body, fontWeight: '600', color: Colors.text, flex: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  notifBody: { ...Typography.caption, color: Colors.textSecondary, lineHeight: 18, marginBottom: 4 },
  notifTime: { ...Typography.caption, color: Colors.textSecondary, fontSize: 11, opacity: 0.7 },
});
