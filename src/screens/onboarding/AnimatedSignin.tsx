import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Animated,
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
import GoogleButton from './components/GoogleButton';
import PasskeyButton from './components/PasskeyButton';
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
      <Svg width="160" height="150" viewBox="0 0 160 150" fill="none">
        <Defs>
          <SvgLinearGradient id="shieldG" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={C.violet} />
            <Stop offset="100%" stopColor={C.pink} />
          </SvgLinearGradient>
        </Defs>
        <Circle cx="80" cy="75" r="60" fill={C.surface} stroke={C.border} />
        <SvgG>
          <Path d="M80 30L110 45v20c0 22-12 36-30 42-18-6-30-20-30-42V45L80 30Z" fill="url(#shieldG)" opacity="0.9" />
          <Path d="M68 72l8 8 16-18" stroke={C.mint} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </SvgG>
      </Svg>
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
        <MaterialCommunityIcons name="arrow-right" size={17} color={disabled ? C.faint : '#1A0B12'} />
      </LinearGradient>
    </TouchableOpacity>
  );
}

function BackgroundAtmosphere({ drift }: { drift: Animated.Value }) {
  const d1 = drift.interpolate({ inputRange: [0, 1], outputRange: [0, 18] });
  const d2 = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -22] });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[s.orb, { top: -60, left: -50, width: 260, height: 260, backgroundColor: C.violet + '55', transform: [{ translateX: d1 }, { translateY: d2 }] }]} />
      <Animated.View style={[s.orb, { bottom: -70, right: -60, width: 280, height: 280, backgroundColor: C.pink + '4d', transform: [{ translateX: d2 }, { translateY: d1 }] }]} />
      <Animated.View style={[s.orb, { top: '38%', right: -40, width: 160, height: 160, backgroundColor: C.amber + '33', transform: [{ translateX: d1 }] }]} />
    </View>
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
  const [error, setError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);

  // Animations
  const drift = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(drift, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(drift, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
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

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg0 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, backgroundColor: C.bg0 }}>
        <BackgroundAtmosphere drift={drift} />

        <View style={[s.content, { paddingTop: insets.top + 40, paddingHorizontal: 28, paddingBottom: insets.bottom + 16 }]}>

          {/* Logo */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <Logomark size={34} />
            <Text style={{ fontFamily: FONTS.heading, fontSize: 17, fontWeight: '700', color: C.text }}>MaurMaket</Text>
          </View>

          {/* Illustration */}
          <SigninIllustration />

          {/* Title */}
          <Text style={s.heroTitle}>Welcome back</Text>
          <Text style={s.heroSub}>Sign in to continue</Text>

          {/* Error */}
          {error ? (
            <View style={s.errorRow}>
              <MaterialCommunityIcons name="alert-circle-outline" size={14} color={C.pink} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Fields */}
          <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
            <Field icon="email-outline" label="Email address" value={email} onChangeText={v => { setEmail(v); setError(''); }} placeholder="you@email.com" />
            <View style={{ height: 12 }} />
            <Field icon="lock-outline" label="Password" value={password} onChangeText={v => { setPassword(v); setError(''); }} placeholder="••••••••" secureTextEntry={!showPw} right={
              <TouchableOpacity onPress={() => setShowPw(s => !s)}>
                <MaterialCommunityIcons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={17} color={C.faint} />
              </TouchableOpacity>
            } />
          </Animated.View>

          {/* Forgot password */}
          <TouchableOpacity onPress={onForgotPassword} style={{ alignSelf: 'flex-end', marginTop: 8, marginBottom: 20 }}>
            <Text style={{ color: C.pink, fontSize: 13, fontWeight: '500' }}>{t('auth.forgotPassword')}</Text>
          </TouchableOpacity>

          {/* Sign in button */}
          <PrimaryButton onPress={handleLogin} disabled={!canSubmit || loading}>{loading ? t('common.loading') : t('auth.signIn')}</PrimaryButton>

          {/* Google + Passkey */}
          <View style={{ gap: 12, marginTop: 20 }}>
            <GoogleButton onPress={handleGoogle} loading={googleLoading} label={t('auth.googleSignIn')} />
            <PasskeyButton />
          </View>

          {/* Switch to signup */}
          <TouchableOpacity onPress={onSwitchToSignup} style={{ paddingVertical: 16 }}>
            <Text style={{ textAlign: 'center', color: C.sub, fontSize: 14, fontWeight: '500' }}>
              {t('auth.noAccount')} <Text style={{ color: C.pink, fontWeight: '700' }}>{t('auth.signUp')}</Text>
            </Text>
          </TouchableOpacity>

        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/* ── Styles ───────────────────────────────────────────────── */

const s = StyleSheet.create({
  content: { flex: 1 },
  orb: { position: 'absolute', borderRadius: 999 },

  heroTitle: { fontFamily: FONTS.heading, fontSize: 30, fontWeight: '800', color: C.text, marginTop: 12 },
  heroSub: { fontSize: 14, color: C.sub, marginTop: 6, lineHeight: 20 },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, backgroundColor: C.pink + '12', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: C.pink + '30' },
  errorText: { color: C.pink, fontSize: 13, fontWeight: '500', flex: 1 },

  field: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 58, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16 },
  fieldLabel: { fontSize: 11, fontWeight: '500', color: C.faint },
  fieldInput: { backgroundColor: 'transparent', borderWidth: 0, color: C.text, fontSize: 14, fontWeight: '500' as const, padding: 0 },

  primaryBtn: { height: 52, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#1A0B12' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { fontSize: 12, fontWeight: '500', color: C.faint },
});
