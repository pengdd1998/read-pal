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
import { validateName, validateEmail, validatePassword, getPasswordStrength } from '@/lib/validation';

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const register = useAuthStore((s) => s.register);

  const validateField = (field: string, value: string) => {
    let result;
    switch (field) {
      case 'name':
        result = validateName(value);
        break;
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
    if (field === 'name') value = name;
    if (field === 'email') value = email;
    if (field === 'password') value = password;
    validateField(field, value);
  };

  const handleRegister = async () => {
    // Mark all fields as touched
    setTouched({ name: true, email: true, password: true });

    // Validate all fields
    const isNameValid = validateField('name', name);
    const isEmailValid = validateField('email', email);
    const isPasswordValid = validateField('password', password);

    if (!isNameValid || !isEmailValid || !isPasswordValid) {
      return;
    }

    setLoading(true);
    try {
      await register(name, email, password);
    } catch (err) {
      Alert.alert('Registration Failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const passwordStrength = getPasswordStrength(password);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-primary-50"
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
        <View className="px-6">
          {/* Logo / Brand */}
          <View className="items-center mb-8">
            <Text className="text-4xl font-serif text-primary-800">ReadPal</Text>
            <Text className="text-sm text-navy-400 mt-2">Create your account</Text>
          </View>

          {/* Form */}
          <View className="bg-white rounded-2xl p-6 shadow-soft">
            {/* Name Field */}
            <View className="mb-4">
              <TextInput
                className={`bg-surface-1 rounded-xl px-4 py-3 text-base text-navy-800 ${touched.name && errors.name ? 'border-2 border-russet' : ''}`}
                placeholder="Name"
                placeholderTextColor="#8a99ae"
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  if (touched.name) validateField('name', text);
                }}
                onBlur={() => handleBlur('name')}
                autoCapitalize="words"
              />
              {touched.name && errors.name && (
                <Text className="text-russet text-sm mt-1 ml-1">{errors.name}</Text>
              )}
            </View>

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
                placeholder="Password (6+ characters)"
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

              {/* Password Strength Indicator */}
              {password.length > 0 && (
                <View className="mt-2">
                  <View className="flex-row gap-1 mb-1">
                    <View className={`h-1 flex-1 rounded ${passwordStrength.score >= 1 ? 'bg-green-500' : 'bg-surface-2'}`} />
                    <View className={`h-1 flex-1 rounded ${passwordStrength.score >= 2 ? 'bg-green-500' : 'bg-surface-2'}`} />
                    <View className={`h-1 flex-1 rounded ${passwordStrength.score >= 3 ? 'bg-green-500' : 'bg-surface-2'}`} />
                    <View className={`h-1 flex-1 rounded ${passwordStrength.score >= 4 ? 'bg-green-500' : 'bg-surface-2'}`} />
                  </View>
                  {passwordStrength.strength === 'weak' && passwordStrength.suggestions.length > 0 && (
                    <Text className="text-xs text-navy-400 mt-1">Tip: {passwordStrength.suggestions[0]}</Text>
                  )}
                </View>
              )}
            </View>

            <TouchableOpacity
              className="bg-primary-500 rounded-xl py-4 items-center"
              onPress={handleRegister}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-semibold text-base">Create Account</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Register link */}
          <View className="flex-row justify-center mt-6">
            <Text className="text-navy-400">Already have an account? </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity>
                <Text className="text-primary-500 font-semibold">Sign In</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
