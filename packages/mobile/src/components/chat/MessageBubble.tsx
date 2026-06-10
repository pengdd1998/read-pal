import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing } from '@/lib/theme';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: Date;
  isStreaming?: boolean;
}

interface MessageBubbleProps {
  message: Message;
  personaColor?: string;
}

export default function MessageBubble({ message, personaColor = '#d97706' }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [showActions, setShowActions] = useState(false);

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.aiContainer]}>
      {!isUser && (
        <View style={[styles.avatar, { backgroundColor: `${personaColor}18` }]}>
          <Ionicons name="sparkles" size={14} color={personaColor} />
        </View>
      )}
      <View>
        <TouchableOpacity
          style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}
          onLongPress={() => !isUser && setShowActions(!showActions)}
          activeOpacity={0.8}
        >
          <Text style={[styles.text, isUser ? styles.userText : styles.aiText]}>
            {message.content}
            {message.isStreaming && <Text style={styles.cursor}>|</Text>}
          </Text>
          {message.createdAt && !message.isStreaming && (
            <Text style={styles.time}>
              {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
        </TouchableOpacity>
        {showActions && !isUser && !message.isStreaming && (
          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => setShowActions(false)}>
              <Ionicons name="copy-outline" size={14} color={colors.navy[400]} />
              <Text style={styles.actionText}>Copy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => setShowActions(false)}>
              <Ionicons name="copy-outline" size={14} color={colors.navy[400]} />
              <Text style={styles.actionText}>Flashcard</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => setShowActions(false)}>
              <Ionicons name="thumbs-up-outline" size={14} color={colors.navy[400]} />
              <Text style={styles.actionText}>Good</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => setShowActions(false)}>
              <Ionicons name="thumbs-down-outline" size={14} color={colors.navy[400]} />
              <Text style={styles.actionText}>Bad</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', marginBottom: spacing.md, paddingHorizontal: spacing.lg },
  userContainer: { justifyContent: 'flex-end' },
  aiContainer: { justifyContent: 'flex-start' },
  avatar: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
    marginRight: spacing.sm, marginTop: 2,
  },
  bubble: {
    maxWidth: '78%', borderRadius: radius.lg,
    padding: spacing.md, paddingHorizontal: spacing.lg,
  },
  userBubble: {
    backgroundColor: colors.primary[500],
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: colors.ai.bubble,
    borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: 'rgba(217, 119, 6, 0.08)',
  },
  text: { ...typography.body, lineHeight: 22 },
  userText: { color: '#ffffff' },
  aiText: { color: colors.navy[700] },
  cursor: { color: colors.primary[500], fontWeight: '700' },
  time: { ...typography.overline, color: colors.navy[300], marginTop: 4, textAlign: 'right', fontSize: 10 },
  actions: {
    flexDirection: 'row', gap: spacing.sm, marginTop: 4,
    marginLeft: spacing.xxl,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    backgroundColor: colors.surface[1], borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.surface[2],
  },
  actionText: { ...typography.caption, fontSize: 11, color: colors.navy[400] },
});
