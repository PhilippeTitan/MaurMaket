import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Animated,
  Easing, Platform, KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { COLORS, SPACING, RADIUS, FONTS } from '../../theme';
import { useTranslation } from '../../i18n';
import { login as apiLogin, googleAuth } from '../../api';
import { store } from '../../store';
import AuthInput from './components/AuthInput';
import type { User } from '../../types';
import OnboardingIllustrations from './OnboardingIllustrations';

const VIOLET = '#8B5CF6';
const PINK = '#EC4899';

interface Props {
  onSwitchToSignup: () => void;
  onForgotPassword: () => void;
}

export default function AnimatedSignin({ onSwitchToSignup, onForgotPassword }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const orbAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(floatAnim, { toValue: -8, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(floatAnim, { toValue: 0, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(orbAnim, { toValue: 1, duration: 6000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(orbAnim, { toValue: 0, duration: 6000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
  }, []);

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
    setLoading(true); setError('');
    try {
      const res = await apiLogin(email.trim(), password) as { user: User; token: string };
      await store.setUser(res.user, res.token);
    } catch (err: any) {
      setError(err?.message || 'Login failed');
      triggerShake();
    } finally { setLoading(false); }
  };

  const handleGoogle = async () => {
    try {
      setGoogleLoading(true);
      const res = await googleAuth() as { user: User; token: string };
      await store.setUser(res.user, res.token);
    } catch (err: any) { setError(err?.message || 'Google sign-in failed'); }
    finally { setGoogleLoading(false); }
  };

  const handlePasskey = async () => {
    if (Platform.OS !== 'web') {
      setError('Passkeys are available on web only. Use email sign-in on mobile.');
      return;
    }
    try {
      setLoading(true); setError('');
      // Web passkey via Supabase — navigator.credentials
      const { supabase } = await import('../../supabase');
      const { data, error: pwError } = await supabase.auth.signInWithPasskey();
      if (pwError) throw pwError;
      if (data?.session?.user) {
        const meRes = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${data.session.access_token}` } });
        if (meRes.ok) {
          const meData = await meRes.json();
          await store.setUser(meData.user, data.session.access_token);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Passkey sign-in failed');
    } finally { setLoading(false); }
  };

  const orbDrift1 = orbAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 18] });
  const orbDrift2 = orbAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -22] });

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.container}>
        {/* Background orbs */}
        <View style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 }}>
          <Animated.View style={[s.orb, { top: -60, left: -50, width: 260, height: 260, backgroundColor: '#8B5CF655', transform: [{ translateX: orbDrift1 }, { translateY: orbDrift2 }] }]} />
          <Animated.View style={[s.orb, { bottom: -70, right: -60, width: 280, height: 280, backgroundColor: '#EC48994d', transform: [{ translateX: orbDrift2 }, { translateY: orbDrift1 }] }]} />
        </View>

        <Animated.View style={[s.content, { opacity: fadeAnim, paddingTop: insets.top + 60 }]}>
          {/* Logo */}
          <View style={s.logoRow}>
            <OnboardingIllustrations.LogoMark size={32} />
            <Text style={s.brand}>Maur<Text style={{ color: COLORS.coral }}>Maket</Text></Text>
          </View>

          {/* Illustration */}
          <Animated.View style={{ alignItems: 'center', marginVertical: 20, transform: [{ translateY: floatAnim }] }}>
            <OnboardingIllustrations.Welcome />
          </Animated.View>

          {/* Title */}
          <Text style={s.title}>Welcome back</Text>
          <Text style={s.subtitle}>Sign in to your marketplace</Text>

          {/* Error */}
          {error ? (
            <View style={s.errorRow}>
              <MaterialCommunityIcons name="alert-circle-outline" size={14} color={COLORS.coral} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Fields */}
          <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
            <AuthInput icon="email-outline" value={email} onChangeText={v => { setEmail(v); setError(''); }} placeholder="you@email.com" keyboardType="email-address" autoCapitalize="none" />
            <AuthInput icon="lock-outline" value={password} onChangeText={v => { setPassword(v); setError(''); }} placeholder="Password" secureTextEntry={!showPw} rightIcon={showPw ? 'eye-off-outline' : 'eye-outline'} onRightPress={() => setShowPw(s => !s)} />
          </Animated.View>

          {/* Forgot password */}
          <TouchableOpacity onPress={onForgotPassword} style={s.forgotBtn}>
            <Text style={s.forgotText}>{t('auth.forgotPassword')}</Text>
          </TouchableOpacity>

          {/* Sign in button */}
          <TouchableOpacity style={[s.gradientBtn, (!canSubmit || loading) && s.btnDisabled]} onPress={handleLogin} disabled={!canSubmit || loading} activeOpacity={0.85}>
            <Text style={s.gradientBtnText}>{loading ? t('common.loading') : t('auth.signIn')}</Text>
            <MaterialCommunityIcons name="arrow-right" size={17} color="#1A0B12" />
          </TouchableOpacity>

          {/* Divider */}
          <View style={s.dividerRow}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>{t('auth.orContinueWith')}</Text>
            <View style={s.dividerLine} />
          </View>

          {/* Google button */}
          <TouchableOpacity style={s.googleBtn} onPress={handleGoogle} disabled={googleLoading} activeOpacity={0.8}>
            <Svg width="20" height="20" viewBox="0 0 24 24">
              <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </Svg>
            <Text style={s.googleBtnText}>{googleLoading ? 'Connecting…' : t('auth.googleSignIn')}</Text>
          </TouchableOpacity>

          {/* Passkey button */}
          <TouchableOpacity style={s.passkeyBtn} onPress={handlePasskey} disabled={loading} activeOpacity={0.8}>
            <MaterialCommunityIcons name="fingerprint" size={20} color={VIOLET} />
            <Text style={s.passkeyBtnText}>Sign in with Passkey</Text>
          </TouchableOpacity>

          {/* Switch to signup */}
          <TouchableOpacity onPress={onSwitchToSignup} style={{ paddingVertical: 14 }}>
            <Text style={s.switchText}>
              {t('auth.noAccount')} <Text style={s.switchLink}>{t('auth.signUp')}</Text>
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0812' },
  content: { flex: 1, paddingHorizontal: 28 },

  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  brand: { fontFamily: FONTS.heading, fontSize: 17, fontWeight: '700', color: COLORS.text },

  title: { fontFamily: FONTS.heading, fontSize: 28, fontWeight: '800', color: COLORS.text, marginTop: 4 },
  subtitle: { fontSize: 15, color: COLORS.text2, marginTop: 4, marginBottom: 20 },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, backgroundColor: 'rgba(255,77,106,0.1)', padding: 10, borderRadius: RADIUS.card },
  errorText: { color: COLORS.coral, fontSize: 13, fontWeight: '500', flex: 1 },

  forgotBtn: { alignItems: 'flex-end', marginTop: -4, marginBottom: 14 },
  forgotText: { color: COLORS.coral, fontSize: 14, fontWeight: '500' },

  gradientBtn: { backgroundColor: COLORS.coral, padding: 16, borderRadius: RADIUS.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: COLORS.coral, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 24, elevation: 8 },
  gradientBtnText: { color: '#1A0B12', fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 18 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  dividerText: { fontSize: 12, fontWeight: '500', color: COLORS.text2 },

  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    padding: 14, borderRadius: RADIUS.pill, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  googleBtnText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },

  passkeyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    padding: 14, borderRadius: RADIUS.pill, borderWidth: 1.5, borderColor: 'rgba(139,92,246,0.3)', backgroundColor: 'rgba(139,92,246,0.06)',
    marginTop: 10,
  },
  passkeyBtnText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },

  switchText: { textAlign: 'center', color: COLORS.text2, fontSize: 14 },
  switchLink: { color: COLORS.coral, fontWeight: '700', fontSize: 14 },

  orb: { position: 'absolute', borderRadius: 999 },
});
