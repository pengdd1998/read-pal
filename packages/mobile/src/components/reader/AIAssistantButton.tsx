import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated, Text, AccessibilityInfo } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadows, spacing, radius, typography } from '@/lib/theme';

interface QuickAction {
  label: string;
  icon: string;
  action: () => void;
}

interface AIAssistantButtonProps {
  onPress: () => void;
  onQuickAction?: (action: string) => void;
  hasSelection?: boolean;
}

export default function AIAssistantButton({ onPress, onQuickAction, hasSelection = false }: AIAssistantButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [showMenu, setShowMenu] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!hasSelection || reduceMotion) {
      scaleAnim.setValue(1);
      return;
    }
    Animated.spring(scaleAnim, {
      toValue: 1.08,
      friction: 3,
      tension: 200,
      useNativeDriver: true,
    }).start(() => {
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 3,
        tension: 200,
        useNativeDriver: true,
      }).start();
    });
  }, [hasSelection, reduceMotion]);

  const quickActions: QuickAction[] = [
    { label: 'Summarize', icon: 'document-text-outline', action: () => { setShowMenu(false); onQuickAction?.('summarize'); } },
    { label: 'Explain', icon: 'help-circle-outline', action: () => { setShowMenu(false); onQuickAction?.('explain'); } },
    { label: 'Questions', icon: 'chatbubbles-outline', action: () => { setShowMenu(false); onQuickAction?.('questions'); } },
    { label: 'Full Chat', icon: 'chatbubble-outline', action: () => { setShowMenu(false); onPress(); } },
  ];

  return (
    <>
      {showMenu && (
        <View style={styles.menuOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => setShowMenu(false)}
            accessibilityLabel="Close menu"
          />
          <View style={styles.menu}>
            {quickActions.map((qa, i) => (
              <TouchableOpacity
                key={i}
                style={styles.menuItem}
                onPress={qa.action}
                accessibilityLabel={qa.label}
              >
                <Ionicons name={qa.icon as any} size={18} color={colors.navy[500]} />
                <Text style={styles.menuItemText}>{qa.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <TouchableOpacity
          style={[styles.fab, hasSelection && styles.fabActive]}
          onPress={onPress}
          onLongPress={() => setShowMenu(true)}
          activeOpacity={0.8}
          delayLongPress={300}
          accessibilityLabel="AI assistant"
          accessibilityHint="Tap to chat, long press for quick actions"
        >
          <Ionicons name="sparkles" size={22} color={colors.surface[0]} />
        </TouchableOpacity>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.primary[500],
    justifyContent: 'center', alignItems: 'center',
    ...shadows.lg,
  },
  fabActive: {
    backgroundColor: colors.primary[400],
  },
  menuOverlay: {
    position: 'absolute', bottom: 60, right: 0,
  },
  menu: {
    backgroundColor: colors.surface[0], borderRadius: radius.md,
    paddingVertical: spacing.xs, minWidth: 160,
    ...shadows.lg,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    minHeight: 44,
  },
  menuItemText: {
    ...typography.body, color: colors.navy[500], fontSize: 14,
  },
});
