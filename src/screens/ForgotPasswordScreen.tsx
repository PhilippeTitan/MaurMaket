import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme';
import { useTranslation } from '../i18n';
import { forgotPassword, resetPassword } from '../api';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, AuthStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList & AuthStackParamList, 'ForgotPassword'>;

export default function ForgotPasswordScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const prefilledCode = route?.params?.code || '';

  const [step, setStep] = useState<'email' | 'reset'>(prefilledCode ? 'reset' : 'email');
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
    if (!email.trim()) {
      Alert.alert(t('common.error'), t('auth.emailPlaceholder'));
      return;
    }
    setLoading(true);
    try {
      await forgotPassword(email.trim());
      setStep('reset');
      startCooldown();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send code';
      Alert.alert(t('common.error'), message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    try {
      await forgotPassword(email.trim());
      startCooldown();
    } catch {
      Alert.alert(t('common.error'), 'Failed to resend code');
    }
  };

  const handleResetPassword = async () => {
    if (code.length !== 6) {
      Alert.alert(t('common.error'), t('verify.invalidCode'));
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert(t('common.error'), t('auth.passwordMin'));
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert(t('common.error'), t('reset.passwordMismatch'));
      return;
    }
    setLoading(true);
    try {
      await resetPassword(email.trim(), code, newPassword);
      Alert.alert(t('reset.success'), t('reset.successMessage'), [
        { text: 'OK', onPress: () => navigation.navigate('Login') },
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to reset password';
      Alert.alert(t('common.error'), message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.content, { paddingTop: insets.top + SPACING.md }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="go back" accessibilityRole="button">
          <MaterialCommunityIcons name="arrow-left" size={35} color={COLORS.text} />
        </TouchableOpacity>

        {step === 'email' ? (
          <>
            <View style={styles.header}>
              <View style={styles.iconWrap}>
                <MaterialCommunityIcons name="lock-reset" size={36} color={COLORS.coral} />
              </View>
              <Text style={styles.title}>{t('reset.title')}</Text>
              <Text style={styles.subtitle}>{t('reset.enterEmail')}</Text>
            </View>

            <TextInput
              style={styles.input}
              placeholder={t('auth.emailPlaceholder')}
              placeholderTextColor={COLORS.text2}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              returnKeyType="done"
              onSubmitEditing={handleSendCode}
              accessibilityLabel="email address"
             
            />

            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.btnDisabled]}
              onPress={handleSendCode}
              disabled={loading}
              accessibilityLabel="send code"
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>
                {loading ? t('common.loading') : t('reset.sendCode')}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.header}>
              <View style={styles.iconWrap}>
                <MaterialCommunityIcons name="shield-key-outline" size={36} color={COLORS.coral} />
              </View>
              <Text style={styles.title}>{t('reset.title')}</Text>
              <Text style={styles.subtitle}>{t('reset.codeSentTo')}{'\n'}<Text style={styles.emailText}>{email}</Text></Text>
            </View>

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
              accessibilityLabel="verification code"
             
            />

            <TextInput
              style={styles.input}
              placeholder={t('reset.newPassword')}
              placeholderTextColor={COLORS.text2}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              returnKeyType="next"
              accessibilityLabel="new password"
             
            />

            <TextInput
              style={styles.input}
              placeholder={t('reset.confirmPassword')}
              placeholderTextColor={COLORS.text2}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleResetPassword}
              accessibilityLabel="confirm password"
             
            />

            <TouchableOpacity
              style={[styles.primaryBtn, (loading || code.length !== 6 || !newPassword || !confirmPassword) && styles.btnDisabled]}
              onPress={handleResetPassword}
              disabled={loading || code.length !== 6 || !newPassword || !confirmPassword}
              accessibilityLabel="reset password"
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>
                {loading ? t('common.loading') : t('reset.resetPassword')}
              </Text>
            </TouchableOpacity>

            <View style={styles.resendRow}>
              {cooldown > 0 ? (
                <Text style={styles.resendCooldown}>{t('verify.resendIn', { seconds: String(cooldown) })}</Text>
              ) : (
                <TouchableOpacity onPress={handleResend} accessibilityLabel="resend code" accessibilityRole="button">
                  <Text style={styles.resendBtn}>{t('verify.resend')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { flex: 1, paddingHorizontal: SPACING.xl },
  backBtn: { width: 40, height: 40, justifyContent: 'center', marginBottom: SPACING.md },
  header: { alignItems: 'center', marginBottom: SPACING.xl },
  iconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: SPACING.sm, textAlign: 'center' },
  subtitle: { fontSize: 14, color: COLORS.text2, textAlign: 'center', lineHeight: 20 },
  emailText: { color: COLORS.coral, fontWeight: '600' },
  input: {
    width: '100%', padding: 14, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.card,
    color: COLORS.text, fontSize: 16, marginBottom: SPACING.md,
  },
  primaryBtn: {
    backgroundColor: COLORS.coral, padding: 16, borderRadius: RADIUS.pill,
    alignItems: 'center', marginBottom: SPACING.md,
  },
  btnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
  codeRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: SPACING.lg,
  },
  codeCell: {
    width: 48, height: 56, borderRadius: RADIUS.card,
    borderWidth: 1.5, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center',
  },
  codeCellFilled: { borderColor: COLORS.coral, backgroundColor: 'rgba(255,77,106,0.08)' },
  codeDigit: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  resendRow: { alignItems: 'center', marginTop: SPACING.sm },
  resendCooldown: { color: COLORS.text2, fontSize: 14 },
  resendBtn: { color: COLORS.coral, fontSize: 14, fontWeight: '600' },
});
