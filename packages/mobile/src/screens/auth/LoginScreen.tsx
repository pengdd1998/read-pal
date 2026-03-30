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
} from 'react-native';
import { api } from '../../lib/api';
import { Colors, Spacing, defaultStyles, Typography } from '../../lib/theme';
import { API_ROUTES } from '@read-pal/shared';

interface LoginScreenProps {
  navigation: any;
  route: { params?: { setAuth?: (token: string | null) => void } };
}

export function LoginScreen({ navigation, route }: LoginScreenProps) {
  const setAuth = route.params?.setAuth;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ token: string; user: any }>(
        API_ROUTES.AUTH_LOGIN,
        { email, password },
      );
      if (res.success && res.data?.token) {
        if (setAuth) {
          setAuth(res.data.token);
        }
      } else {
        Alert.alert('Error', res.error?.message || 'Login failed');
      }
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={defaultStyles.centered}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={{ ...Typography.h1, color: Colors.primary, marginBottom: Spacing.xl }}>
        read-pal
      </Text>
      <Text style={{ ...Typography.bodySmall, color: Colors.textSecondary, marginBottom: Spacing.xl }}>
        Your AI Reading Companion
      </Text>
      <TextInput
        style={[defaultStyles.input, { width: '100%', marginBottom: Spacing.md }]}
        placeholder="Email"
        placeholderTextColor={Colors.textTertiary}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={[defaultStyles.input, { width: '100%', marginBottom: Spacing.lg }]}
        placeholder="Password"
        placeholderTextColor={Colors.textTertiary}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <TouchableOpacity
        style={[defaultStyles.button, { width: '100%' }]}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={Colors.white} />
        ) : (
          <Text style={defaultStyles.buttonText}>Log In</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate('Register')} style={{ marginTop: Spacing.md }}>
        <Text style={{ ...Typography.bodySmall, color: Colors.primary }}>
          Don&apos;t have an account? Sign Up
        </Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}
