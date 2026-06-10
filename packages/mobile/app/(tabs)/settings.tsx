import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, ScrollView, StyleSheet, Switch, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/auth-store';
import { useReaderStore, type ReaderTheme } from '@/stores/reader-store';
import { useCompanionStore } from '@/stores/companion-store';
import { PERSONAS, PERSONA_LIST, type PersonaKey } from '@/lib/personas';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { colors, typography, radius, shadows, spacing } from '@/lib/theme';

const THEME_OPTIONS: { key: ReaderTheme; label: string; bg: string }[] = [
  { key: 'light', label: 'Light', bg: '#fefdfb' },
  { key: 'sepia', label: 'Sepia', bg: '#f4ecd8' },
  { key: 'dark', label: 'Dark', bg: '#1a1a2e' },
];

interface SettingsData {
  theme?: string;
  fontSize?: number;
  fontFamily?: string;
  readingGoal?: number;
  dailyReadingMinutes?: number;
  language?: string;
  notificationsEnabled?: boolean;
  contextualAI?: boolean;
  autoFlashcards?: boolean;
  selectedPersona?: string;
}

export default function SettingsScreen() {
  const queryClient = useQueryClient();
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useReaderStore();
  const { selectedPersona, setPersona } = useCompanionStore();

  const [showPersonaPicker, setShowPersonaPicker] = useState(false);
  const [localAI, setLocalAI] = useState(true);
  const [localFlashcards, setLocalFlashcards] = useState(false);
  const [localLang, setLocalLang] = useState('en');
  const [localDaily, setLocalDaily] = useState(30);
  const [localMonthly, setLocalMonthly] = useState(2);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load settings from backend
  const { data: settingsData, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const result = await api.get<SettingsData>('/api/settings');
      if (!result.success) throw new Error(result.error?.message || 'Failed to load settings');
      return result.data as SettingsData;
    },
  });

  const settings = settingsData || {};

  // Sync local state from backend data
  useEffect(() => {
    if (settings.contextualAI !== undefined) setLocalAI(settings.contextualAI !== false);
    if (settings.autoFlashcards !== undefined) setLocalFlashcards(settings.autoFlashcards === true);
    if (settings.language) setLocalLang(settings.language);
    if (settings.dailyReadingMinutes) setLocalDaily(settings.dailyReadingMinutes);
    if (settings.readingGoal) setLocalMonthly(settings.readingGoal);
    if (settings.theme) setTheme(settings.theme as ReaderTheme);
  }, [settings.contextualAI, settings.autoFlashcards, settings.language, settings.dailyReadingMinutes, settings.readingGoal, settings.theme]);

  const darkMode = theme === 'dark';
  const persona = PERSONAS[selectedPersona];

  // Debounced save to backend
  const saveSettings = useCallback((updates: Partial<SettingsData>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const result = await api.patch<SettingsData>('/api/settings', updates as Record<string, unknown>);
        if (result.success && result.data) {
          queryClient.setQueryData(['settings'], result.data);
        }
      } catch {}
      saveTimer.current = null;
    }, 300);
  }, [queryClient]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  }, []);

  // Sync persona from backend on first load
  useEffect(() => {
    if (settings.selectedPersona && settings.selectedPersona !== selectedPersona) {
      setPersona(settings.selectedPersona as PersonaKey);
    }
  }, [settings.selectedPersona]);

  const handleLogout = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const handleDarkModeToggle = (value: boolean) => {
    const newTheme: ReaderTheme = value ? 'dark' : 'light';
    setTheme(newTheme);
    saveSettings({ theme: newTheme });
  };

  const handleThemeChange = (t: ReaderTheme) => {
    setTheme(t);
    saveSettings({ theme: t });
  };

  const handlePersonaChange = (key: PersonaKey) => {
    setPersona(key);
    saveSettings({ selectedPersona: key });
  };

  const handleDailyGoalChange = (value: number) => {
    setLocalDaily(value);
    saveSettings({ dailyReadingMinutes: value });
  };

  const handleMonthlyGoalChange = (value: number) => {
    setLocalMonthly(value);
    saveSettings({ readingGoal: value });
  };

  const handleContextualAI = (value: boolean) => {
    setLocalAI(value);
    saveSettings({ contextualAI: value });
  };

  const handleAutoFlashcards = (value: boolean) => {
    setLocalFlashcards(value);
    saveSettings({ autoFlashcards: value });
  };

  const handleLanguageToggle = () => {
    const newLang = localLang === 'en' ? 'zh' : 'en';
    setLocalLang(newLang);
    saveSettings({ language: newLang });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>

        {/* User Card */}
        <View style={styles.userCard}>
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarText}>
              {user?.name?.charAt(0)?.toUpperCase() || '?'}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.name || 'User'}</Text>
            <Text style={styles.userEmail}>{user?.email || ''}</Text>
          </View>
        </View>

        {/* AI Companion Section */}
        <Text style={styles.sectionHeader}>AI COMPANION</Text>
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => setShowPersonaPicker(!showPersonaPicker)}
            activeOpacity={0.7}
          >
            <View style={styles.settingsRowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: persona.avatarBg }]}>
                <Ionicons name={persona.icon as any} size={18} color={persona.color} />
              </View>
              <View>
                <Text style={styles.settingsRowTitle}>Reading Friend</Text>
                <Text style={[styles.settingsRowSub, { color: persona.color }]}>{persona.name} - {persona.tagline}</Text>
              </View>
            </View>
            <Ionicons name={showPersonaPicker ? 'chevron-up' : 'chevron-forward-outline'} size={18} color={colors.navy[300]} />
          </TouchableOpacity>

          {showPersonaPicker && (
            <View style={styles.personaPicker}>
              {PERSONA_LIST.map((p) => (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.personaOption, selectedPersona === p.key && { borderColor: p.color, backgroundColor: p.avatarBg }]}
                  onPress={() => handlePersonaChange(p.key)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.personaDot, { backgroundColor: p.avatarBg }]}>
                    <Ionicons name={p.icon as any} size={16} color={p.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.personaName, selectedPersona === p.key && { color: p.color }]}>{p.name}</Text>
                    <Text style={styles.personaTag}>{p.tagline}</Text>
                  </View>
                  {selectedPersona === p.key && <Ionicons name="checkmark-circle" size={20} color={p.color} />}
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.separator} />
          <View style={styles.settingsRow}>
            <View style={styles.settingsRowLeft}>
              <View style={styles.iconContainer}>
                <Ionicons name="sparkles-outline" size={18} color={colors.navy[400]} />
              </View>
              <View>
                <Text style={styles.settingsRowTitle}>Contextual AI in Reader</Text>
                <Text style={styles.settingsRowSub}>Chapter summaries and insights</Text>
              </View>
            </View>
            <Switch
              value={localAI}
              onValueChange={handleContextualAI}
              trackColor={{ false: colors.surface[3], true: colors.primary[500] }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Reading Section */}
        <Text style={styles.sectionHeader}>READING</Text>
        <View style={styles.section}>
          <View style={styles.themeRow}>
            <Text style={styles.themeLabel}>Theme</Text>
            <View style={styles.themeOptions}>
              {THEME_OPTIONS.map((t) => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.themeBtn, { backgroundColor: t.bg }, theme === t.key && styles.themeBtnActive]}
                  onPress={() => handleThemeChange(t.key)}
                >
                  <Text style={[styles.themeBtnText, t.key === 'dark' && { color: '#e8e0d4' }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.separator} />
          <GoalRow
            title="Daily Goal"
            value={localDaily}
            unit="min"
            min={5}
            max={120}
            step={5}
            onChange={handleDailyGoalChange}
          />
          <View style={styles.separator} />
          <GoalRow
            title="Monthly Goal"
            value={localMonthly}
            unit="books"
            min={1}
            max={10}
            step={1}
            onChange={handleMonthlyGoalChange}
          />
        </View>

        {/* Study Section */}
        <Text style={styles.sectionHeader}>STUDY</Text>
        <View style={styles.section}>
          <View style={styles.settingsRow}>
            <View style={styles.settingsRowLeft}>
              <View style={styles.iconContainer}>
                <Ionicons name="copy-outline" size={18} color={colors.navy[400]} />
              </View>
              <View>
                <Text style={styles.settingsRowTitle}>Auto-generate Flashcards</Text>
                <Text style={styles.settingsRowSub}>From highlights and notes</Text>
              </View>
            </View>
            <Switch
              value={localFlashcards}
              onValueChange={handleAutoFlashcards}
              trackColor={{ false: colors.surface[3], true: colors.primary[500] }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.separator} />
          <View style={styles.settingsRow}>
            <View style={styles.settingsRowLeft}>
              <View style={styles.iconContainer}>
                <Ionicons name="school-outline" size={18} color={colors.navy[400]} />
              </View>
              <Text style={styles.settingsRowTitle}>Review Frequency</Text>
            </View>
            <Text style={styles.settingsRowSub}>Daily</Text>
          </View>
        </View>

        {/* General Section */}
        <Text style={styles.sectionHeader}>GENERAL</Text>
        <View style={styles.section}>
          <View style={styles.settingsRow}>
            <View style={styles.settingsRowLeft}>
              <View style={styles.iconContainer}>
                <Ionicons name="moon-outline" size={18} color={colors.navy[400]} />
              </View>
              <Text style={styles.settingsRowTitle}>Dark Mode</Text>
            </View>
            <Switch value={darkMode} onValueChange={handleDarkModeToggle} trackColor={{ false: colors.surface[3], true: colors.primary[500] }} thumbColor="#fff" />
          </View>
          <View style={styles.separator} />
          <TouchableOpacity style={styles.settingsRow} onPress={handleLanguageToggle} activeOpacity={0.7}>
            <View style={styles.settingsRowLeft}>
              <View style={styles.iconContainer}>
                <Ionicons name="language-outline" size={18} color={colors.navy[400]} />
              </View>
              <Text style={styles.settingsRowTitle}>Language</Text>
            </View>
            <Text style={styles.settingsRowSub}>{localLang === 'en' ? 'English' : '中文'}</Text>
          </TouchableOpacity>
        </View>

        {/* About */}
        <Text style={styles.sectionHeader}>ABOUT</Text>
        <View style={styles.section}>
          <View style={styles.settingsRow}>
            <View style={styles.settingsRowLeft}>
              <View style={styles.iconContainer}>
                <Ionicons name="information-circle-outline" size={18} color={colors.navy[400]} />
              </View>
              <Text style={styles.settingsRowTitle}>Version</Text>
            </View>
            <Text style={styles.settingsRowSub}>2.0.0</Text>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={20} color={colors.russet} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>ReadPal v2.0.0 - Your AI Reading Companion</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// Extracted goal row component with local optimistic state + debounced save
function GoalRow({ title, value, unit, min, max, step, onChange }: {
  title: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const [local, setLocal] = useState(value);

  // Sync from parent when backend data loads
  useEffect(() => { setLocal(value); }, [value]);

  const handleChange = (newVal: number) => {
    setLocal(newVal);
    onChange(newVal);
  };

  return (
    <View style={styles.goalRow}>
      <Text style={styles.settingsRowTitle}>{title}</Text>
      <View style={styles.goalControls}>
        <TouchableOpacity onPress={() => handleChange(Math.max(min, local - step))} style={styles.goalBtn}>
          <Ionicons name="remove" size={16} color={colors.navy[400]} />
        </TouchableOpacity>
        <Text style={styles.goalValue}>{local} {unit}</Text>
        <TouchableOpacity onPress={() => handleChange(Math.min(max, local + step))} style={styles.goalBtn}>
          <Ionicons name="add" size={16} color={colors.navy[400]} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface[1] },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingBottom: 40 },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  headerTitle: { ...typography.display, color: colors.navy[700] },
  userCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: spacing.xl, marginTop: spacing.md,
    backgroundColor: colors.surface[0], borderRadius: radius.lg,
    padding: spacing.lg, ...shadows.sm,
  },
  userAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.primary[200], justifyContent: 'center', alignItems: 'center',
  },
  userAvatarText: { ...typography.title, color: colors.primary[700], fontSize: 20 },
  userInfo: { flex: 1, marginLeft: spacing.md },
  userName: { ...typography.bodyMedium, color: colors.navy[700] },
  userEmail: { ...typography.caption, color: colors.navy[300], marginTop: 2 },
  sectionHeader: {
    ...typography.overline, color: colors.navy[300],
    marginHorizontal: spacing.xl, marginTop: spacing.xxl, marginBottom: spacing.sm,
  },
  section: {
    marginHorizontal: spacing.xl, backgroundColor: colors.surface[0],
    borderRadius: radius.lg, ...shadows.sm, overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 56,
  },
  settingsRowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  iconContainer: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.surface[1], justifyContent: 'center', alignItems: 'center',
    marginRight: spacing.md,
  },
  settingsRowTitle: { ...typography.bodyMedium, color: colors.navy[700], fontSize: 14 },
  settingsRowSub: { ...typography.caption, color: colors.navy[300], marginTop: 1 },
  separator: { height: 1, backgroundColor: colors.surface[2], marginLeft: 56 },
  personaPicker: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  personaOption: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.sm, borderRadius: radius.md, borderWidth: 1.5,
    borderColor: colors.surface[2], marginBottom: spacing.sm,
  },
  personaDot: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
  },
  personaName: { ...typography.bodyMedium, fontSize: 14, color: colors.navy[700] },
  personaTag: { ...typography.caption, fontSize: 11, color: colors.navy[300] },
  themeRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  themeLabel: { ...typography.captionMedium, color: colors.navy[300], marginBottom: spacing.sm },
  themeOptions: { flexDirection: 'row', gap: spacing.sm },
  themeBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  themeBtnActive: { borderColor: colors.primary[500] },
  themeBtnText: { ...typography.captionMedium, color: colors.navy[700] },
  goalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  goalControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  goalBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface[1], justifyContent: 'center', alignItems: 'center' },
  goalValue: { ...typography.bodyMedium, color: colors.primary[500], fontSize: 14, minWidth: 70, textAlign: 'center' },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    marginHorizontal: spacing.xl, marginTop: spacing.xxxl,
    backgroundColor: 'rgba(166, 93, 87, 0.08)', borderRadius: radius.md,
    paddingVertical: spacing.lg,
  },
  logoutText: { ...typography.bodyMedium, color: colors.russet },
  footer: {
    ...typography.caption, color: colors.navy[200],
    textAlign: 'center', marginTop: spacing.xxl, marginBottom: spacing.md,
  },
});
