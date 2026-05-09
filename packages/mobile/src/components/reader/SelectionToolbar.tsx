import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput } from 'react-native';

interface SelectionToolbarProps {
  visible: boolean;
  selectedText: string;
  onHighlight: (color: string) => void;
  onNote: (text: string, note: string) => void;
  onAskAI: () => void;
  onDismiss: () => void;
}

const HIGHLIGHT_COLORS = [
  'rgba(217, 119, 6, 0.3)',   // amber
  'rgba(122, 158, 126, 0.3)', // sage
  'rgba(166, 93, 87, 0.3)',   // russet
  'rgba(45, 90, 74, 0.3)',    // forest
  'rgba(61, 85, 120, 0.3)',   // navy
];

export default function SelectionToolbar({
  visible,
  selectedText,
  onHighlight,
  onNote,
  onAskAI,
  onDismiss,
}: SelectionToolbarProps) {
  const [showNoteInput, setShowNoteInput] = React.useState(false);
  const [noteText, setNoteText] = React.useState('');

  if (!visible) return null;

  return (
    <View style={styles.container}>
      {showNoteInput ? (
        <View style={styles.noteSection}>
          <Text style={styles.noteLabel} numberOfLines={2}>{selectedText}</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="Add a note..."
            placeholderTextColor="#8a99ae"
            value={noteText}
            onChangeText={setNoteText}
            autoFocus
            multiline
          />
          <View style={styles.noteActions}>
            <TouchableOpacity onPress={() => { setShowNoteInput(false); setNoteText(''); }}>
              <Text style={styles.cancelBtn}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={() => { onNote(selectedText, noteText); setShowNoteInput(false); setNoteText(''); }}
            >
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.colors}>
            {HIGHLIGHT_COLORS.map((color) => (
              <TouchableOpacity
                key={color}
                style={[styles.colorDot, { backgroundColor: color }]}
                onPress={() => onHighlight(color)}
              />
            ))}
          </View>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionBtn} onPress={onAskAI}>
              <Text style={styles.actionText}>Ask AI</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => setShowNoteInput(true)}>
              <Text style={styles.actionText}>Note</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={onDismiss}>
              <Text style={styles.cancelBtn}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute', bottom: 40, left: 16, right: 16,
    backgroundColor: '#ffffff', borderRadius: 16,
    padding: 16, shadowColor: '#000', shadowOpacity: 0.12,
    shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  colors: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 12 },
  colorDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: '#e0e0e0' },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  actionBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  actionText: { fontSize: 14, fontWeight: '600', color: '#d97706' },
  cancelBtn: { fontSize: 14, color: '#8a99ae' },
  noteSection: {},
  noteLabel: { fontSize: 13, color: '#3d5578', marginBottom: 8, fontStyle: 'italic' },
  noteInput: {
    borderWidth: 1, borderColor: '#f0e9e0', borderRadius: 12,
    padding: 12, fontSize: 15, minHeight: 60, textAlignVertical: 'top',
  },
  noteActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8, gap: 16 },
  saveBtn: { backgroundColor: '#d97706', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  saveBtnText: { color: 'white', fontWeight: '600', fontSize: 14 },
});
