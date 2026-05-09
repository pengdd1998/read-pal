import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { api } from '@/lib/api';

interface BookUploaderProps {
  onUploaded: () => void;
}

export default function BookUploader({ onUploaded }: BookUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/epub+zip', 'application/pdf'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];
      setUploading(true);
      setProgress(0);

      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        type: file.mimeType || 'application/epub+zip',
        name: file.name,
      } as any);

      await api.upload('/api/upload', formData, (p) => setProgress(p));
      onUploaded();
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.uploadBtn}
        onPress={handleUpload}
        disabled={uploading}
        activeOpacity={0.8}
      >
        {uploading ? (
          <View style={styles.uploadingRow}>
            <ActivityIndicator color="#d97706" />
            <Text style={styles.uploadingText}>Uploading... {progress}%</Text>
          </View>
        ) : (
          <>
            <Text style={styles.icon}>+</Text>
            <Text style={styles.label}>Upload Book</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 0 },
  uploadBtn: {
    backgroundColor: '#fff', borderRadius: 16, paddingVertical: 20,
    alignItems: 'center', borderWidth: 2, borderColor: '#f0e9e0',
    borderStyle: 'dashed',
  },
  icon: { fontSize: 28, color: '#d97706' },
  label: { fontSize: 14, color: '#8a99ae', marginTop: 4, fontWeight: '500' },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  uploadingText: { fontSize: 14, color: '#d97706', fontWeight: '500' },
});
