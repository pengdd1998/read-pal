import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: Date;
}

interface MessageBubbleProps {
  message: Message;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.aiContainer]}>
      {!isUser && (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>🤖</Text>
        </View>
      )}
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
        <Text style={[styles.text, isUser ? styles.userText : styles.aiText]}>
          {message.content}
        </Text>
        {message.createdAt && (
          <Text style={styles.time}>
            {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', marginBottom: 12, paddingHorizontal: 16 },
  userContainer: { justifyContent: 'flex-end' },
  aiContainer: { justifyContent: 'flex-start' },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f0e9e0', justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  avatarText: { fontSize: 16 },
  bubble: { maxWidth: '78%', borderRadius: 16, padding: 12, paddingHorizontal: 16 },
  userBubble: { backgroundColor: '#d97706', borderBottomRightRadius: 4 },
  aiBubble: { backgroundColor: '#ffffff', borderBottomLeftRadius: 4, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4 },
  text: { fontSize: 15, lineHeight: 22 },
  userText: { color: '#ffffff' },
  aiText: { color: '#1e2a38' },
  time: { fontSize: 11, color: '#8a99ae', marginTop: 4, textAlign: 'right' },
});
