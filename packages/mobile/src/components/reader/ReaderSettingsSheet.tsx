import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { useReaderStore, type ReaderTheme } from '@/stores/reader-store';

interface ReaderSettingsSheetProps {
  visible: boolean;
  onClose: () => void;
}

const THEMES: { key: ReaderTheme; label: string; bg: string }[] = [
  { key: 'light', label: 'Light', bg: '#fefdfb' },
  { key: 'sepia', label: 'Sepia', bg: '#f8f4ec' },
  { key: 'dark', label: 'Dark', bg: '#0f1419' },
];

const FONT_SIZES = [14, 16, 18, 20, 22, 24];
const FONT_FAMILIES = ['Literata', 'Georgia', 'System'];

export default function ReaderSettingsSheet({ visible, onClose }: ReaderSettingsSheetProps) {
  const { fontSize, setFontSize, fontFamily, setFontFamily, theme, setTheme, lineHeight } = useReaderStore();

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="pageSheet">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Reader Settings</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeBtn}>Done</Text>
            </TouchableOpacity>
          </View>

          <ScrollView>
            {/* Theme */}
            <Text style={styles.sectionTitle}>Theme</Text>
            <View style={styles.themeRow}>
              {THEMES.map((t) => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.themeBtn, { backgroundColor: t.bg }, theme === t.key && styles.themeActive]}
                  onPress={() => setTheme(t.key)}
                >
                  <Text style={[styles.themeLabel, t.key === 'dark' && { color: '#e0e0e0' }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Font Size */}
            <Text style={styles.sectionTitle}>Font Size</Text>
            <View style={styles.sizeRow}>
              {FONT_SIZES.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.sizeBtn, fontSize === s && styles.sizeActive]}
                  onPress={() => setFontSize(s)}
                >
                  <Text style={[styles.sizeText, fontSize === s && styles.sizeTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Font Family */}
            <Text style={styles.sectionTitle}>Font</Text>
            <View style={styles.sizeRow}>
              {FONT_FAMILIES.map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.sizeBtn, fontFamily === f && styles.sizeActive]}
                  onPress={() => setFontFamily(f)}
                >
                  <Text style={[styles.sizeText, fontFamily === f && styles.sizeTextActive]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '60%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 18, fontWeight: '700', color: '#1e2a38' },
  closeBtn: { fontSize: 16, color: '#d97706', fontWeight: '600' },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#8a99ae', textTransform: 'uppercase', marginBottom: 8, marginTop: 12 },
  themeRow: { flexDirection: 'row', gap: 12 },
  themeBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  themeActive: { borderColor: '#d97706' },
  themeLabel: { fontSize: 14, fontWeight: '600', color: '#1e2a38' },
  sizeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  sizeBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#f0e9e0' },
  sizeActive: { backgroundColor: '#d97706' },
  sizeText: { fontSize: 14, color: '#3d5578' },
  sizeTextActive: { color: '#fff', fontWeight: '600' },
});
