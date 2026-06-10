import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useReaderStore } from '@/stores/reader-store';
import { BackIcon, MenuIcon, BookmarkIcon, BookmarkOutlineIcon, SettingsIcon } from '@/components/shared/Icons';
import { colors, typography, spacing } from '@/lib/theme';

interface ReaderHeaderProps {
  title: string;
  chapterIndex: number;
  totalChapters: number;
  isBookmarked: boolean;
  onBookmark: () => void;
  onToggleSettings: () => void;
  onToggleToc: () => void;
}

export default function ReaderHeader({
  title,
  chapterIndex,
  totalChapters,
  isBookmarked,
  onBookmark,
  onToggleSettings,
  onToggleToc,
}: ReaderHeaderProps) {
  const theme = useReaderStore((s) => s.theme);
  const bgColor = theme === 'dark' ? 'rgba(26, 26, 46, 0.95)' : 'rgba(249, 245, 240, 0.95)';
  const textColor = theme === 'dark' ? '#e8e0d4' : '#1e2a38';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
      <View style={styles.row}>
        <TouchableOpacity onPress={() => router.back()} style={styles.btn}>
          <BackIcon size={22} color={textColor} />
        </TouchableOpacity>

        <View style={styles.center}>
          <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>{title}</Text>
          <Text style={styles.subtitle}>{chapterIndex + 1} / {totalChapters}</Text>
        </View>

        <TouchableOpacity onPress={onToggleToc} style={styles.btn}>
          <MenuIcon size={20} color={textColor} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onBookmark} style={styles.btn}>
          {isBookmarked ? <BookmarkIcon size={20} /> : <BookmarkOutlineIcon size={20} />}
        </TouchableOpacity>
        <TouchableOpacity onPress={onToggleSettings} style={styles.btn}>
          <SettingsIcon size={20} color={textColor} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center' },
  btn: { padding: spacing.sm, borderRadius: 20 },
  center: { flex: 1, marginHorizontal: spacing.xs },
  title: { ...typography.captionMedium, fontSize: 13 },
  subtitle: { ...typography.overline, color: colors.navy[300], marginTop: 1, fontSize: 10 },
});
