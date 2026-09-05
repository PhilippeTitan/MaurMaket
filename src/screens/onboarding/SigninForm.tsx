import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../../theme';
import { useTranslation } from '../../i18n';
import { login as apiLogin, googleAuth } from '../../api';
import { store } from '../../store';
import AuthInput from './components/AuthInput';
import Divider from './components/Divider';
import type { User } from '../../types';

interface SigninFormProps {
  switchMode: () => void;
  onForgotPassword: () => void;
}

export default function SigninForm({ switchMode, onForgotPassword }: SigninFormProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const handleGoogle = async () => {
    try {
      setGoogleLoading(true);
      const res = await googleAuth() as { user: User; token: string };
      await store.setUser(res.user, res.token);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google sign-in failed';
      setError(message);
    } finally {
      setGoogleLoading(false);
    }
  };

  const canSubmit = email.trim() && password.trim();

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleLogin = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiLogin(email.trim(), password) as { user: User; token: string };
      await store.setUser(res.user, res.token);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <View style={styles.centeredHeader}>
        <Text style={styles.brand}>Maur<Text style={styles.brandAccent}>Maket</Text></Text>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>
      </View>

      <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
        <AuthInput
          icon="email-outline"
          value={email}
          onChangeText={(v) => { setEmail(v); setError(''); }}
          placeholder="you@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <AuthInput
          icon="lock-outline"
          value={password}
          onChangeText={(v) => { setPassword(v); setError(''); }}
          placeholder="Password"
          secureTextEntry={!showPw}
          error={error}
          rightIcon={showPw ? 'eye-off-outline' : 'eye-outline'}
          onRightPress={() => setShowPw(s => !s)}
        />
      </Animated.View>

      <TouchableOpacity onPress={onForgotPassword} style={styles.forgotBtn}>
        <Text style={styles.forgotText}>{t('auth.forgotPassword')}</Text>
      </TouchableOpacity>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryBtn, (!canSubmit || loading) && styles.btnDisabled]}
          onPress={handleLogin}
          disabled={!canSubmit || loading}
        >
          <Text style={styles.primaryBtnText}>{loading ? t('common.loading') : t('auth.signIn')}</Text>
          <MaterialCommunityIcons name="arrow-right" size={17} color="#fff" />
        </TouchableOpacity>

        <Divider />

        <TouchableOpacity
          style={[styles.googleBtn, googleLoading && styles.btnDisabled]}
          onPress={handleGoogle}
          disabled={googleLoading}
        >
          <MaterialCommunityIcons name="google" size={20} color="#4285F4" />
          <Text style={styles.googleBtnText}>{googleLoading ? 'Connecting…' : t('auth.googleSignIn')}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={switchMode}>
          <Text style={styles.switchText}>
            {t('auth.noAccount')} <Text style={styles.switchLink}>{t('auth.signUp')}</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  centeredHeader: { alignItems: 'center', marginBottom: 36, marginTop: SPACING.xl },
  brand: { fontFamily: 'Syne', fontSize: 20, fontWeight: '800', color: COLORS.text },
  brandAccent: { color: COLORS.coral },
  title: { fontFamily: 'Syne', fontSize: 34, fontWeight: '800', color: COLORS.text, marginBottom: 8, textAlign: 'center', marginTop: 12 },
  subtitle: { color: COLORS.text2, fontSize: 15, textAlign: 'center' },

  forgotBtn: { alignItems: 'flex-end', marginTop: -4, marginBottom: 8 },
  forgotText: { color: COLORS.coral, fontSize: 14, fontWeight: '500' },

  footer: { marginTop: 18, paddingBottom: SPACING.xl },
  primaryBtn: {
    backgroundColor: COLORS.coral, padding: 16, borderRadius: RADIUS.pill,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: COLORS.coral, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 24, elevation: 8,
  },
  btnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    padding: 14, borderRadius: RADIUS.pill, borderWidth: 1.5, borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  googleBtnText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  switchText: { textAlign: 'center', color: COLORS.text2, fontSize: 13.5, marginTop: 16 },
  switchLink: { color: COLORS.coral, fontWeight: '700', fontSize: 13.5 },
});
