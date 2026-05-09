import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Link } from 'expo-router';
import { useAuthStore } from '@/stores/auth-store';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      Alert.alert('Login Failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-primary-50"
    >
      <View className="flex-1 justify-center px-6">
        {/* Logo / Brand */}
        <View className="items-center mb-12">
          <Text className="text-4xl font-serif text-primary-800">ReadPal</Text>
          <Text className="text-sm text-navy-400 mt-2">Your AI Reading Companion</Text>
        </View>

        {/* Form */}
        <View className="bg-white rounded-2xl p-6 shadow-soft">
          <TextInput
            className="bg-surface-1 rounded-xl px-4 py-3 text-base text-navy-800 mb-4"
            placeholder="Email"
            placeholderTextColor="#8a99ae"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            className="bg-surface-1 rounded-xl px-4 py-3 text-base text-navy-800 mb-6"
            placeholder="Password"
            placeholderTextColor="#8a99ae"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <TouchableOpacity
            className="bg-primary-500 rounded-xl py-4 items-center"
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-semibold text-base">Sign In</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Register link */}
        <View className="flex-row justify-center mt-6">
          <Text className="text-navy-400">Don't have an account? </Text>
          <Link href="/(auth)/register" asChild>
            <TouchableOpacity>
              <Text className="text-primary-500 font-semibold">Sign Up</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
