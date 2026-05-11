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
  ScrollView,
} from 'react-native';
import { Link } from 'expo-router';
import { useAuthStore } from '@/stores/auth-store';
import { validateEmail, validatePassword } from '@/lib/validation';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const login = useAuthStore((s) => s.login);

  const validateField = (field: string, value: string) => {
    let result;
    switch (field) {
      case 'email':
        result = validateEmail(value);
        break;
      case 'password':
        result = validatePassword(value);
        break;
      default:
        result = { isValid: true };
    }
    setErrors((prev) => ({ ...prev, [field]: result.error || '' }));
    return result.isValid;
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    let value = '';
    if (field === 'email') value = email;
    if (field === 'password') value = password;
    validateField(field, value);
  };

  const handleLogin = async () => {
    // Mark all fields as touched
    setTouched({ email: true, password: true });

    // Validate all fields
    const isEmailValid = validateField('email', email);
    const isPasswordValid = validateField('password', password);

    if (!isEmailValid || !isPasswordValid) {
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
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
        <View className="px-6">
          {/* Logo / Brand */}
          <View className="items-center mb-12">
            <Text className="text-4xl font-serif text-primary-800">ReadPal</Text>
            <Text className="text-sm text-navy-400 mt-2">Your AI Reading Companion</Text>
          </View>

          {/* Form */}
          <View className="bg-white rounded-2xl p-6 shadow-soft">
            {/* Email Field */}
            <View className="mb-4">
              <TextInput
                className={`bg-surface-1 rounded-xl px-4 py-3 text-base text-navy-800 ${touched.email && errors.email ? 'border-2 border-russet' : ''}`}
                placeholder="Email"
                placeholderTextColor="#8a99ae"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (touched.email) validateField('email', text);
                }}
                onBlur={() => handleBlur('email')}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {touched.email && errors.email && (
                <Text className="text-russet text-sm mt-1 ml-1">{errors.email}</Text>
              )}
            </View>

            {/* Password Field */}
            <View className="mb-6">
              <TextInput
                className={`bg-surface-1 rounded-xl px-4 py-3 text-base text-navy-800 ${touched.password && errors.password ? 'border-2 border-russet' : ''}`}
                placeholder="Password"
                placeholderTextColor="#8a99ae"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (touched.password) validateField('password', text);
                }}
                onBlur={() => handleBlur('password')}
                secureTextEntry
              />
              {touched.password && errors.password && (
                <Text className="text-russet text-sm mt-1 ml-1">{errors.password}</Text>
              )}
            </View>

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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
