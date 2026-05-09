import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useReaderStore } from '@/stores/reader-store';

interface ReaderHeaderProps {
  title: string;
  chapterIndex: number;
  totalChapters: number;
  isBookmarked: boolean;
  onBookmark: () => void;
  onToggleSettings: () => void;
  onToggleToc: () => void;
  onTapCenter: () => void;
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
  const bgColor = theme === 'dark' ? '#151d28' : '#f9f5f0';
  const textColor = theme === 'dark' ? '#e0e0e0' : '#1e2a38';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
      <View style={styles.row}>
        <TouchableOpacity onPress={() => router.back()} style={styles.btn}>
          <Text style={[styles.btnText, { color: textColor }]}>&#x2190;</Text>
        </TouchableOpacity>

        <View style={styles.center}>
          <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>{title}</Text>
          <Text style={styles.subtitle}>{chapterIndex + 1} / {totalChapters}</Text>
        </View>

        <TouchableOpacity onPress={onToggleToc} style={styles.btn}>
          <Text style={[styles.btnText, { color: textColor }]}>☰</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onBookmark} style={styles.btn}>
          <Text style={styles.btnText}>{isBookmarked ? '🔖' : '📑'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onToggleSettings} style={styles.btn}>
          <Text style={[styles.btnText, { color: textColor }]}>⚙</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 12, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  btn: { padding: 8 },
  btnText: { fontSize: 18 },
  center: { flex: 1, marginHorizontal: 8 },
  title: { fontSize: 14, fontWeight: '600' },
  subtitle: { fontSize: 11, color: '#8a99ae', marginTop: 1 },
});
