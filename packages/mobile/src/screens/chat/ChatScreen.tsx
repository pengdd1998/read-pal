import React, { useState, useRef } from 'react';
import {
  View,
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { api } from '../../lib/api';
import { Colors, Spacing, Typography, BorderRadius } from '../../lib/theme';
import { API_ROUTES } from '@read-pal/shared';

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

/**
 * The server agent-chat endpoint returns the response in a flat shape:
 *   { success, content, agentsUsed, metadata, error }
 * NOT nested under `data`. We need to access `content` directly from the
 * response object rather than from `res.data`.
 */
interface AgentChatRawResponse {
  success: boolean;
  content?: string;
  agentsUsed?: string[];
  error?: { code: string; message: string };
}

export function ChatScreen() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: DisplayMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const res = await api.post<AgentChatRawResponse>(API_ROUTES.AGENT_CHAT, {
        message: text,
        agent: 'companion',
      });

      // The server returns content at the top level, not under `data`.
      // Our api client returns the parsed JSON body directly, so we check
      // both the top-level `content` and `res.data?.content` for safety.
      const responseContent =
        (res as any).content ||
        res.data?.content ||
        '';

      if (res.success && responseContent) {
        setMessages((prev) => [
          ...prev,
          {
            id: `agent-${Date.now()}`,
            role: 'assistant',
            content: responseContent,
            createdAt: new Date().toISOString(),
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: res.error?.message || (res as any).error?.message || 'Sorry, I could not generate a response.',
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: 'assistant', content: 'Sorry, something went wrong. Please try again.', createdAt: new Date().toISOString() },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={{ ...Typography.body, color: Colors.textSecondary }}>
              Start a conversation with your reading companion
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.messageBubble, item.role === 'user' ? styles.userBubble : styles.agentBubble]}>
            <Text style={[styles.messageText, item.role === 'user' ? styles.userText : styles.agentText]}>
              {item.content}
            </Text>
          </View>
        )}
      />
      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          placeholder="Ask your reading companion..."
          placeholderTextColor={Colors.textTertiary}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={sendMessage} disabled={sending || !input.trim()}>
          {sending ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Text style={styles.sendText}>Send</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  messageList: { padding: Spacing.md, flexGrow: 1 },
  messageBubble: {
    maxWidth: '80%',
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.chatUser,
  },
  agentBubble: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.chatAgent,
  },
  messageText: { ...Typography.bodySmall },
  userText: { color: Colors.white },
  agentText: { color: Colors.text },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: Spacing.sm,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    maxHeight: 100,
    ...Typography.body,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  sendBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 44,
  },
  sendText: { ...Typography.button, color: Colors.white, fontSize: 14 },
});
