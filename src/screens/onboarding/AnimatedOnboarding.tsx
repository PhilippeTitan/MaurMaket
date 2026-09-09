import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Animated,
  Easing, ScrollView, Platform, KeyboardAvoidingView, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle, Rect, Path, Defs, LinearGradient as SvgLinearGradient, Stop, Ellipse, G as SvgG } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, RADIUS, FONTS } from '../../theme';
import { useTranslation } from '../../i18n';
import { signup as apiSignup, googleAuth, API_BASE } from '../../api';
import { store } from '../../store';
import AuthInput from './components/AuthInput';
import GoogleButton from './components/GoogleButton';
import PasskeyButton from './components/PasskeyButton';
import AuthMethodsCard from '../../components/AuthMethodsCard';
import type { User } from '../../types';

const { width: SCREEN_W } = Dimensions.get('window');

const C = {
  bg0: '#0A0812',
  bg1: '#120E1F',
  surface: '#151326',
  surfaceHi: '#211D38',
  border: '#302B4B',
  borderHi: '#514A73',
  text: '#F4F1FB',
  sub: '#C1BAD8',
  faint: '#8F88AA',
  violet: '#8B5CF6',
  pink: '#EC4899',
  amber: '#FB923C',
  mint: '#2FE6B8',
};

const STEPS = ['name', 'email', 'purpose', 'password', 'review'] as const;
type Step = typeof STEPS[number];
const STEP_MAX = 5;
const STEP_LABELS: Record<Step, string> = {
  name: 'About you', email: 'Contact', purpose: 'Purpose', password: 'Security', review: 'Review',
};

const PURPOSES = [
  { id: 'buy', title: 'Discover & buy', desc: 'Find products from sellers around you', icon: 'shopping-outline' as const },
  { id: 'sell', title: 'Build a store', desc: 'Sell products and grow your audience', icon: 'store-outline' as const },
  { id: 'both', title: 'A little of both', desc: 'Buy, sell, and explore freely', icon: 'swap-horizontal' as const },
];

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

