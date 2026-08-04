import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../theme';
import { useTranslation } from '../i18n';
import { forgotPassword, resetPassword } from '../api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BackButton from '../components/BackButton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, AuthStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList & AuthStackParamList, 'ForgotPassword'>;

export default function ForgotPasswordScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const prefilledCode = route?.params?.code || '';

  const [step, setStep] = useState<'email' | 'reset' | 'done'>(prefilledCode ? 'reset' : 'email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState(prefilledCode);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const codeInputRef = useRef<TextInput>(null);

  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, []);

  const startCooldown = useCallback(() => {
    setCooldown(60);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleSendCode = async () => {
    if (!email.trim()) return;
    setLoading(true);
    try {
      await forgotPassword(email.trim());
      setStep('reset');
      startCooldown();
    } catch (err: unknown) {
      // error handled below
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    try {
      await forgotPassword(email.trim());
      startCooldown();
    } catch {}
  };

  const handleResetPassword = async () => {
    if (code.length !== 6 || newPassword.length < 6 || newPassword !== confirmPassword) return;
    setLoading(true);
    try {
      await resetPassword(email.trim(), code, newPassword);
      setStep('done');
    } catch (err: unknown) {
      // error handled below
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.content, { paddingTop: insets.top + SPACING.md }]}>
        <BackButton onPress={() => navigation.goBack()} style={{ marginBottom: SPACING.md }} />

        {/* Sheet handle */}
        <View style={styles.handle} />

        {step === 'email' && (
          <>
            <Text style={styles.title}>{t('reset.title')}</Text>
            <Text style={styles.subtitle}>{t('reset.enterEmail')}</Text>
            <AuthInput
              icon="email-outline"
              value={email}
              onChangeText={setEmail}
              placeholder={t('auth.emailPlaceholder')}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={[styles.btn, (!email.trim() || loading) && styles.btnDisabled]}
              onPress={handleSendCode}
              disabled={!email.trim() || loading}
            >
              <Text style={styles.btnText}>{loading ? t('common.loading') : t('reset.sendCode')}</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'reset' && (
          <>
            <Text style={styles.title}>Check your inbox</Text>
            <Text style={styles.subtitle}>
              {t('reset.codeSentTo')}{'\n'}
              <Text style={styles.emailHighlight}>{email}</Text>
            </Text>

            {/* Code input */}
            <View style={styles.codeRow}>
              {[0, 1, 2, 3, 4, 5].map(i => (
                <View key={i} style={[styles.codeCell, code.length > i && styles.codeCellFilled]}>
                  <Text style={styles.codeDigit}>{code[i] || ''}</Text>
                </View>
              ))}
            </View>
            <TextInput
              ref={codeInputRef}
              style={styles.hiddenInput}
              value={code}
              onChangeText={text => setCode(text.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />

            <AuthInput
              icon="lock-outline"
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder={t('reset.newPassword')}
              secureTextEntry
            />
            <AuthInput
              icon="lock-check-outline"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder={t('reset.confirmPassword')}
              secureTextEntry
              error={confirmPassword && newPassword !== confirmPassword ? t('reset.passwordMismatch') : undefined}
            />

            <TouchableOpacity
              style={[styles.btn, (loading || code.length !== 6 || !newPassword || !confirmPassword || newPassword !== confirmPassword) && styles.btnDisabled]}
              onPress={handleResetPassword}
              disabled={loading || code.length !== 6 || !newPassword || !confirmPassword || newPassword !== confirmPassword}
            >
              <Text style={styles.btnText}>{loading ? t('common.loading') : t('reset.resetPassword')}</Text>
            </TouchableOpacity>

            <View style={styles.resendRow}>
              {cooldown > 0 ? (
                <Text style={styles.resendCooldown}>{t('verify.resendIn', { seconds: String(cooldown) })}</Text>
              ) : (
                <TouchableOpacity onPress={handleResend}>
                  <Text style={styles.resendBtn}>{t('verify.resend')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        {step === 'done' && (
          <>
            <View style={styles.doneRow}>
              <View style={styles.doneIcon}>
                <MaterialCommunityIcons name="check" size={16} color="#06231A" />
              </View>
              <Text style={styles.title}>Password reset</Text>
            </View>
            <Text style={styles.subtitle}>Sign in with your new password.</Text>
            <TouchableOpacity style={styles.btn} onPress={() => navigation.navigate('Login')}>
              <Text style={styles.btnText}>Back to sign in</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function AuthInput({ icon, value, onChangeText, placeholder, keyboardType, autoCapitalize, secureTextEntry, error }: {
  icon: string; value: string; onChangeText: (v: string) => void;
  placeholder: string; keyboardType?: any; autoCapitalize?: any;
  secureTextEntry?: boolean; error?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={inputStyles.wrap}>
      <View style={[inputStyles.row, focused && inputStyles.rowFocused, error && inputStyles.rowError]}>
        <MaterialCommunityIcons name={icon as any} size={18} color={focused ? COLORS.coral : COLORS.text2} />
        <TextInput
          style={inputStyles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.text2}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          secureTextEntry={secureTextEntry}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </View>
      {error ? (
        <View style={inputStyles.errorRow}>
          <MaterialCommunityIcons name="alert-circle-outline" size={14} color={COLORS.coral} />
          <Text style={inputStyles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { flex: 1, paddingHorizontal: SPACING.xl },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border,
    alignSelf: 'center', marginBottom: 18,
  },
  title: {
    fontFamily: 'Syne', fontSize: 22, fontWeight: '800', color: COLORS.text,
    marginBottom: 6, textAlign: 'center',
  },
  subtitle: {
    fontSize: 14, color: COLORS.text2, textAlign: 'center', lineHeight: 20, marginBottom: 24,
  },
  emailHighlight: { color: COLORS.coral, fontWeight: '600' },
  btn: {
    backgroundColor: COLORS.coral, padding: 16, borderRadius: RADIUS.pill,
    alignItems: 'center', marginTop: 4,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  codeRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 },
  codeCell: {
    width: 48, height: 56, borderRadius: RADIUS.card, borderWidth: 1.5,
    borderColor: COLORS.border, backgroundColor: COLORS.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  codeCellFilled: { borderColor: COLORS.coral, backgroundColor: 'rgba(255,77,106,0.08)' },
  codeDigit: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  resendRow: { alignItems: 'center', marginTop: 16 },
  resendCooldown: { color: COLORS.text2, fontSize: 14 },
  resendBtn: { color: COLORS.coral, fontSize: 14, fontWeight: '600' },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  doneIcon: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.green,
    alignItems: 'center', justifyContent: 'center',
  },
});

const inputStyles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: RADIUS.card, paddingHorizontal: 16, paddingVertical: 14,
  },
  rowFocused: { borderColor: COLORS.coral },
  rowError: { borderColor: COLORS.coral },
  input: {
    flex: 1, backgroundColor: 'transparent', borderWidth: 0,
    color: COLORS.text, fontSize: 16, fontWeight: '500', padding: 0,
  },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  errorText: { color: COLORS.coral, fontSize: 13, fontWeight: '500' },
});
