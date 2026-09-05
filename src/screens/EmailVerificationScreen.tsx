import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Icon } from '../components/icons/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme';
import { useTranslation } from '../i18n';
import { store } from '../store';
import { supabase } from '../supabase';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, AuthStackParamList } from '../navigation';
import BackButton from '../components/BackButton';

type Props = NativeStackScreenProps<RootStackParamList & AuthStackParamList, 'EmailVerification'>;

export default function EmailVerificationScreen({ navigation, route }: Props) {
  const { t, language } = useTranslation();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [verified, setVerified] = useState(false);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email_confirmed_at) setVerified(true);
    }).catch(() => {});
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, []);

  const handleCheckStatus = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (!data.user?.email_confirmed_at) {
        Alert.alert(t('common.error'), 'Your email is not confirmed yet. Open the confirmation link from your inbox, then try again.');
        return;
      }
      setVerified(true);
      await store.refreshUser();
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
      const { data } = await supabase.auth.getUser();
      if (!data.user?.email) throw new Error('No email address is associated with this account.');
      const { error } = await supabase.auth.resend({ type: 'signup', email: data.user.email });
      if (error) throw error;
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
            <Icon name="verified" size={56} color={COLORS.green} />
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
        <BackButton onPress={() => navigation.goBack()} style={{ marginBottom: SPACING.md }} />

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

        <TouchableOpacity
          style={[styles.verifyBtn, loading && styles.verifyBtnDisabled]}
          onPress={handleCheckStatus}
          disabled={loading}
          accessibilityLabel="check email confirmation"
          accessibilityRole="button"
        >
          <Text style={styles.verifyBtnText}>
            {loading ? t('common.loading') : 'I confirmed my email'}
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
