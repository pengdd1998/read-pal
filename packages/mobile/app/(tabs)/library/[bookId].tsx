import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, FlatList, Image, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { api } from '@/lib/api';
import type { Book } from '@read-pal/shared';

export default function BookDetailScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const queryClient = useQueryClient();

  const { data: book, isLoading } = useQuery({
    queryKey: ['book', bookId],
    queryFn: async () => {
      const result = await api.get<Book>(`/api/books/${bookId}`);
      return result.success ? result.data : null;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/api/books/${bookId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['books'] });
      router.back();
    },
  });

  const handleDelete = () => {
    Alert.alert('Delete Book', `Remove "${book?.title}" from your library?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.center}>
          <Text style={{ color: '#8a99ae' }}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Back */}
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={[]}
        renderItem={() => null}
        ListHeaderComponent={
          <View style={styles.content}>
            {/* Cover */}
            <View style={styles.coverContainer}>
              {book?.coverUrl ? (
                <Image source={{ uri: book.coverUrl }} style={styles.cover} resizeMode="cover" />
              ) : (
                <View style={[styles.cover, styles.coverPlaceholder]}>
                  <Text style={{ fontSize: 48 }}>📖</Text>
                </View>
              )}
            </View>

            {/* Info */}
            <Text style={styles.title}>{book?.title}</Text>
            <Text style={styles.author}>{book?.author}</Text>

            {/* Stats */}
            <View style={styles.statsRow}>
              <StatBox label="Pages" value={`${book?.totalPages || 0}`} />
              <StatBox label="Progress" value={`${Math.round((book?.progress || 0) * 100)}%`} />
              <StatBox label="Status" value={book?.status || 'unread'} />
            </View>

            {/* Actions */}
            <TouchableOpacity
              style={styles.readBtn}
              onPress={() => router.push(`/reader/${bookId}`)}
              activeOpacity={0.8}
            >
              <Text style={styles.readBtnText}>Start Reading</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.chatBtn}
              onPress={() => router.push(`/chat/${bookId}`)}
              activeOpacity={0.8}
            >
              <Text style={styles.chatBtnText}>Chat with AI</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
              <Text style={styles.deleteBtnText}>Delete Book</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f5f0' },
  nav: { paddingHorizontal: 16, paddingVertical: 8 },
  backBtn: { fontSize: 16, color: '#d97706', fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20, alignItems: 'center' },
  coverContainer: { marginBottom: 20 },
  cover: { width: 160, height: 220, borderRadius: 12 },
  coverPlaceholder: { backgroundColor: '#f0e9e0', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: '#1e2a38', textAlign: 'center' },
  author: { fontSize: 15, color: '#8a99ae', marginTop: 4, textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: 16, marginTop: 24, marginBottom: 24 },
  statBox: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '700', color: '#1e2a38' },
  statLabel: { fontSize: 12, color: '#8a99ae', marginTop: 2 },
  readBtn: { backgroundColor: '#d97706', borderRadius: 14, paddingVertical: 16, width: '100%', alignItems: 'center', marginBottom: 12 },
  readBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  chatBtn: { backgroundColor: '#2d5a4a', borderRadius: 14, paddingVertical: 16, width: '100%', alignItems: 'center', marginBottom: 12 },
  chatBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  deleteBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  deleteBtnText: { color: '#a65d57', fontSize: 14, fontWeight: '600' },
});
