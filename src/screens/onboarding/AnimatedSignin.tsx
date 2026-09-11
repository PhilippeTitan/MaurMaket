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
              <View style={s.providerIconWrap}>
                <Animated.View style={[s.providerIconRing, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
                  <LinearGradient colors={[C.violet, C.pink, C.amber, C.violet]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.providerIconRingFill} />
                </Animated.View>
                <View style={s.providerIconInner}>
                  <Svg width="28" height="28" viewBox="0 0 24 24">
                    <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </Svg>
                </View>
              </View>
              <Text style={s.providerText}>Google</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => {}} style={s.providerCard}>
              <View style={s.providerIconWrap}>
                <Animated.View style={[s.providerIconRing, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
                  <LinearGradient colors={[C.violet, C.pink, C.amber, C.violet]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.providerIconRingFill} />
                </Animated.View>
                <View style={s.providerIconInner}>
                  <Svg width="30" height="30" viewBox="0 0 48 48" fill="none">
                    <Path d="M10.0208 21V31C10.0208 31.5523 9.57305 32 9.02077 32C8.46848 32 8.02077 31.5523 8.02077 31V21C8.02077 12.7157 14.7365 6 23.0208 6H25.0208C28.1211 6 31.0832 6.94415 33.5756 8.67693C34.0291 8.99219 34.1411 9.61537 33.8258 10.0688C33.5106 10.5223 32.8874 10.6343 32.4339 10.3191C30.274 8.81739 27.7095 8 25.0208 8H23.0208C15.8411 8 10.0208 13.8203 10.0208 21ZM35.6728 13.5448C36.4702 14.6817 37.0805 15.9383 37.4793 17.2746C37.6373 17.8038 38.1944 18.1048 38.7236 17.9468C39.2528 17.7889 39.5538 17.2318 39.3958 16.7026C38.9352 15.1596 38.2305 13.7085 37.3103 12.3964C36.9932 11.9442 36.3695 11.8348 35.9174 12.1519C35.4652 12.469 35.3557 13.0926 35.6728 13.5448ZM39.0208 20C38.4685 20 38.0208 20.4477 38.0208 21V41C38.0208 41.5523 38.4685 42 39.0208 42C39.573 42 40.0208 41.5523 40.0208 41V21C40.0208 20.4477 39.573 20 39.0208 20ZM23.0208 14H25.0208C28.8865 14 32.0208 17.1343 32.0208 21V33C32.0208 37.5152 30.3941 40 27.0208 40C23.4947 40 22.0208 38.0184 22.0208 34V22C22.0208 20.8955 22.9158 20 24.0208 20C25.1257 20 26.0208 20.8955 26.0208 22V26.958C26.0208 27.5103 26.4685 27.958 27.0208 27.958C27.5731 27.958 28.0208 27.5103 28.0208 26.958V22C28.0208 19.7911 26.2305 18 24.0208 18C21.8111 18 20.0208 19.7911 20.0208 22V34C20.0208 39.0162 22.2401 42 27.0208 42C31.7205 42 34.0208 38.4862 34.0208 33V21C34.0208 16.0297 29.9911 12 25.0208 12H23.0208C22.4685 12 22.0208 12.4477 22.0208 13C22.0208 13.5523 22.4685 14 23.0208 14ZM19.4655 14.9671C17.6133 16.0635 16.3532 17.952 16.0781 20.1016C16.008 20.6494 15.507 21.0366 14.9592 20.9665C14.4114 20.8964 14.0241 20.3955 14.0943 19.8476C14.4483 17.0815 16.068 14.6541 18.4468 13.2461C18.9221 12.9647 19.5354 13.122 19.8167 13.5972C20.098 14.0725 19.9408 14.6858 19.4655 14.9671ZM16.0208 41V23.992C16.0208 23.4397 15.5731 22.992 15.0208 22.992C14.4685 22.992 14.0208 23.4397 14.0208 23.992V41C14.0208 41.5523 14.4685 42 15.0208 42C15.5731 42 16.0208 41.5523 16.0208 41ZM25.9524 31.0254V34.9794C25.9524 35.5317 26.4001 35.9794 26.9524 35.9794C27.5047 35.9794 27.9524 35.5317 27.9524 34.9794V31.0254C27.9524 30.4731 27.5047 30.0254 26.9524 30.0254C26.4001 30.0254 25.9524 30.4731 25.9524 31.0254ZM10.0004 36.995V41.043C10.0004 41.5953 9.55265 42.043 9.00037 42.043C8.44808 42.043 8.00037 41.5953 8.00037 41.043V36.995C8.00037 36.4427 8.44808 35.995 9.00037 35.995C9.55265 35.995 10.0004 36.4427 10.0004 36.995Z" fill={C.violet} fillRule="evenodd" />
                  </Svg>
                </View>
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
  logoRingOuter: { width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center', padding: 3 },
  logoRingGradient: { width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center' },
  logoRingGradientInner: { width: 112, height: 112, borderRadius: 56 },
  logoImageContainer: { position: 'absolute', width: 106, height: 106, borderRadius: 53, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1040' },
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
  providerIconWrap: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center' },
  providerIconRing: { width: 68, height: 68, borderRadius: 34, position: 'absolute' },
  providerIconRingFill: { width: 68, height: 68, borderRadius: 34 },
  providerIconInner: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1040' },
  providerText: { color: C.text, fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 6 },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#1A0B12' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { fontSize: 12, fontWeight: '500', color: C.faint },
});
