import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  ScrollView,
  Alert,
  StyleSheet,
} from 'react-native';
import { api } from '../../lib/api';
import { Colors, Spacing, Typography, BorderRadius } from '../../lib/theme';

interface UserSettingsData {
  readingGoal: number;
  notificationsEnabled: boolean;
  friendPersonality: 'sage' | 'penny' | 'alex' | 'quinn' | 'sam';
  interventionFrequency: 'minimal' | 'normal' | 'frequent';
  theme: 'light' | 'dark' | 'system';
  fontSize: number;
}

const PERSONALITIES = [
  { value: 'sage' as const, label: 'Sage', desc: 'Thoughtful & reflective', emoji: '\uD83E\uDDD8' },
  { value: 'penny' as const, label: 'Penny', desc: 'Enthusiastic & curious', emoji: '\uD83E\uDD29' },
  { value: 'alex' as const, label: 'Alex', desc: 'Challenging & skeptical', emoji: '\uD83E\uDDE0' },
  { value: 'quinn' as const, label: 'Quinn', desc: 'Calm & minimalist', emoji: '\uD83C\uDF43' },
  { value: 'sam' as const, label: 'Sam', desc: 'Practical & goal-oriented', emoji: '\uD83C\uDFAF' },
];

const FREQUENCIES = [
  { value: 'minimal' as const, label: 'Minimal' },
  { value: 'normal' as const, label: 'Normal' },
  { value: 'frequent' as const, label: 'Frequent' },
];

export function SettingsScreen() {
  const [settings, setSettings] = useState<UserSettingsData>({
    readingGoal: 4,
    notificationsEnabled: true,
    friendPersonality: 'sage',
    interventionFrequency: 'normal',
    theme: 'system',
    fontSize: 16,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const res = await api.get<UserSettingsData>('/api/settings');
      if (res.success && res.data) {
        setSettings(res.data as unknown as UserSettingsData);
      }
    } catch {
      // Use defaults
    }
  }

  async function saveSettings(updates: Partial<UserSettingsData>) {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    setSaving(true);
    try {
      await api.put('/api/settings', newSettings);
    } catch {
      // Non-critical
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Reading Goals */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Reading Goals</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Books per month</Text>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => saveSettings({ readingGoal: Math.max(1, settings.readingGoal - 1) })}
            >
              <Text style={styles.stepperText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{settings.readingGoal}</Text>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => saveSettings({ readingGoal: Math.min(20, settings.readingGoal + 1) })}
            >
              <Text style={styles.stepperText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Notifications */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Enable notifications</Text>
          <Switch
            value={settings.notificationsEnabled}
            onValueChange={(v) => saveSettings({ notificationsEnabled: v })}
            trackColor={{ false: Colors.gray200, true: Colors.primaryLight }}
            thumbColor={settings.notificationsEnabled ? Colors.primary : Colors.gray400}
          />
        </View>
      </View>

      {/* Friend Personality */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Reading Friend</Text>
        <Text style={styles.sectionSubtitle}>Choose your companion personality</Text>
        {PERSONALITIES.map((p) => (
          <TouchableOpacity
            key={p.value}
            style={[styles.personalityCard, settings.friendPersonality === p.value && styles.personalityActive]}
            onPress={() => saveSettings({ friendPersonality: p.value })}
            activeOpacity={0.7}
          >
            <View style={styles.personalityRow}>
              <Text style={styles.personalityEmoji}>{p.emoji}</Text>
              <View style={styles.personalityInfo}>
                <Text style={styles.personalityLabel}>{p.label}</Text>
                <Text style={styles.personalityDesc}>{p.desc}</Text>
              </View>
              {settings.friendPersonality === p.value && (
                <View style={styles.checkDot} />
              )}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Intervention Frequency */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Intervention Frequency</Text>
        <View style={styles.frequencyRow}>
          {FREQUENCIES.map((f) => (
            <TouchableOpacity
              key={f.value}
              style={[styles.freqBtn, settings.interventionFrequency === f.value && styles.freqActive]}
              onPress={() => saveSettings({ interventionFrequency: f.value })}
            >
              <Text style={[styles.freqText, settings.interventionFrequency === f.value && styles.freqTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Font Size */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Display</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Font size</Text>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => saveSettings({ fontSize: Math.max(12, settings.fontSize - 2) })}
            >
              <Text style={styles.stepperText}>A-</Text>
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{settings.fontSize}</Text>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => saveSettings({ fontSize: Math.min(24, settings.fontSize + 2) })}
            >
              <Text style={styles.stepperText}>A+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {saving && <Text style={styles.savingText}>Saving...</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
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
  sectionSubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  rowLabel: {
    ...Typography.bodySmall,
    color: Colors.text,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.gray100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperText: {
    ...Typography.body,
    color: Colors.text,
    fontWeight: '600',
  },
  stepperValue: {
    ...Typography.body,
    color: Colors.primary,
    fontWeight: '700',
    minWidth: 30,
    textAlign: 'center',
  },
  personalityCard: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  personalityActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight + '15',
  },
  personalityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  personalityEmoji: { fontSize: 24 },
  personalityInfo: { flex: 1 },
  personalityLabel: {
    ...Typography.bodySmall,
    color: Colors.text,
    fontWeight: '600',
  },
  personalityDesc: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  checkDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  frequencyRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  freqBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
  },
  freqActive: {
    backgroundColor: Colors.primary,
  },
  freqText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  freqTextActive: {
    color: Colors.white,
  },
  savingText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
});
