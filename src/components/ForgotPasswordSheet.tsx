import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme';
import { useTranslation } from '@/localization';
import { useViewport } from '@/hooks';
import { forgotPassword } from '../api';

interface ForgotPasswordSheetProps {
  visible: boolean;
  onClose: () => void;
}

export default function ForgotPasswordSheet({ visible, onClose }: ForgotPasswordSheetProps) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  // The sheet slides up from a full window below the fold, so "off screen" is measured
  // against the live window rather than the one the app booted in — otherwise a window
  // that grew leaves the closed sheet parked in the middle of the screen.
  const vp = useViewport();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(vp.height)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setEmail('');
      setError('');
      // Park it exactly one live window below the fold first, so the sheet always rises
      // from the bottom edge of the window it is opening in.
      translateY.setValue(vp.height);
      Animated.parallel([
        Animated.timing(bgOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, friction: 8, tension: 80, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(bgOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: vp.height, duration: 280, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const handleSendCode = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    try {
      await forgotPassword(email.trim());
      // Hand off to the code screen: the sheet is email-only, the code entry
      // (and resend) live on ForgotPasswordScreen.
      const sentTo = email.trim().toLowerCase();
      onClose();
      navigation.navigate('ForgotPassword', { email: sentTo });
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : t('reset.sendFailed'));
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
        <Animated.View style={[styles.sheet, { paddingBottom: Math.max(34, insets.bottom + 16), transform: [{ translateY }] }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t('reset.title')}</Text>
          <Text style={styles.subtitle}>{t('reset.enterEmail')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('auth.emailPlaceholder')}
            placeholderTextColor={COLORS.text2}
            value={email}
            onChangeText={(v) => { setEmail(v); if (error) setError(''); }}
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
    // paddingBottom is applied per-render: a bottom sheet has to clear the home
    // indicator, which is a property of the device (safe-area inset), not a constant.
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
    fontSize: 18,
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
});
