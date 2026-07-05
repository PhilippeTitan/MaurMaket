import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme';
import { useTranslation } from '../i18n';
import { sendVerifyCode, checkVerifyCode } from '../api';
import { store } from '../store';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, AuthStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList & AuthStackParamList, 'EmailVerification'>;

export default function EmailVerificationScreen({ navigation, route }: Props) {
  const { t, language } = useTranslation();
  const insets = useSafeAreaInsets();
  const prefilledCode = route?.params?.code || '';

  const [code, setCode] = useState(prefilledCode);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [verified, setVerified] = useState(false);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (prefilledCode) {
      setCode(prefilledCode);
      handleVerify(prefilledCode);
    }
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

  useEffect(() => {
    sendVerifyCode(language).then(() => startCooldown()).catch(() => {});
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, []);

  const handleVerify = async (codeValue?: string) => {
    const c = (codeValue || code).trim();
    if (c.length !== 6) {
      Alert.alert(t('common.error'), t('verify.invalidCode'));
      return;
    }
    setLoading(true);
    try {
      const res = await checkVerifyCode(c) as { user: typeof store.user };
      await store.setUser(res.user, store.token);
      setVerified(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('verify.invalidCode');
      Alert.alert(t('common.error'), message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    try {
      await sendVerifyCode(language);
      startCooldown();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send code';
      Alert.alert(t('common.error'), message);
    }
  };

  if (verified) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + SPACING.xl }]}>
        <View style={styles.successWrap}>
          <View style={styles.successIcon}>
            <MaterialCommunityIcons name="shield-check" size={56} color={COLORS.green} />
          </View>
          <Text style={styles.successTitle}>{t('verify.success')}</Text>
          <Text style={styles.successSub}>{t('verify.successSub')}</Text>
          <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()} accessibilityLabel="done" accessibilityRole="button">
            <Text style={styles.doneBtnText}>{t('common.done')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.content, { paddingTop: insets.top + SPACING.md }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="go back" accessibilityRole="button">
          <MaterialCommunityIcons name="arrow-left" size={35} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.header}>
          <View style={styles.iconWrap}>
            <MaterialCommunityIcons name="email-check-outline" size={36} color={COLORS.coral} />
          </View>
          <Text style={styles.title}>{t('verify.title')}</Text>
          <Text style={styles.subtitle}>
            {t('verify.sentTo')}{'\n'}
            <Text style={styles.email}>{store.user?.email || ''}</Text>
          </Text>
        </View>

        <View style={styles.codeRow}>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <View key={i} style={[styles.codeCell, code.length > i && styles.codeCellFilled]}>
              <Text style={styles.codeDigit}>{code[i] || ''}</Text>
            </View>
          ))}
        </View>

        <TextInput
          ref={inputRef}
          style={styles.hiddenInput}
          value={code}
          onChangeText={text => {
            const digits = text.replace(/\D/g, '').slice(0, 6);
            setCode(digits);
            if (digits.length === 6) handleVerify(digits);
          }}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
          accessibilityLabel="verification code"
         
        />

        <TouchableOpacity
          style={[styles.verifyBtn, (loading || code.length !== 6) && styles.verifyBtnDisabled]}
          onPress={() => handleVerify()}
          disabled={loading || code.length !== 6}
          accessibilityLabel="verify"
          accessibilityRole="button"
        >
          <Text style={styles.verifyBtnText}>
            {loading ? t('common.loading') : t('verify.verify')}
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
  email: { color: COLORS.coral, fontWeight: '600' },
  codeRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: SPACING.xl,
  },
  codeCell: {
    width: 48, height: 56, borderRadius: RADIUS.card,
    borderWidth: 1.5, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center',
  },
  codeCellFilled: { borderColor: COLORS.coral, backgroundColor: 'rgba(255,77,106,0.08)' },
  codeDigit: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  verifyBtn: {
    backgroundColor: COLORS.coral, padding: 16, borderRadius: RADIUS.pill,
    alignItems: 'center', marginBottom: SPACING.md,
  },
  verifyBtnDisabled: { opacity: 0.5 },
  verifyBtnText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
  resendRow: { alignItems: 'center', marginTop: SPACING.sm },
  resendCooldown: { color: COLORS.text2, fontSize: 14 },
  resendBtn: { color: COLORS.coral, fontSize: 14, fontWeight: '600' },
  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl },
  successIcon: { marginBottom: SPACING.lg },
  successTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: SPACING.sm, textAlign: 'center' },
  successSub: { fontSize: 14, color: COLORS.text2, textAlign: 'center', marginBottom: SPACING.xl, lineHeight: 20 },
  doneBtn: {
    backgroundColor: COLORS.coral, paddingVertical: 14, paddingHorizontal: 48,
    borderRadius: RADIUS.pill,
  },
  doneBtnText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
});