function SplashIllustration({ spin }: { spin: Animated.Value }) {
  const rotation = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <View style={{ width: 200, height: 200, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', transform: [{ rotate: rotation }] }}>
        <Svg width="200" height="200" viewBox="0 0 200 200">
          <Defs>
            <SvgLinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor={C.violet} />
              <Stop offset="100%" stopColor={C.amber} />
            </SvgLinearGradient>
          </Defs>
          <Circle cx="100" cy="100" r="86" stroke="url(#ringGrad)" strokeWidth="1.2" strokeDasharray="4 10" fill="none" />
        </Svg>
      </Animated.View>
      <Logomark size={92} />
      <View style={{ position: 'absolute', top: 18, right: 12, width: 10, height: 10, borderRadius: 4, backgroundColor: C.amber }} />
      <View style={{ position: 'absolute', bottom: 22, left: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: C.mint }} />
    </View>
  );
}

function WelcomeIllustration() {
  return (
    <View style={{ height: 180, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width="220" height="180" viewBox="0 0 220 180" fill="none">
        <Defs>
          <SvgLinearGradient id="bagG" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={C.violet} />
            <Stop offset="100%" stopColor={C.pink} />
          </SvgLinearGradient>
          <SvgLinearGradient id="tagG" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={C.pink} />
            <Stop offset="100%" stopColor={C.amber} />
          </SvgLinearGradient>
        </Defs>
        <Ellipse cx="110" cy="150" rx="70" ry="9" fill="#000" opacity="0.28" />
        <SvgG>
          <Rect x="128" y="46" width="44" height="34" rx="7" fill="url(#tagG)" opacity="0.92" transform="rotate(14 150 63)" />
        </SvgG>
        <SvgG>
          <Path d="M78 78h64a8 8 0 0 1 8 8v52a8 8 0 0 1-8 8H78a8 8 0 0 1-8-8V86a8 8 0 0 1 8-8Z" fill="url(#bagG)" />
          <Path d="M92 78v-8a18 18 0 0 1 36 0v8" stroke={C.text} strokeWidth="4.5" fill="none" strokeLinecap="round" />
          <Path d="M90 106c6 8 24 8 30 0" stroke="#1A0B12" strokeWidth="3.4" strokeLinecap="round" fill="none" opacity="0.55" />
        </SvgG>
        <SvgG>
          <Rect x="42" y="44" width="30" height="30" rx="8" fill={C.bg1} stroke={C.borderHi} strokeWidth="1.5" transform="rotate(-10 57 59)" />
          <Path d="M50 60l5 5 9-11" stroke={C.mint} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" transform="rotate(-10 57 59)" />
        </SvgG>
      </Svg>
    </View>
  );
}

function NameIllustration() {
  return (
    <View style={{ height: 130, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width="180" height="120" viewBox="0 0 180 120" fill="none">
        <Defs>
          <SvgLinearGradient id="faceG" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={C.violet} />
            <Stop offset="100%" stopColor={C.pink} />
          </SvgLinearGradient>
        </Defs>
        <Circle cx="90" cy="42" r="26" fill="none" stroke={C.borderHi} strokeWidth="1.4" />
        <Circle cx="90" cy="42" r="26" stroke="url(#faceG)" strokeWidth="2.2" strokeDasharray="164" strokeDashoffset="0" />
        <Circle cx="90" cy="36" r="8" fill={C.surfaceHi} stroke={C.borderHi} />
        <Path d="M72 58c4-9 32-9 36 0" stroke={C.borderHi} strokeWidth="2" fill="none" strokeLinecap="round" />
        <Path d="M20 100c26-14 114-14 140 0" stroke={C.faint} strokeWidth="1.6" strokeDasharray="2 7" fill="none" strokeLinecap="round" />
      </Svg>
    </View>
  );
}

function ContactIllustration() {
  return (
    <View style={{ height: 150, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width="200" height="150" viewBox="0 0 200 150" fill="none">
        <Defs>
          <SvgLinearGradient id="envG" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={C.violet} />
            <Stop offset="100%" stopColor={C.pink} />
          </SvgLinearGradient>
        </Defs>
        <Circle cx="100" cy="72" r="58" stroke={C.border} strokeWidth="1" fill="none" strokeDasharray="1 7" />
        <SvgG>
          <Rect x="58" y="46" width="84" height="56" rx="9" fill="url(#envG)" />
          <Path d="M58 52l42 30 42-30" stroke="#1A0B12" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
        </SvgG>
        <SvgG>
          <Path d="M138 96l30-10-9 29-7-11-14 8 0-16z" fill={C.amber} />
        </SvgG>
      </Svg>
    </View>
  );
}

function SecurityIllustration({ matched }: { matched: boolean }) {
  return (
    <View style={{ height: 150, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width="150" height="150" viewBox="0 0 150 150" fill="none">
        <Defs>
          <SvgLinearGradient id="lockG" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={matched ? C.mint : C.violet} />
            <Stop offset="100%" stopColor={matched ? C.mint : C.pink} />
          </SvgLinearGradient>
        </Defs>
        <Circle cx="75" cy="75" r="60" fill={C.surface} stroke={C.border} />
        <Rect x="50" y="72" width="50" height="38" rx="9" fill="url(#lockG)" />
        <Path d="M58 72V58a17 17 0 0 1 34 0v14" stroke={matched ? C.mint : C.borderHi} strokeWidth="5" fill="none" strokeLinecap="round" />
        <Circle cx="75" cy="88" r="4.2" fill="#1A0B12" />
        <Rect x="73" y="90" width="4" height="9" rx="2" fill="#1A0B12" />
      </Svg>
    </View>
  );
}

function ReviewIllustration({ items }: { items: boolean[] }) {
  return (
    <View style={{ height: 140, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width="170" height="140" viewBox="0 0 170 140" fill="none">
        <Rect x="35" y="10" width="100" height="120" rx="14" fill={C.surface} stroke={C.border} />
        <Rect x="60" y="2" width="50" height="18" rx="6" fill={C.borderHi} />
        {items.map((done, i) => (
          <SvgG key={i} opacity={done ? 1 : 0.35}>
            <Circle cx="55" cy={42 + i * 22} r="7" fill={done ? C.mint : 'transparent'} stroke={done ? C.mint : C.faint} strokeWidth="1.4" />
            {done && <Path d={`M51.5 ${42 + i * 22}l2.5 2.5 5-5`} stroke="#0A0812" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
            <Rect x="70" y={38 + i * 22} width="52" height="7" rx="3.5" fill={C.faint} opacity="0.5" />
          </SvgG>
        ))}
      </Svg>
    </View>
  );
}

function SuccessIllustration({ pulse }: { pulse: Animated.Value }) {
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const opacity = pulse.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] });
  return (
    <View style={{ height: 210, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {[0, 1, 2].map(i => (
        <View key={i} style={[StyleSheet.absoluteFill, { borderRadius: 999, borderWidth: 1.4, borderColor: C.mint, opacity: 0.3 }]} />
      ))}
      <Animated.View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: '#123B31', alignItems: 'center', justifyContent: 'center', transform: [{ scale }], opacity }}>
        <Svg width="46" height="46" viewBox="0 0 46 46" fill="none">
          <Path d="M11 24l8 8 16-18" stroke={C.mint} strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Animated.View>
    </View>
  );
}

/* ── Shared UI ────────────────────────────────────────────── */

function StepBadge({ step, total, label }: { step: number; total: number; label: string }) {
  const width = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(width, { toValue: step / total, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [step, total]);
  return (
    <View style={{ marginBottom: 20, marginTop: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ color: C.sub, fontSize: 12, fontWeight: '500' }}>Step {step} of {total}</Text>
        <Text style={{ color: C.faint, fontSize: 12, fontWeight: '500' }}>{label}</Text>
      </View>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: C.surface, overflow: 'hidden' }}>
        <Animated.View style={{ height: '100%', borderRadius: 2, width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }}>
          <LinearGradient colors={[C.violet, C.pink, C.amber]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1, borderRadius: 2 }} />
        </Animated.View>
      </View>
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

function StepActions({ children, step, label, onBack }: { children: React.ReactNode; step: number; label: string; onBack: () => void }) {
  return (
    <View style={s.actions}>
      <StepBadge step={step} total={STEP_MAX} label={label} />
      {children}
      <TouchableOpacity onPress={onBack} style={s.backAction} accessibilityRole="button" accessibilityLabel="Go back">
        <MaterialCommunityIcons name="arrow-left" size={18} color={C.sub} />
        <Text style={s.backActionText}>Back</Text>
      </TouchableOpacity>
    </View>
  );
}

function Field({ icon, label, value, onChangeText, placeholder, secureTextEntry, right }: {
  icon: any; label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; secureTextEntry?: boolean; right?: React.ReactNode;
}) {
  return (
    <View style={s.field}>
      <MaterialCommunityIcons name={icon} size={18} color={C.sub} />
      <View style={{ flex: 1 }}>
        <Text style={s.fieldLabel}>{label}</Text>
        <TextInput style={s.fieldInput} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={C.sub} secureTextEntry={secureTextEntry} />
      </View>
      {right}
    </View>
  );
}

/* ── Background Atmosphere ────────────────────────────────── */

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
  onSwitchToSignin: () => void;
}

export default function AnimatedOnboarding({ onSwitchToSignin }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [form, setForm] = useState({ first: '', last: '', email: '', purpose: '', pw: '', pw2: '' });
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [userResult, setUserResult] = useState<{ user: User; token: string } | null>(null);
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const [emailChecking, setEmailChecking] = useState(false);
  const emailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [splashReady, setSplashReady] = useState(false);

  // Animations
  const drift = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const enterAnim = useRef(new Animated.Value(0)).current;

  // Continuous animations
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(drift, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(drift, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.timing(spin, { toValue: 1, duration: 22000, easing: Easing.linear, useNativeDriver: true })).start();
    Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(float, { toValue: 0, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true })).start();
  }, []);

  // Splash auto-advance
  useEffect(() => {
    if (index === 0) {
      setSplashReady(false);
      const t = setTimeout(() => setSplashReady(true), 1400);
      return () => clearTimeout(t);
    }
  }, [index]);

  // Step enter animation
  useEffect(() => {
    enterAnim.setValue(0);
    Animated.timing(enterAnim, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [index]);

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const stepIdx = index - 2;
  const step: Step | null = stepIdx >= 0 && stepIdx < STEPS.length ? STEPS[stepIdx] : null;

  const pwLen = form.pw.length;
  const pwOk = pwLen >= 6 && pwLen <= 128;
  const pwScore = pwLen === 0 ? 0 : pwLen < 6 ? 1 : pwLen < 10 ? 2 : 3;
  const pwMatched = pwOk && form.pw === form.pw2;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);

  const reviewItems = [
    !!(form.first && form.last),
    emailValid,
    !!form.purpose,
    pwMatched,
  ];

  // Email availability check
  useEffect(() => {
    if (emailTimer.current) clearTimeout(emailTimer.current);
    if (emailValid && form.email.length > 5) {
      emailTimer.current = setTimeout(async () => {
        setEmailChecking(true);
        try {
          const res = await fetch(`${API_BASE}/auth/check-email?email=${encodeURIComponent(form.email)}`);
          const data = await res.json();
          setEmailAvailable(data.available);
          if (!data.available) setErrors(p => ({ ...p, email: 'This email is already registered' }));
          else setErrors(p => { const n = { ...p }; delete n.email; return n; });
        } catch { setEmailAvailable(null); }
        setEmailChecking(false);
      }, 500);
    } else { setEmailAvailable(null); }
    return () => { if (emailTimer.current) clearTimeout(emailTimer.current); };
  }, [form.email, emailValid]);

  const go = (delta: number) => {
    setDir(delta);
    setErrors({});
    setIndex(i => Math.min(Math.max(i + delta, 0), 7));
  };

  const validateAndNext = () => {
    if (step === 'name' && (!form.first.trim() || !form.last.trim())) { setErrors({ name: "First and last name are needed" }); return; }
    if (step === 'email') {
      if (!emailValid) { setErrors({ email: "That doesn't look like a full email" }); return; }
      if (emailAvailable === false) { setErrors({ email: 'This email is already registered' }); return; }
    }
    if (step === 'purpose' && !form.purpose) return;
    if (step === 'password' && !pwMatched) return;
    if (step === 'review') { submitSignup(); return; }
    go(1);
  };

  const submitSignup = async () => {
    setLoading(true); setErrors({});
    const fullName = [form.first, form.last].filter(Boolean).join(' ').trim();
    try {
      const res = await apiSignup(fullName, form.email, form.pw, '') as { user: User; token: string };
      setUserResult(res);
      go(1); // → success screen
    } catch (err: any) {
      setErrors({ email: err?.message || 'Signup failed' });
      setIndex(3); // → email step
    } finally { setLoading(false); }
  };

  const handleEnterApp = async () => { if (userResult) await store.setUser(userResult.user, userResult.token); };

  const enterClass = dir >= 0 ? { opacity: enterAnim, transform: [{ translateX: enterAnim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }] }
    : { opacity: enterAnim, transform: [{ translateX: enterAnim.interpolate({ inputRange: [0, 1], outputRange: [-28, 0] }) }] };

  const canContinue =
    (step === 'name' && !(!form.first.trim() || !form.last.trim())) ||
    (step === 'email' && emailValid && emailAvailable !== false) ||
    (step === 'purpose' && !!form.purpose) ||
    (step === 'password' && pwMatched) ||
    (step === 'review');

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg0 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, backgroundColor: C.bg0 }}>
        <BackgroundAtmosphere drift={drift} />

        <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">

          <Animated.View style={[s.slide, enterClass]} key={index}>

            {/* SCREEN 0 — SPLASH */}
            {index === 0 && (
              <View style={s.screenCenter}>
                <SplashIllustration spin={spin} />
                <Text style={s.splashBrand}>MaurMaket</Text>
                <Text style={s.splashSub}>{splashReady ? "Everything's set. Let's go." : "Warming up your marketplace…"}</Text>
                <View style={s.dotsRow}>
                  {[0, 1, 2].map(d => (
                    <Animated.View key={d} style={[s.dot, { opacity: pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.4, 1, 0.4] }) }]} />
                  ))}
                </View>
                {splashReady && (
                  <TouchableOpacity onPress={() => go(1)} style={{ marginTop: 20 }}>
                    <Text style={{ color: C.sub, fontSize: 14, fontWeight: '500' }}>Tap to continue</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* SCREEN 1 — WELCOME */}
            {index === 1 && (
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8, paddingBottom: 24 }}>
                  <Logomark size={34} />
                  <Text style={{ fontFamily: FONTS.heading, fontSize: 17, fontWeight: '700', color: C.text }}>MaurMaket</Text>
                </View>
                <WelcomeIllustration />
                <View style={{ marginTop: 16 }}>
                  <View style={s.badge}>
                    <Text style={s.badgeText}>A marketplace for real people</Text>
                  </View>
                </View>
                <Text style={s.heroTitle}>
                  Commerce,{'\n'}
                  <Text style={s.heroAccent}>made more human.</Text>
                </Text>
                <Text style={s.heroSub}>MaurMaket connects people, products, and opportunity in one place built for how you actually buy and sell.</Text>
                <View style={{ flex: 1 }} />
                <View style={{ gap: 12 }}>
                  <PrimaryButton onPress={() => go(1)}>Get started</PrimaryButton>
                  <TouchableOpacity onPress={onSwitchToSignin} style={{ paddingVertical: 14 }}>
                    <Text style={{ textAlign: 'center', color: C.sub, fontSize: 14, fontWeight: '500' }}>I already have an account</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* SCREEN 2 — NAME */}
            {index === 2 && (
              <View style={{ flex: 1 }}>
                <View style={s.centeredStepBody}>
                  <NameIllustration />
                  <Text style={s.stepTitle}>What should we call you?</Text>
                  <Text style={s.stepSub}>This is how sellers and buyers will see you on MaurMaket.</Text>
                  <View style={{ gap: 12 }}>
                    <Field icon="account-outline" label="First name" value={form.first} onChangeText={v => set('first', v)} placeholder="Jordan" />
                    <Field icon="account-outline" label="Last name" value={form.last} onChangeText={v => set('last', v)} placeholder="Reyes" />
                    {errors.name ? <Text style={s.fieldError}>{errors.name}</Text> : null}
                  </View>
                </View>
                <StepActions step={1} label={STEP_LABELS.name} onBack={() => go(-1)}>
                  <PrimaryButton onPress={validateAndNext} disabled={!form.first || !form.last}>Continue</PrimaryButton>
                </StepActions>
              </View>
            )}

            {/* SCREEN 3 — EMAIL */}
            {index === 3 && (
              <View style={{ flex: 1 }}>
                <View style={s.centeredStepBody}>
                  <ContactIllustration />
                  <Text style={s.stepTitle}>Where can we reach you?</Text>
                  <Text style={s.stepSub}>We'll send order updates and account alerts here — nothing else.</Text>
                  <Field icon="email-outline" label="Email address" value={form.email} onChangeText={v => set('email', v)} placeholder="you@example.com" right={
                    emailChecking ? <MaterialCommunityIcons name="dots-horizontal" size={17} color={C.faint} /> :
                    emailAvailable === true ? <MaterialCommunityIcons name="check-circle" size={17} color={C.mint} /> :
                    emailAvailable === false ? <MaterialCommunityIcons name="close-circle" size={17} color={C.pink} /> : null
                  } />
                  {errors.email ? <Text style={s.fieldError}>{errors.email}</Text> : null}
                  {emailAvailable === true ? <Text style={[s.fieldError, { color: C.mint }]}>✓ Email is available</Text> : null}
                </View>
                <StepActions step={2} label={STEP_LABELS.email} onBack={() => go(-1)}>
                  <PrimaryButton onPress={validateAndNext} disabled={!emailValid || emailAvailable === false}>Continue</PrimaryButton>
                </StepActions>
              </View>
            )}

            {/* SCREEN 4 — PURPOSE */}
            {index === 4 && (
              <View style={{ flex: 1 }}>
                <View style={s.centeredStepBody}>
                  <Text style={[s.stepTitle, { marginTop: 16 }]}>What brings you here?</Text>
                  <Text style={s.stepSub}>Pick what fits best — MaurMaket adapts around it.</Text>
                  <View style={{ gap: 12 }}>
                    {PURPOSES.map(p => {
                      const active = form.purpose === p.id;
                      return (
                        <TouchableOpacity key={p.id} onPress={() => set('purpose', p.id)} activeOpacity={0.85} style={[s.purposeCard, active && s.purposeCardActive]}>
                          <View style={[s.purposeIcon, active && s.purposeIconActive]}>
                            <MaterialCommunityIcons name={p.icon} size={18} color={active ? '#1A0B12' : C.sub} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.purposeTitle}>{p.title}</Text>
                            <Text style={s.purposeDesc}>{p.desc}</Text>
                          </View>
                          <View style={[s.radio, active && s.radioActive]}>
                            {active && <MaterialCommunityIcons name="check" size={11} color="#1A0B12" />}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
                <StepActions step={3} label={STEP_LABELS.purpose} onBack={() => go(-1)}>
                  <PrimaryButton onPress={validateAndNext} disabled={!form.purpose}>Continue</PrimaryButton>
                </StepActions>
              </View>
            )}

            {/* SCREEN 5 — PASSWORD */}
            {index === 5 && (
              <View style={{ flex: 1 }}>
                <View style={s.centeredStepBody}>
                  <SecurityIllustration matched={pwMatched} />
                  <Text style={s.stepTitle}>Keep it protected.</Text>
                  <Text style={s.stepSub}>Create a password only you know — at least 6 characters.</Text>
                  <View style={{ gap: 12 }}>
                    <Field icon="lock-outline" label="Password" value={form.pw} onChangeText={v => set('pw', v)} placeholder="••••••••" secureTextEntry={!showPw} right={
                      <TouchableOpacity onPress={() => setShowPw(s => !s)}>
                        <MaterialCommunityIcons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={17} color={C.faint} />
                      </TouchableOpacity>
                    } />
                    <Field icon="lock-outline" label="Confirm password" value={form.pw2} onChangeText={v => set('pw2', v)} placeholder="••••••••" secureTextEntry={!showPw} right={
                      form.pw2 ? (pwMatched ? <MaterialCommunityIcons name="check-circle" size={17} color={C.mint} /> : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.pink }} />) : null
                    } />
                  </View>
                </View>
                <StepActions step={4} label={STEP_LABELS.password} onBack={() => go(-1)}>
                  <PrimaryButton onPress={validateAndNext} disabled={!pwMatched}>Continue</PrimaryButton>
                </StepActions>
              </View>
            )}

            {/* SCREEN 6 — REVIEW */}
            {index === 6 && (
              <View style={{ flex: 1 }}>
                <View style={s.centeredStepBody}>
                  <ReviewIllustration items={reviewItems} />
                  <Text style={s.stepTitle}>You're ready.</Text>
                  <Text style={s.stepSub}>Your MaurMaket account is almost complete.</Text>
                  <View style={{ gap: 10 }}>
                    {[
                      ['Name', form.first ? `${form.first} ${form.last}` : '—', reviewItems[0]],
                      ['Email', form.email || '—', reviewItems[1]],
                      ['Purpose', PURPOSES.find(p => p.id === form.purpose)?.title || '—', reviewItems[2]],
                      ['Password', pwMatched ? 'Set' : '—', reviewItems[3]],
                    ].map(([label, val, ok], i) => (
                      <View key={i} style={s.reviewRow}>
                        <View>
                          <Text style={s.reviewLabel}>{label}</Text>
                          <Text style={s.reviewVal}>{val as string}</Text>
                        </View>
                        <View style={[s.reviewCheck, ok ? { backgroundColor: C.mint + '15', borderColor: C.mint } : {}]}>
                          {ok ? <MaterialCommunityIcons name="check" size={12} color={C.mint} /> : null}
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
                <StepActions step={5} label={STEP_LABELS.review} onBack={() => go(-1)}>
                  <PrimaryButton onPress={validateAndNext} disabled={loading}>{loading ? t('common.loading') : 'Create account'}</PrimaryButton>
                </StepActions>
              </View>
            )}

            {/* SCREEN 7 — SUCCESS */}
            {index === 7 && (
              <View style={[s.screenCenter, { paddingTop: 20 }]}>
                <SuccessIllustration pulse={pulse} />
                <View style={s.successBadge}>
                  <Text style={s.successBadgeText}>Welcome in</Text>
                </View>
                <Text style={s.successTitle}>
                  This is your{'\n'}
                  <Text style={s.heroAccent}>marketplace.</Text>
                </Text>
                <Text style={s.successSub}>{form.first ? `Good to have you, ${form.first}. ` : ''}Your MaurMaket journey starts now.</Text>
                <View style={s.pillRow}>
                  {['Buy', 'Sell', 'Grow'].map(t => (
                    <View key={t} style={s.pill}><Text style={s.pillText}>{t}</Text></View>
                  ))}
                </View>
                <View style={{ flex: 1 }} />
                <PrimaryButton onPress={handleEnterApp}>Explore MaurMaket</PrimaryButton>
              </View>
            )}

          </Animated.View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

/* ── Styles ───────────────────────────────────────────────── */

const s = StyleSheet.create({
  scrollContent: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 28, paddingTop: 0, paddingBottom: 16 },
  slide: { flex: 1, width: '100%', maxWidth: 430 },
  centeredStepBody: { flex: 1, justifyContent: 'center' },
  screenCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  actions: { width: '100%', alignItems: 'stretch' },
  backAction: { minHeight: 44, marginTop: 4, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  backActionText: { color: C.sub, fontSize: 14, fontWeight: '600' },
  orb: { position: 'absolute', borderRadius: 999 },

  // Splash
  splashBrand: { fontFamily: FONTS.heading, fontSize: 26, fontWeight: '800', color: C.text, marginTop: 12 },
  splashSub: { fontSize: 14, color: C.sub, marginTop: 8, maxWidth: 220, textAlign: 'center' },
  dotsRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.faint },

  // Welcome
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  badgeText: { fontSize: 12, fontWeight: '500', color: C.sub },
  heroTitle: { fontFamily: FONTS.heading, fontSize: 30, fontWeight: '800', color: C.text, lineHeight: 36, marginTop: 12 },
  heroAccent: { color: C.violet },
  heroSub: { fontSize: 14, color: C.sub, lineHeight: 21, marginTop: 10, maxWidth: 280 },

  // Steps
  stepTitle: { fontFamily: FONTS.heading, fontSize: 24, fontWeight: '800', color: C.text, marginTop: 8, textAlign: 'center' },
  stepSub: { fontSize: 14, color: C.sub, marginTop: 8, marginBottom: 24, lineHeight: 20, textAlign: 'center', alignSelf: 'center', maxWidth: 340 },

  // Fields
  field: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 58, borderRadius: 16, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.borderHi, paddingHorizontal: 16 },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: C.sub },
  fieldInput: { backgroundColor: 'transparent', borderWidth: 0, color: C.text, fontSize: 14, fontWeight: '500' as const, padding: 0 },
  fieldError: { color: C.pink, fontSize: 12.5, marginTop: 4 },

  // Purpose
  purposeCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border },
  purposeCardActive: { backgroundColor: C.pink + '10', borderColor: C.pink },
  purposeIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  purposeIconActive: { backgroundColor: C.pink },
  purposeTitle: { fontSize: 14, fontWeight: '600', color: C.text },
  purposeDesc: { fontSize: 12, color: C.sub, marginTop: 2 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: C.borderHi, alignItems: 'center', justifyContent: 'center' },
  radioActive: { backgroundColor: C.pink, borderColor: C.pink },

  // Review
  reviewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  reviewLabel: { fontSize: 11, color: C.faint },
  reviewVal: { fontSize: 14, fontWeight: '500', color: C.text, marginTop: 2 },
  reviewCheck: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: C.borderHi, alignItems: 'center', justifyContent: 'center' },

  // Success
  successBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: C.mint + '12', borderWidth: 1, borderColor: C.mint + '40', marginTop: 8 },
  successBadgeText: { fontSize: 12, fontWeight: '600', color: C.mint },
  successTitle: { fontFamily: FONTS.heading, fontSize: 27, fontWeight: '800', color: C.text, textAlign: 'center', lineHeight: 34, marginTop: 12 },
  successSub: { fontSize: 14, color: C.sub, textAlign: 'center', lineHeight: 21, marginTop: 10, maxWidth: 260 },
  pillRow: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 20 },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  pillText: { fontSize: 12, fontWeight: '500', color: C.sub },

  // Primary button
  primaryBtn: { height: 52, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#1A0B12' },
});
