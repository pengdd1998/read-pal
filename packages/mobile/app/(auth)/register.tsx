import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Platform, Alert, ScrollView, StyleSheet,
} from 'react-native';
import { Link } from 'expo-router';
import { useAuthStore } from '@/stores/auth-store';
import { validateName, validateEmail, validatePassword, getPasswordStrength } from '@/lib/validation';
import { MailIcon, LockIcon, PersonIcon, EyeIcon, EyeOffIcon, AISparkleIcon } from '@/components/shared/Icons';
import { colors, typography, radius, shadows, spacing } from '@/lib/theme';

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showPassword, setShowPassword] = useState(false);
  const register = useAuthStore((s) => s.register);

  const validateField = (field: string, value: string) => {
    let result;
    switch (field) {
      case 'name': result = validateName(value); break;
      case 'email': result = validateEmail(value); break;
      case 'password': result = validatePassword(value); break;
      default: result = { isValid: true };
    }
    setErrors((prev) => ({ ...prev, [field]: result.error || '' }));
    return result.isValid;
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const value = field === 'name' ? name : field === 'email' ? email : password;
    validateField(field, value);
  };

  const handleRegister = async () => {
    setTouched({ name: true, email: true, password: true });
    const v1 = validateField('name', name);
    const v2 = validateField('email', email);
    const v3 = validateField('password', password);
    if (!v1 || !v2 || !v3) return;

    setLoading(true);
    try {
      await register(name, email, password);
    } catch (err) {
      Alert.alert('Registration Failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const strength = getPasswordStrength(password);
  const strengthColor = strength.strength === 'weak' ? colors.russet : strength.strength === 'medium' ? colors.primary[500] : colors.sage;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Brand */}
        <View style={styles.brandSection}>
          <View style={styles.logoCircle}>
            <AISparkleIcon size={32} color="#d97706" />
          </View>
          <Text style={styles.brandName}>ReadPal</Text>
          <Text style={styles.brandTagline}>Start reading smarter today</Text>
        </View>

        {/* Form Card */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Create your account</Text>

          {/* Name */}
          <View style={styles.inputGroup}>
            <View style={[styles.inputWrapper, touched.name && errors.name ? styles.inputError : null]}>
              <PersonIcon size={18} color="#8a99ae" style={styles.inputIcon} />
              <TextInput
                style={styles.input} placeholder="Full name" placeholderTextColor="#8a99ae"
                value={name} onChangeText={(t) => { setName(t); if (touched.name) validateField('name', t); }}
                onBlur={() => handleBlur('name')} autoCapitalize="words"
              />
            </View>
            {touched.name && errors.name && <Text style={styles.fieldError}>{errors.name}</Text>}
          </View>

          {/* Email */}
          <View style={styles.inputGroup}>
            <View style={[styles.inputWrapper, touched.email && errors.email ? styles.inputError : null]}>
              <MailIcon size={18} color="#8a99ae" style={styles.inputIcon} />
              <TextInput
                style={styles.input} placeholder="Email address" placeholderTextColor="#8a99ae"
                value={email} onChangeText={(t) => { setEmail(t); if (touched.email) validateField('email', t); }}
                onBlur={() => handleBlur('email')} keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
              />
            </View>
            {touched.email && errors.email && <Text style={styles.fieldError}>{errors.email}</Text>}
          </View>

          {/* Password */}
          <View style={styles.inputGroup}>
            <View style={[styles.inputWrapper, touched.password && errors.password ? styles.inputError : null]}>
              <LockIcon size={18} color="#8a99ae" style={styles.inputIcon} />
              <TextInput
                style={styles.input} placeholder="Password (6+ characters)" placeholderTextColor="#8a99ae"
                value={password} onChangeText={(t) => { setPassword(t); if (touched.password) validateField('password', t); }}
                onBlur={() => handleBlur('password')} secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
              </TouchableOpacity>
            </View>
            {touched.password && errors.password && <Text style={styles.fieldError}>{errors.password}</Text>}
            {password.length > 0 && (
              <View style={styles.strengthRow}>
                <View style={styles.strengthBars}>
                  {[1, 2, 3, 4].map((i) => (
                    <View key={i} style={[styles.strengthBar, { backgroundColor: strength.score >= i ? strengthColor : colors.surface[2] }]} />
                  ))}
                </View>
                <Text style={[styles.strengthLabel, { color: strengthColor }]}>
                  {strength.strength.charAt(0).toUpperCase() + strength.strength.slice(1)}
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
            onPress={handleRegister} disabled={loading} activeOpacity={0.8}
          >
            {loading ? <ActivityIndicator color="white" /> : <Text style={styles.primaryButtonText}>Create Account</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity><Text style={styles.footerLink}>Sign In</Text></TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f5f0' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  brandSection: { alignItems: 'center', marginBottom: 28 },
  logoCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(217, 119, 6, 0.12)', justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md },
  brandName: { ...typography.display, color: colors.navy[700], fontSize: 32 },
  brandTagline: { ...typography.caption, color: colors.navy[300], marginTop: 4 },
  formCard: { backgroundColor: colors.surface[0], borderRadius: radius.xl, padding: spacing.xxl, ...shadows.md },
  formTitle: { ...typography.title, color: colors.navy[700], marginBottom: spacing.xxl },
  inputGroup: { marginBottom: spacing.lg },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface[1], borderRadius: radius.md, borderWidth: 1, borderColor: 'transparent', paddingHorizontal: spacing.md, height: 50 },
  inputError: { borderColor: colors.russet },
  inputIcon: { marginRight: spacing.sm },
  input: { flex: 1, ...typography.body, color: colors.navy[700], padding: 0 },
  eyeBtn: { padding: spacing.xs },
  fieldError: { ...typography.caption, color: colors.russet, marginTop: 4, marginLeft: 4 },
  strengthRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  strengthBars: { flexDirection: 'row', gap: 4 },
  strengthBar: { flex: 1, height: 3, borderRadius: 2 },
  strengthLabel: { ...typography.overline, fontSize: 10 },
  primaryButton: { backgroundColor: colors.primary[500], borderRadius: radius.md, height: 50, justifyContent: 'center', alignItems: 'center', marginTop: spacing.sm, ...shadows.sm },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonText: { ...typography.button, color: '#ffffff' },
  footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xxl },
  footerText: { ...typography.body, color: colors.navy[300] },
  footerLink: { ...typography.bodyMedium, color: colors.primary[500] },
});
