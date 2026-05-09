import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { startSSEStream } from '@/lib/sse';
import MessageBubble from './MessageBubble';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: Date;
}

interface ChatPanelProps {
  bookId: string;
  bookTitle?: string;
}

export default function ChatPanel({ bookId, bookTitle }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const flatListRef = useRef<FlatList>(null);

  // Load chat history
  const { data: history } = useQuery({
    queryKey: ['chatHistory', bookId],
    queryFn: async () => {
      const result = await api.get<Message[]>('/api/agents/history', { book_id: bookId, limit: 50 });
      return result.success ? result.data || [] : [];
    },
  });

  useEffect(() => {
    if (history && history.length > 0 && messages.length === 0) {
      setMessages(history.map((m: any) => ({
        id: m.id || String(Math.random()),
        role: m.role,
        content: m.content,
        createdAt: m.createdAt ? new Date(m.createdAt) : undefined,
      })));
    }
  }, [history]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setStreaming(true);
    setStreamContent('');

    const assistantId = `ai-${Date.now()}`;

    abortRef.current = startSSEStream('/api/agents/stream', {
      book_id: bookId,
      message: text,
    }, {
      onToken: (token) => {
        setStreamContent((prev) => prev + token);
      },
      onDone: () => {
        setStreamContent((prev) => {
          const aiMsg: Message = { id: assistantId, role: 'assistant', content: prev, createdAt: new Date() };
          setMessages((prev2) => [...prev2, aiMsg]);
          return '';
        });
        setStreaming(false);
      },
      onError: (err) => {
        console.error('SSE error:', err);
        setStreaming(false);
        setStreamContent('');
      },
    });
  }, [input, bookId, streaming]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages, streamContent]);

  const allMessages = [...messages];
  if (streaming && streamContent) {
    allMessages.push({ id: 'streaming', role: 'assistant', content: streamContent });
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>AI Chat</Text>
          {bookTitle && <Text style={styles.headerSub} numberOfLines={1}>{bookTitle}</Text>}
        </View>
        <View style={{ width: 32 }} />
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={allMessages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MessageBubble message={item} />}
        contentContainerStyle={styles.messageList}
        keyboardShouldPersistTaps="handled"
      />

      {/* Streaming indicator */}
      {streaming && !streamContent && (
        <View style={styles.typingIndicator}>
          <ActivityIndicator size="small" color="#d97706" />
          <Text style={styles.typingText}>Thinking...</Text>
        </View>
      )}

      {/* Input */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Ask about this book..."
            placeholderTextColor="#8a99ae"
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={2000}
            editable={!streaming}
          />
          {streaming ? (
            <TouchableOpacity style={styles.stopBtn} onPress={stopStreaming}>
              <Text style={styles.stopBtnText}>Stop</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
              onPress={sendMessage}
              disabled={!input.trim()}
            >
              <Text style={styles.sendBtnText}>↑</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f5f0' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0e9e0' },
  backBtn: { fontSize: 22, color: '#d97706' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#1e2a38' },
  headerSub: { fontSize: 12, color: '#8a99ae', marginTop: 1 },
  messageList: { paddingVertical: 16, flexGrow: 1 },
  typingIndicator: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 8, gap: 8 },
  typingText: { fontSize: 13, color: '#8a99ae', fontStyle: 'italic' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 8, paddingBottom: 12, gap: 8, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0e9e0' },
  input: { flex: 1, backgroundColor: '#f9f5f0', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100, color: '#1e2a38' },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#d97706', justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { backgroundColor: '#d4b896' },
  sendBtnText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  stopBtn: { paddingHorizontal: 16, height: 40, borderRadius: 20, backgroundColor: '#a65d57', justifyContent: 'center', alignItems: 'center' },
  stopBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
