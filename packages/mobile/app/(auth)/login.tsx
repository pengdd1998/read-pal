import { useState, useEffect, useRef } from 'react';
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
  StyleSheet,
} from 'react-native';
import { Link } from 'expo-router';
import { useAuthStore } from '@/stores/auth-store';
import { validateEmail, validatePassword } from '@/lib/validation';
import { MailIcon, LockIcon, EyeIcon, EyeOffIcon, AISparkleIcon } from '@/components/shared/Icons';
import { colors, typography, radius, shadows, spacing } from '@/lib/theme';

export default function LoginScreen() {
  const [email, setEmail] = useState(__DEV__ ? 'readpal-test@example.com' : '');
  const [password, setPassword] = useState(__DEV__ ? 'TestPass123!' : '');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showPassword, setShowPassword] = useState(false);
  const login = useAuthStore((s) => s.login);
  const autoLoggedIn = useRef(false);

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
    const value = field === 'email' ? email : password;
    validateField(field, value);
  };

  const handleLogin = async () => {
    setTouched({ email: true, password: true });
    const isEmailValid = validateField('email', email);
    const isPasswordValid = validateField('password', password);
    if (!isEmailValid || !isPasswordValid) return;

    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      Alert.alert('Login Failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (__DEV__ && email && password && !autoLoggedIn.current) {
      autoLoggedIn.current = true;
      const t = setTimeout(() => handleLogin(), 800);
      return () => clearTimeout(t);
    }
  }, []);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Brand */}
        <View style={styles.brandSection}>
          <View style={styles.logoCircle}>
            <AISparkleIcon size={32} color={colors.primary[500]} />
          </View>
          <Text style={styles.brandName}>ReadPal</Text>
          <Text style={styles.brandTagline}>Your AI Reading Companion</Text>
        </View>

        {/* Form Card */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Welcome back</Text>

          {/* Email */}
          <View style={styles.inputGroup}>
            <View style={[styles.inputWrapper, touched.email && errors.email ? styles.inputError : null]}>
              <MailIcon size={18} color={colors.navy[300]} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email address"
                placeholderTextColor={colors.navy[300]}
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
            </View>
            {touched.email && errors.email && (
              <Text style={styles.fieldError}>{errors.email}</Text>
            )}
          </View>

          {/* Password */}
          <View style={styles.inputGroup}>
            <View style={[styles.inputWrapper, touched.password && errors.password ? styles.inputError : null]}>
              <LockIcon size={18} color={colors.navy[300]} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={colors.navy[300]}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (touched.password) validateField('password', text);
                }}
                onBlur={() => handleBlur('password')}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
              </TouchableOpacity>
            </View>
            {touched.password && errors.password && (
              <Text style={styles.fieldError}>{errors.password}</Text>
            )}
          </View>

          {/* Sign In */}
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={colors.surface[0]} />
            ) : (
              <Text style={styles.primaryButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social buttons placeholder */}
          <TouchableOpacity style={styles.socialButton} activeOpacity={0.7}>
            <Text style={styles.socialButtonText}>Continue with Google</Text>
          </TouchableOpacity>
        </View>

        {/* Register link */}
        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <Link href="/(auth)/register" asChild>
            <TouchableOpacity>
              <Text style={styles.footerLink}>Sign Up</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f5f0' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  brandSection: { alignItems: 'center', marginBottom: 32 },
  logoCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(217, 119, 6, 0.12)',
    justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md,
  },
  brandName: { ...typography.display, color: colors.navy[700], fontSize: 32 },
  brandTagline: { ...typography.caption, color: colors.navy[300], marginTop: 4 },
  formCard: {
    backgroundColor: colors.surface[0], borderRadius: radius.xl,
    padding: spacing.xxl, ...shadows.md,
  },
  formTitle: { ...typography.title, color: colors.navy[700], marginBottom: spacing.xxl },
  inputGroup: { marginBottom: spacing.lg },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface[1], borderRadius: radius.md,
    borderWidth: 1, borderColor: 'transparent',
    paddingHorizontal: spacing.md, height: 50,
  },
  inputError: { borderColor: colors.russet },
  inputIcon: { marginRight: spacing.sm },
  input: { flex: 1, ...typography.body, color: colors.navy[700], padding: 0 },
  eyeBtn: { padding: spacing.xs },
  fieldError: { ...typography.caption, color: colors.russet, marginTop: 4, marginLeft: 4 },
  primaryButton: {
    backgroundColor: colors.primary[500], borderRadius: radius.md,
    height: 50, justifyContent: 'center', alignItems: 'center',
    marginTop: spacing.sm, ...shadows.sm,
  },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonText: { ...typography.button, color: '#ffffff' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.xxl },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.surface[2] },
  dividerText: { ...typography.caption, color: colors.navy[300], marginHorizontal: spacing.md },
  socialButton: {
    backgroundColor: colors.surface[0], borderRadius: radius.md,
    height: 50, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: colors.surface[2],
  },
  socialButtonText: { ...typography.bodyMedium, color: colors.navy[500] },
  footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xxl },
  footerText: { ...typography.body, color: colors.navy[300] },
  footerLink: { ...typography.bodyMedium, color: colors.primary[500] },
});
