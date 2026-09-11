import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, Modal,
  Easing, Platform, KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle, Rect, Path, Defs, LinearGradient as SvgLinearGradient, Stop, G as SvgG } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, RADIUS, FONTS } from '../../theme';
import { useTranslation } from '../../i18n';
import { login as apiLogin, googleAuth } from '../../api';
import { store } from '../../store';
import OnboardingBackground from './components/OnboardingBackground';
import type { User } from '../../types';

const C = {
  bg0: '#0A0812',
  bg1: '#120E1F',
  surface: 'rgba(255,255,255,0.045)',
  surfaceHi: 'rgba(255,255,255,0.08)',
  border: 'rgba(255,255,255,0.10)',
  borderHi: 'rgba(255,255,255,0.20)',
  text: '#F4F1FB',
  sub: '#9791AF',
  faint: '#615C79',
  violet: '#8B5CF6',
  pink: '#EC4899',
  amber: '#FB923C',
  mint: '#2FE6B8',
};

/* ── SVG Illustrations ────────────────────────────────────── */

function Logomark({ size = 40 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.28, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', shadowColor: C.pink, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.55, shadowRadius: 20, elevation: 8 }}>
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <Defs>
          <SvgLinearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={C.violet} />
            <Stop offset="55%" stopColor={C.pink} />
            <Stop offset="100%" stopColor={C.amber} />
          </SvgLinearGradient>
        </Defs>
        <Rect width="40" height="40" rx="11" fill="url(#logoGrad)" />
        <Path d="M10 28L18 8L22 20L32 8" stroke="#160817" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    </View>
  );
}

function SigninIllustration() {
  return (
    <View style={{ height: 150, alignItems: 'center', justifyContent: 'center' }}>
      <Logomark size={64} />
    </View>
  );
}

/* ── Shared UI ────────────────────────────────────────────── */

function Field({ icon, label, value, onChangeText, placeholder, secureTextEntry, right }: {
  icon: any; label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; secureTextEntry?: boolean; right?: React.ReactNode;
}) {
  return (
    <View style={s.field}>
      <MaterialCommunityIcons name={icon} size={18} color={C.faint} />
      <View style={{ flex: 1 }}>
        <Text style={s.fieldLabel}>{label}</Text>
        <TextInput style={s.fieldInput} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={C.faint} secureTextEntry={secureTextEntry} />
      </View>
      {right}
    </View>
  );
}

function PrimaryButton({ children, onPress, disabled }: { children: React.ReactNode; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.85} style={{ opacity: disabled ? 0.7 : 1 }}>
      <LinearGradient
        colors={disabled ? ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.08)'] : [C.violet, C.pink, C.amber]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={s.primaryBtn}
      >
        <Text style={[s.primaryBtnText, disabled && { color: C.faint }]}>{children}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

/* ── Main Component ───────────────────────────────────────── */

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
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Animations
  const fadeIn = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
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
    setLoading(true);
    try {
      const res = await apiLogin(email.trim(), password) as { user: User; token: string };
      await store.setUser(res.user, res.token);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Invalid email or password');
      triggerShake();
    } finally { setLoading(false); }
  };

  const handleGoogle = async () => {
    try {
      setGoogleLoading(true);
      const res = await googleAuth() as { user: User; token: string };
      await store.setUser(res.user, res.token);
    } catch (err: any) { setErrorMessage(err?.message || 'Google sign-in failed'); }
    finally { setGoogleLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg0 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, backgroundColor: '#120E1F' }}>
        <OnboardingBackground />

        <View style={s.content}>

          {/* Logo mark only, matching the screenshot's centered icon stack */}
          <View style={s.logoCenter}>
            <Logomark size={56} />
          </View>

          {/* Title */}
          <Text style={s.heroTitle}>Welcome back</Text>
          <Text style={s.heroSub}>Sign in to continue to MaurMaket.</Text>

          {/* Fields */}
          <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
            <Field icon="email-outline" label="Email address" value={email} onChangeText={setEmail} placeholder="you@email.com" />
            <View style={{ height: 12 }} />
            <Field icon="lock-outline" label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry={!showPw} right={
              <TouchableOpacity onPress={() => setShowPw(s => !s)}>
                <MaterialCommunityIcons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={17} color={C.faint} />
              </TouchableOpacity>
            } />
          </Animated.View>

          {/* Forgot password */}
          <TouchableOpacity onPress={onForgotPassword} style={{ alignSelf: 'center', marginTop: 12, marginBottom: 16 }}>
            <Text style={{ color: C.sub, fontSize: 13, fontWeight: '500' }}>{t('auth.forgotPassword')}</Text>
          </TouchableOpacity>

          {/* Sign in button */}
          <PrimaryButton onPress={handleLogin} disabled={!canSubmit || loading}>{loading ? t('common.loading') : 'Sign in →'}</PrimaryButton>

          {/* Separator: Or row */}
          <View style={s.separatorRow}>
            <View style={s.separatorLine} />
            <Text style={s.separatorText}>or</Text>
            <View style={s.separatorLine} />
          </View>

          {/* Google + Passkey */}
          <View style={s.providerRow}>
            <TouchableOpacity onPress={handleGoogle} style={s.providerCard}>
              <View style={s.providerIcon}><Text style={s.providerIconText}>G</Text></View>
              <Text style={s.providerText}>
                <Text>Sign in with</Text>
                <Text>{'\n'}Google</Text>
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => {}} style={s.providerCard}>
              <View style={s.providerIcon}><MaterialCommunityIcons name="account-circle-outline" size={24} color={C.text} /></View>
              <Text style={s.providerText}>
                <Text>Sign in with</Text>
                <Text>{'\n'}Passkey</Text>
              </Text>
            </TouchableOpacity>
          </View>

          {/* Switch to signup */}
          <TouchableOpacity onPress={onSwitchToSignup} style={{ paddingVertical: 16 }}>
            <Text style={{ textAlign: 'center', color: C.sub, fontSize: 16, fontWeight: '500' }}>
              {t('auth.noAccount')} <Text style={{ color: C.pink, fontWeight: '700' }}>{t('auth.signUp')}</Text>
            </Text>
          </TouchableOpacity>

        </View>
      </View>
      <Modal visible={!!errorMessage} transparent animationType="fade" onRequestClose={() => setErrorMessage(null)}>
        <View style={s.errorBackdrop}>
          <View style={s.errorCard}>
            <View style={s.errorIconRing}>
              <MaterialCommunityIcons name="shield-alert-outline" size={30} color={C.pink} />
            </View>
            <Text style={s.errorTitle}>Couldn&apos;t sign you in</Text>
            <Text style={s.errorMessage}>
              {errorMessage === 'Invalid email or password' ? 'The email or password is incorrect. Check your details and try again.' : errorMessage}
            </Text>
            <TouchableOpacity style={s.errorButton} onPress={() => setErrorMessage(null)} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Try again">
              <LinearGradient colors={[C.violet, C.pink, C.amber]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.errorButtonGradient}>
                <Text style={s.errorButtonText}>Try again</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

