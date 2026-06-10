import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { startSSEStream } from '@/lib/sse';
import { getGenreTemplate, detectGenre, type BookGenre } from '@/lib/companion-prompts';
import { PERSONAS } from '@/lib/personas';
import { useCompanionStore } from '@/stores/companion-store';
import MessageBubble from './MessageBubble';
import { colors, typography, radius, shadows, spacing } from '@/lib/theme';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: Date;
  isStreaming?: boolean;
}

interface ChatPanelProps {
  bookId: string;
  bookTitle?: string;
  bookGenre?: BookGenre;
  initialQuestion?: string;
}

export default function ChatPanel({ bookId, bookTitle, bookGenre, initialQuestion }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  const abortRef = useRef<AbortController | null>(null);
  const historyAppliedRef = useRef(false);
  const streamingIdRef = useRef<string | null>(null);

  const { selectedPersona } = useCompanionStore();
  const persona = PERSONAS[selectedPersona];
  const genre = bookGenre || 'default';
  const template = getGenreTemplate(genre);
  const suggestedPrompts = template.suggestedPrompts(bookTitle);

  // Load chat history
  const { data: history } = useQuery({
    queryKey: ['chatHistory', bookId],
    queryFn: async () => {
      const result = await api.get<Message[]>('/api/agents/history', { book_id: bookId, limit: 50 });
      return result.success ? result.data || [] : [];
    },
  });

  useEffect(() => {
    if (history && history.length > 0 && !historyAppliedRef.current) {
      historyAppliedRef.current = true;
      setMessages(history.map((m: any) => ({
        id: m.id || String(Math.random()),
        role: m.role,
        content: m.content,
        createdAt: m.createdAt ? new Date(m.createdAt) : undefined,
      })));
    } else if (history) {
      historyAppliedRef.current = true;
    }
  }, [history]);

  useEffect(() => {
    if (initialQuestion && !streaming && messages.length === 0) {
      setInput(decodeURIComponent(initialQuestion));
    }
  }, [initialQuestion]);

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText || input).trim();
    if (!text || streaming) return;

    historyAppliedRef.current = true;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date(),
    };

    const assistantId = `ai-${Date.now()}`;
    streamingIdRef.current = assistantId;

    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '', createdAt: new Date(), isStreaming: true }]);
    setInput('');
    setStreaming(true);

    const controller = startSSEStream(
      '/api/agents/chat/stream',
      { book_id: bookId, message: text, persona: selectedPersona },
      {
        onToken: (token: string) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + token } : m
            )
          );
        },
        onDone: () => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, isStreaming: false } : m
            )
          );
          setStreaming(false);
          streamingIdRef.current = null;
        },
        onError: (err: string) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content || `Error: ${err}`, isStreaming: false }
                : m
            )
          );
          setStreaming(false);
          streamingIdRef.current = null;
        },
      }
    );
    abortRef.current = controller;
  }, [input, bookId, streaming, selectedPersona]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (streamingIdRef.current) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingIdRef.current ? { ...m, isStreaming: false } : m
        )
      );
    }
    setStreaming(false);
    streamingIdRef.current = null;
  }, []);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  const showPrompts = messages.length === 0 && !streaming;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.primary[500]} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerTitleRow}>
            <View style={[styles.personaDot, { backgroundColor: persona.avatarBg }]}>
              <Ionicons name={persona.icon as any} size={12} color={persona.color} />
            </View>
            <Text style={styles.headerTitle}>{persona.name}</Text>
          </View>
          {bookTitle && <Text style={styles.headerSub} numberOfLines={1}>{bookTitle}</Text>}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.messageArea}
        contentContainerStyle={styles.messageContent}
        keyboardShouldPersistTaps="handled"
      >
        {showPrompts && (
          <View style={styles.promptSection}>
            <View style={styles.aiGreetingCard}>
              <View style={[styles.aiAvatarCircle, { backgroundColor: persona.avatarBg }]}>
                <Ionicons name={persona.icon as any} size={20} color={persona.color} />
              </View>
              <Text style={styles.aiGreetingText}>
                {template.greeting(persona.name, bookTitle)}
              </Text>
            </View>
            <Text style={styles.promptLabel}>Try asking</Text>
            {suggestedPrompts.map((prompt, i) => (
              <TouchableOpacity
                key={i}
                style={styles.promptChip}
                onPress={() => sendMessage(prompt)}
                activeOpacity={0.7}
              >
                <Text style={styles.promptChipText}>{prompt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} personaColor={persona.color} />
        ))}
      </ScrollView>

      {/* Streaming indicator */}
      {streaming && (
        <View style={styles.typingIndicator}>
          <View style={styles.typingDots}>
            <View style={[styles.dot, styles.dot1]} />
            <View style={[styles.dot, styles.dot2]} />
            <View style={[styles.dot, styles.dot3]} />
          </View>
          <Text style={styles.typingText}>{persona.name} is thinking...</Text>
        </View>
      )}

      {/* Input */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder={`Ask ${persona.name}...`}
            placeholderTextColor={colors.navy[300]}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={2000}
            editable={!streaming}
          />
          {streaming ? (
            <TouchableOpacity style={styles.stopBtn} onPress={stopStreaming}>
              <Ionicons name="stop-circle-outline" size={20} color="#fff" />
              <Text style={styles.stopBtnText}>Stop</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
              onPress={() => sendMessage()}
              disabled={!input.trim()}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f5f0' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.surface[2],
  },
  headerBtn: { padding: spacing.sm },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  personaDot: {
    width: 22, height: 22, borderRadius: 11,
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { ...typography.bodyMedium, color: colors.navy[700] },
  headerSub: { ...typography.caption, color: colors.navy[300], marginTop: 1 },
  messageArea: { flex: 1 },
  messageContent: { paddingVertical: spacing.lg, flexGrow: 1 },
  promptSection: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  aiGreetingCard: {
    backgroundColor: colors.ai.bubble, borderRadius: radius.lg,
    padding: spacing.lg, marginBottom: spacing.xxl,
  },
  aiAvatarCircle: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md,
  },
  aiGreetingText: { ...typography.body, color: colors.navy[500], lineHeight: 22 },
  promptLabel: { ...typography.overline, color: colors.navy[300], marginBottom: spacing.sm },
  promptChip: {
    backgroundColor: colors.surface[0], borderRadius: radius.lg,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.surface[2],
  },
  promptChipText: { ...typography.body, color: colors.navy[500], fontSize: 14 },
  typingIndicator: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xxl, paddingVertical: spacing.sm, gap: spacing.sm },
  typingDots: { flexDirection: 'row', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary[400] },
  dot1: { opacity: 0.4 },
  dot2: { opacity: 0.7 },
  dot3: { opacity: 1.0 },
  typingText: { ...typography.caption, color: colors.navy[300], fontStyle: 'italic' },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, paddingBottom: spacing.md,
    gap: spacing.sm, backgroundColor: colors.surface[0],
    borderTopWidth: 1, borderTopColor: colors.surface[2],
  },
  input: {
    flex: 1, backgroundColor: colors.surface[1], borderRadius: radius.xl,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    ...typography.body, maxHeight: 100, color: colors.navy[700],
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary[500], justifyContent: 'center', alignItems: 'center',
    ...shadows.sm,
  },
  sendBtnDisabled: { backgroundColor: colors.surface[3] },
  stopBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.lg, height: 40, borderRadius: 20,
    backgroundColor: colors.russet, justifyContent: 'center',
  },
  stopBtnText: { ...typography.captionMedium, color: '#fff', fontSize: 13 },
});
