import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { api } from '../../lib/api';
import { Colors, Spacing, Typography, BorderRadius } from '../../lib/theme';

interface FriendMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  emotion?: string;
  createdAt: string;
}

interface PersonaOption {
  key: string;
  name: string;
  emoji: string;
  tone: string;
  description: string;
}

export function FriendScreen() {
  const [messages, setMessages] = useState<FriendMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [persona, setPersona] = useState('sage');
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [showPersonaPicker, setShowPersonaPicker] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    loadStatus();
    loadHistory();
  }, []);

  async function loadStatus() {
    try {
      const res = await api.get<{ persona: string; allPersonas: PersonaOption[] }>('/api/friend');
      if (res.success && res.data) {
        const data = res.data as any;
        if (data.persona) setPersona(data.persona);
        if (data.allPersonas) setPersonas(data.allPersonas);
      }
    } catch {
      // Non-critical
    }
  }

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const res = await api.get<{ messages: FriendMessage[] }>('/api/friend/history?limit=30');
      if (res.success && res.data) {
        const data = res.data as any;
        if (data.messages) {
          setMessages(data.messages.map((m: any) => ({
            id: m.id || `hist-${Date.now()}-${Math.random()}`,
            role: m.role,
            content: m.content,
            emotion: m.emotion,
            createdAt: m.createdAt,
          })));
        }
      }
    } catch {
      // Non-critical
    } finally {
      setLoadingHistory(false);
    }
  }

  async function selectPersona(key: string) {
    setPersona(key);
    setShowPersonaPicker(false);
    try {
      await api.patch('/api/friend', { persona: key });
    } catch {
      // Non-critical
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: FriendMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const res = await api.post<{ response: string; persona: string; emotion: string }>('/api/friend/chat', {
        message: text,
        context: { persona },
      });

      if (res.success && res.data) {
        const data = res.data as any;
        const responseContent = data.response || data.content || '';
        setMessages((prev) => [
          ...prev,
          {
            id: `friend-${Date.now()}`,
            role: 'assistant',
            content: responseContent,
            emotion: data.emotion,
            createdAt: new Date().toISOString(),
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: 'Hey, sorry — I got a little lost there. Could you say that again?',
            emotion: 'apologetic',
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: 'Something went wrong. Give me another try?',
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  const currentPersona = personas.find((p) => p.key === persona);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Persona bar */}
      <TouchableOpacity
        style={styles.personaBar}
        onPress={() => setShowPersonaPicker(!showPersonaPicker)}
      >
        <Text style={styles.personaEmoji}>{currentPersona?.emoji || '\u{1F989}'}</Text>
        <Text style={styles.personaName}>{currentPersona?.name || 'Sage'}</Text>
        <Text style={styles.personaTone}>{currentPersona?.tone || 'wise & patient'}</Text>
        <Text style={styles.personaChevron}>{showPersonaPicker ? '\u25B2' : '\u25BC'}</Text>
      </TouchableOpacity>

      {/* Persona picker */}
      {showPersonaPicker && (
        <View style={styles.pickerContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerScroll}>
            {personas.map((p) => (
              <TouchableOpacity
                key={p.key}
                style={[styles.pickerItem, persona === p.key && styles.pickerItemActive]}
                onPress={() => selectPersona(p.key)}
              >
                <Text style={styles.pickerEmoji}>{p.emoji}</Text>
                <Text style={[styles.pickerName, persona === p.key && styles.pickerNameActive]}>{p.name}</Text>
              </TouchableOpacity>
            ))}
            {personas.length === 0 && (
              <>
                {['sage', 'penny', 'alex', 'quinn', 'sam'].map((key) => {
                  const defaults: Record<string, { emoji: string; name: string }> = {
                    sage: { emoji: '\u{1F989}', name: 'Sage' },
                    penny: { emoji: '\u{1F31F}', name: 'Penny' },
                    alex: { emoji: '\u{1F4AA}', name: 'Alex' },
                    quinn: { emoji: '\u{1F33F}', name: 'Quinn' },
                    sam: { emoji: '\u{1F4DA}', name: 'Sam' },
                  };
                  const d = defaults[key];
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.pickerItem, persona === key && styles.pickerItemActive]}
                      onPress={() => selectPersona(key)}
                    >
                      <Text style={styles.pickerEmoji}>{d.emoji}</Text>
                      <Text style={[styles.pickerName, persona === key && styles.pickerNameActive]}>{d.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </ScrollView>
        </View>
      )}

      {/* Messages */}
      {loadingHistory ? (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={{ ...Typography.body, color: Colors.textSecondary }}>
                Say hi to your reading friend!
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.messageBubble, item.role === 'user' ? styles.userBubble : styles.friendBubble]}>
              <Text style={[styles.messageText, item.role === 'user' ? styles.userText : styles.friendText]}>
                {item.content}
              </Text>
              {item.emotion && item.role === 'assistant' && (
                <Text style={styles.emotionTag}>{item.emotion}</Text>
              )}
            </View>
          )}
        />
      )}

      {/* Input */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          placeholder={`Talk to ${currentPersona?.name || 'Sage'}...`}
          placeholderTextColor={Colors.textTertiary}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={5000}
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
  personaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  personaEmoji: { fontSize: 20 },
  personaName: { ...Typography.body, fontWeight: '600', color: Colors.text },
  personaTone: { ...Typography.caption, color: Colors.textSecondary, flex: 1 },
  personaChevron: { fontSize: 10, color: Colors.textSecondary },
  pickerContainer: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingVertical: Spacing.sm,
  },
  pickerScroll: { paddingHorizontal: Spacing.sm, gap: Spacing.sm },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full || 20,
    backgroundColor: Colors.gray100,
    gap: Spacing.xs,
  },
  pickerItemActive: {
    backgroundColor: Colors.primary,
  },
  pickerEmoji: { fontSize: 16 },
  pickerName: { ...Typography.caption, color: Colors.text },
  pickerNameActive: { color: Colors.white },
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
    backgroundColor: Colors.primary,
  },
  friendBubble: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  messageText: { ...Typography.bodySmall },
  userText: { color: Colors.white },
  friendText: { color: Colors.text },
  emotionTag: {
    ...Typography.caption,
    color: Colors.primary,
    fontSize: 10,
    fontStyle: 'italic',
    marginTop: 2,
  },
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
