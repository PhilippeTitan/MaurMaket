import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, Modal, Image,
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
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    Animated.loop(Animated.timing(spin, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true })).start();
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

          {/* Logo with animated gradient ring */}
          <View style={s.logoCenter}>
            <View style={s.logoRingOuter}>
              <Animated.View style={[s.logoRingGradient, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
                <LinearGradient
                  colors={[C.violet, C.pink, C.amber, C.violet]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={s.logoRingGradientInner}
                />
              </Animated.View>
            </View>
            <View style={s.logoImageContainer}>
              <Image source={require('../../../assets/Logo/maurmaket-logo-icon.png')} style={{ width: 96, height: 96, resizeMode: 'contain' }} />
            </View>
          </View>

          {/* Title */}
          <Text style={s.heroTitle}>Welcome{'\n'}<Text style={s.heroAccent}>back.</Text></Text>
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
              <View style={s.providerIconOuter}>
                <Animated.View style={[s.providerIconRing, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
                  <LinearGradient colors={[C.violet, C.pink, C.amber, C.violet]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.providerIconRingInner} />
                </Animated.View>
              </View>
              <View style={s.providerIconInner}>
                <Svg width="28" height="28" viewBox="0 0 24 24">
                  <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </Svg>
              </View>
              <Text style={s.providerText}>Google</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => {}} style={s.providerCard}>
              <View style={s.providerIconOuter}>
                <Animated.View style={[s.providerIconRing, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
                  <LinearGradient colors={[C.violet, C.pink, C.amber, C.violet]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.providerIconRingInner} />
                </Animated.View>
              </View>
              <View style={s.providerIconInner}>
                <Svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <Path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" stroke={C.violet} strokeWidth="1.5" fill="none"/>
                  <Path d="M15 9.5C15 10.88 13.88 12 12.5 12H11.5C10.12 12 9 10.88 9 9.5S10.12 7 11.5 7h1C13.88 7 15 8.12 15 9.5z" fill={C.violet}/>
                  <Path d="M8 18.5c0-2.21 1.79-4 4-4h0c2.21 0 4 1.79 4 4" stroke={C.violet} strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                </Svg>
              </View>
              <Text style={s.providerText}>Passkey</Text>
            </TouchableOpacity>
          </View>

          {/* Switch to signup */}
          <TouchableOpacity onPress={onSwitchToSignup} style={{ paddingVertical: 14 }}>
            <Text style={{ textAlign: 'center', color: C.sub, fontSize: 14, fontWeight: '500' }}>
              New here? <Text style={{ color: C.pink, fontWeight: '700' }}>Create an account →</Text>
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
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  logoCenter: { alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  logoRingOuter: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center', padding: 3 },
  logoRingGradient: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center' },
  logoRingGradientInner: { width: 120, height: 120, borderRadius: 60 },
  logoImageContainer: { position: 'absolute', width: 108, height: 108, borderRadius: 54, alignItems: 'center', justifyContent: 'center', backgroundColor: '#120E1F' },
  heroTitle: { fontFamily: FONTS.heading, fontSize: 34, fontWeight: '800', color: C.text, textAlign: 'center', marginTop: 4 },
  heroAccent: { color: C.pink },
  heroSub: { fontSize: 15, color: C.sub, marginTop: 8, lineHeight: 22, textAlign: 'center' },

  errorBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, backgroundColor: 'rgba(3, 2, 8, 0.76)' },
  errorCard: { width: '100%', maxWidth: 360, alignItems: 'center', padding: 24, borderRadius: 24, backgroundColor: 'rgba(18, 14, 31, 0.98)', borderWidth: 1, borderColor: 'rgba(236, 72, 153, 0.42)', shadowColor: C.pink, shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  errorIconRing: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(236, 72, 153, 0.14)', borderWidth: 1, borderColor: 'rgba(236, 72, 153, 0.34)', marginBottom: 16 },
  errorTitle: { color: C.text, fontFamily: FONTS.heading, fontSize: 21, fontWeight: '800', textAlign: 'center' },
  errorMessage: { color: C.sub, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  errorButton: { width: '100%', marginTop: 22 },
  errorButtonGradient: { height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  errorButtonText: { color: '#1A0B12', fontSize: 15, fontWeight: '800' },

  field: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 58, borderRadius: 16, backgroundColor: 'rgba(13, 10, 27, 0.9)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)', paddingHorizontal: 16, alignSelf: 'stretch' },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: C.sub },
  fieldInput: { backgroundColor: 'transparent', borderWidth: 0, color: C.text, fontSize: 14, fontWeight: '500' as const, padding: 0 },

  primaryBtn: { height: 52, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'stretch' },
  separatorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, marginBottom: 16 },
  separatorLine: { flex: 1, height: 1, backgroundColor: 'rgba(221,232,255,0.24)' },
  separatorText: { color: C.sub, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  providerRow: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 3 },
  providerCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  providerIconOuter: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', padding: 3 },
  providerIconRing: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  providerIconRingInner: { width: 72, height: 72, borderRadius: 36 },
  providerIconInner: { position: 'absolute', width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#120E1F' },
  providerText: { color: C.text, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#1A0B12' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { fontSize: 12, fontWeight: '500', color: C.faint },
});
