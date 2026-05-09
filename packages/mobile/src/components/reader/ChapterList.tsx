import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, FlatList } from 'react-native';

interface Chapter {
  id: string;
  title: string;
  order: number;
}

interface ChapterListProps {
  visible: boolean;
  chapters: Chapter[];
  currentChapter: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}

export default function ChapterList({ visible, chapters, currentChapter, onSelect, onClose }: ChapterListProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="pageSheet">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Chapters</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeBtn}>Close</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={chapters}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                style={[styles.chapterItem, index === currentChapter && styles.chapterActive]}
                onPress={() => { onSelect(index); onClose(); }}
              >
                <Text style={[styles.chapterText, index === currentChapter && styles.chapterTextActive]}>
                  {item.title || `Chapter ${index + 1}`}
                </Text>
                {index === currentChapter && <Text style={styles.currentBadge}>Reading</Text>}
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', color: '#1e2a38' },
  closeBtn: { fontSize: 16, color: '#d97706', fontWeight: '600' },
  chapterItem: { paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f0e9e0' },
  chapterActive: { backgroundColor: '#f9f5f0', borderRadius: 8 },
  chapterText: { fontSize: 15, color: '#3d5578' },
  chapterTextActive: { color: '#d97706', fontWeight: '600' },
  currentBadge: { fontSize: 11, color: '#d97706', marginTop: 2 },
});
