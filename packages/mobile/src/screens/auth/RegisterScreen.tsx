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

interface RegisterScreenProps {
  navigation: any;
  route: { params?: { setAuth?: (token: string | null) => void } };
}

export function RegisterScreen({ navigation, route }: RegisterScreenProps) {
  const setAuth = route.params?.setAuth;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!name || !email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ token: string; user: any }>(
        API_ROUTES.AUTH_REGISTER,
        { name, email, password },
      );
      if (res.success && res.data?.token) {
        if (setAuth) {
          setAuth(res.data.token);
        }
      } else {
        Alert.alert('Error', res.error?.message || 'Registration failed');
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
      <Text style={{ ...Typography.h2, color: Colors.text, marginBottom: Spacing.lg }}>
        Create Account
      </Text>
      <TextInput
        style={[defaultStyles.input, { width: '100%', marginBottom: Spacing.md }]}
        placeholder="Name"
        placeholderTextColor={Colors.textTertiary}
        value={name}
        onChangeText={setName}
      />
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
        placeholder="Password (min 8 chars)"
        placeholderTextColor={Colors.textTertiary}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <TouchableOpacity
        style={[defaultStyles.button, { width: '100%' }]}
        onPress={handleRegister}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={Colors.white} />
        ) : (
          <Text style={defaultStyles.buttonText}>Sign Up</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate('Login')} style={{ marginTop: Spacing.md }}>
        <Text style={{ ...Typography.bodySmall, color: Colors.primary }}>
          Already have an account? Log In
        </Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}
