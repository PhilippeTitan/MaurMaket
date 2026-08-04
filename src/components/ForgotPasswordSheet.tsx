import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, Dimensions, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../theme';
import { useTranslation } from '../i18n';
import { forgotPassword, resetPassword } from '../api';

const { height: SCREEN_H } = Dimensions.get('window');

interface ForgotPasswordSheetProps {
  visible: boolean;
  onClose: () => void;
}

export default function ForgotPasswordSheet({ visible, onClose }: ForgotPasswordSheetProps) {
  const { t } = useTranslation();
  const [stage, setStage] = useState<'email' | 'code' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const translateY = useRef(new Animated.Value(SCREEN_H)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setStage('email');
      setEmail('');
      setCode('');
      setNewPassword('');
      setError('');
      Animated.parallel([
        Animated.timing(bgOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, friction: 8, tension: 80, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(bgOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: SCREEN_H, duration: 280, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const handleSendCode = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    try {
      await forgotPassword(email.trim());
      setStage('code');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (code.length !== 6 || newPassword.length < 6) return;
    setLoading(true);
    setError('');
    try {
      await resetPassword(email.trim(), code, newPassword);
      setStage('done');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.overlay, { opacity: bgOpacity }]} />
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={StyleSheet.absoluteFill}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.handle} />
          {stage === 'email' && (
            <>
              <Text style={styles.title}>{t('reset.title')}</Text>
              <Text style={styles.subtitle}>{t('reset.enterEmail')}</Text>
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
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <TouchableOpacity
                style={[styles.btn, (!email.trim() || loading) && styles.btnDisabled]}
                onPress={handleSendCode}
                disabled={!email.trim() || loading}
              >
                <Text style={styles.btnText}>{loading ? t('common.loading') : t('reset.sendCode')}</Text>
              </TouchableOpacity>
            </>
          )}
          {stage === 'code' && (
            <>
              <Text style={styles.title}>Check your inbox</Text>
              <Text style={styles.subtitle}>Enter the code and pick a new password.</Text>
              <TextInput
                style={styles.input}
                placeholder="6-digit code"
                placeholderTextColor={COLORS.text2}
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
              />
              <TextInput
                style={styles.input}
                placeholder={t('reset.newPassword')}
                placeholderTextColor={COLORS.text2}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleReset}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <TouchableOpacity
                style={[styles.btn, (code.length !== 6 || newPassword.length < 6 || loading) && styles.btnDisabled]}
                onPress={handleReset}
                disabled={code.length !== 6 || newPassword.length < 6 || loading}
              >
                <Text style={styles.btnText}>{loading ? t('common.loading') : t('reset.resetPassword')}</Text>
              </TouchableOpacity>
            </>
          )}
          {stage === 'done' && (
            <>
              <View style={styles.doneRow}>
                <View style={styles.doneIcon}>
                  <MaterialCommunityIcons name="check" size={16} color="#06231A" />
                </View>
                <Text style={styles.title}>Password reset</Text>
              </View>
              <Text style={styles.subtitle}>Sign in with your new password.</Text>
              <TouchableOpacity style={styles.btn} onPress={onClose}>
                <Text style={styles.btnText}>Back to sign in</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: 18,
  },
  title: {
    fontFamily: 'Syne',
    fontSize: 19,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 6,
  },
  subtitle: {
    color: COLORS.text2,
    fontSize: 13.5,
    marginBottom: 16,
    lineHeight: 18,
  },
  input: {
    width: '100%',
    padding: 14,
    backgroundColor: COLORS.bg,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.card,
    color: COLORS.text,
    fontSize: 16,
    marginBottom: 12,
  },
  error: {
    color: COLORS.coral,
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 8,
  },
  btn: {
    backgroundColor: COLORS.coral,
    padding: 16,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    marginTop: 4,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    color: '#fff',
    fontSize: 15.5,
    fontWeight: '700',
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  doneIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
