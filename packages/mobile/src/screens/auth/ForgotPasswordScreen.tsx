import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { api } from '../../lib/api';
import { Colors, Spacing, Typography, BorderRadius } from '../../lib/theme';

interface ForgotPasswordProps {
  navigation: any;
}

export function ForgotPasswordScreen({ navigation }: ForgotPasswordProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleReset() {
    if (!email) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/api/auth/forgot-password', { email });
      if (res.success) {
        setSent(true);
      } else {
        Alert.alert('Error', res.error?.message || 'Failed to send reset email');
      }
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Reset Password</Text>
      {sent ? (
        <>
          <Text style={styles.message}>
            If an account exists with {email}, you will receive a password reset link shortly.
          </Text>
          <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.buttonText}>Back to Login</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.message}>
            Enter your email address and we'll send you a link to reset your password.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={Colors.textTertiary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TouchableOpacity style={styles.button} onPress={handleReset} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.buttonText}>Send Reset Link</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Login')} style={{ marginTop: Spacing.md }}>
            <Text style={{ ...Typography.bodySmall, color: Colors.primary }}>
              Back to Login
            </Text>
          </TouchableOpacity>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    backgroundColor: Colors.background,
  },
  title: {
    ...Typography.h2,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  message: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    ...Typography.body,
    color: Colors.text,
    backgroundColor: Colors.surface,
    marginBottom: Spacing.lg,
  },
  button: {
    width: '100%',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  buttonText: {
    ...Typography.body,
    color: Colors.white,
    fontWeight: '700',
  },
});