/* ── Styles ───────────────────────────────────────────────── */

const s = StyleSheet.create({
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, maxWidth: 400, alignSelf: 'center', width: '100%' },
  logoCenter: { alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  heroTitle: { fontFamily: FONTS.heading, fontSize: 34, fontWeight: '800', color: C.text, textAlign: 'center', marginTop: 4 },
  heroSub: { fontSize: 15, color: C.sub, marginTop: 8, lineHeight: 22, textAlign: 'center' },

  errorBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, backgroundColor: 'rgba(3, 2, 8, 0.76)' },
  errorCard: { width: '100%', maxWidth: 360, alignItems: 'center', padding: 24, borderRadius: 24, backgroundColor: 'rgba(18, 14, 31, 0.98)', borderWidth: 1, borderColor: 'rgba(236, 72, 153, 0.42)', shadowColor: C.pink, shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  errorIconRing: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(236, 72, 153, 0.14)', borderWidth: 1, borderColor: 'rgba(236, 72, 153, 0.34)', marginBottom: 16 },
  errorTitle: { color: C.text, fontFamily: FONTS.heading, fontSize: 21, fontWeight: '800', textAlign: 'center' },
  errorMessage: { color: C.sub, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  errorButton: { width: '100%', marginTop: 22 },
  errorButtonGradient: { height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  errorButtonText: { color: '#1A0B12', fontSize: 15, fontWeight: '800' },

  field: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 58, borderRadius: 16, backgroundColor: 'rgba(13, 10, 27, 0.9)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)', paddingHorizontal: 16 },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: C.sub },
  fieldInput: { backgroundColor: 'transparent', borderWidth: 0, color: C.text, fontSize: 14, fontWeight: '500' as const, padding: 0 },

  primaryBtn: { height: 52, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  separatorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, marginBottom: 16 },
  separatorLine: { flex: 1, height: 1, backgroundColor: 'rgba(221,232,255,0.24)' },
  separatorText: { color: C.sub, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  providerRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 3 },
  providerCard: { width: 150, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', borderRadius: 20, paddingVertical: 16 },
  providerIcon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(139,92,246,0.24)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)', marginBottom: 10 },
  providerIconText: { color: C.text, fontFamily: FONTS.heading, fontSize: 28, fontWeight: '800' },
  providerText: { color: C.text, fontSize: 14, fontWeight: '700', textAlign: 'center', lineHeight: 18 },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#1A0B12' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { fontSize: 12, fontWeight: '500', color: C.faint },
});
