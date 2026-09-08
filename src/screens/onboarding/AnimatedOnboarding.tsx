import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Animated,
  Easing, ScrollView, Platform, KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONTS } from '../../theme';
import { useTranslation } from '../../i18n';
import { signup as apiSignup, googleAuth, API_BASE } from '../../api';
import { store } from '../../store';
import AuthInput from './components/AuthInput';
import ReviewRow from './components/ReviewRow';
import type { User } from '../../types';
import OnboardingIllustrations from './OnboardingIllustrations';

const STEPS = ['name', 'email', 'password', 'phone', 'dob', 'review'] as const;
type Step = typeof STEPS[number];

const GRADIENT_START = '#8B5CF6';
const GRADIENT_MID = '#EC4899';
const GRADIENT_END = '#FB923C';
const MINT = '#00E5A0';

const STEP_META: Record<Step, { eyebrow: string; title: string; subtitle: string }> = {
  name:     { eyebrow: "LET'S START", title: "Let's start\nwith you.", subtitle: 'Tell us what people should call you.' },
  email:    { eyebrow: 'YOUR DIGITAL ADDRESS', title: 'Your digital\naddress.', subtitle: "We'll use this to protect your account." },
  password: { eyebrow: 'KEEP IT PROTECTED', title: 'Keep it\nprotected.', subtitle: 'Create a password only you know.' },
  phone:    { eyebrow: 'STAY CONNECTED', title: 'Add a phone\nnumber?', subtitle: 'Optional — helps with meetup coordination.' },
  dob:      { eyebrow: 'ACCOUNT SAFETY', title: "When's your\nbirthday?", subtitle: 'You must be 18+ to use MaurMaket.' },
  review:   { eyebrow: 'FINAL STEP', title: "You're\nready.", subtitle: 'Your MaurMaket account is almost complete.' },
};

const PURPOSES = [
  { id: 'buy', title: 'Discover & buy', desc: 'Find products from sellers around you', icon: 'shopping-outline' as const },
  { id: 'sell', title: 'Build a store', desc: 'Sell products and grow your audience', icon: 'store-outline' as const },
  { id: 'both', title: 'A little of both', desc: 'Buy, sell, and explore freely', icon: 'swap-horizontal' as const },
];

interface Props {
  onSwitchToSignin: () => void;
}

export default function AnimatedOnboarding({ onSwitchToSignin }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [phase, setPhase] = useState<'splash' | 'welcome' | 'wizard' | 'purpose' | 'success'>('splash');
  const [stepIdx, setStepIdx] = useState(0);
  const [dir, setDir] = useState(1);
  const [form, setForm] = useState({ first: '', last: '', middle: '', email: '', purpose: '', pw: '', pw2: '', phone: '', birthMonth: 0, birthDay: 0, birthYear: 0 });
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [userResult, setUserResult] = useState<{ user: User; token: string } | null>(null);
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const [emailChecking, setEmailChecking] = useState(false);
  const emailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(dir * 40)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;

  // Float loop for illustrations
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: -8, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Animate screen transitions
  useEffect(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(dir * 40);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [stepIdx, phase]);

  // Animate progress bar
  useEffect(() => {
    const pct = phase === 'wizard' ? (stepIdx + 1) / STEPS.length : phase === 'success' ? 1 : 0;
    Animated.timing(progressAnim, { toValue: pct, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [stepIdx, phase]);

  // Splash auto-advance
  useEffect(() => {
    if (phase === 'splash') {
      const t = setTimeout(() => setPhase('welcome'), 2200);
      return () => clearTimeout(t);
    }
  }, [phase]);

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const step: Step | null = phase === 'wizard' ? STEPS[stepIdx] : null;
  const pwLen = form.pw.length;
  const pwOk = pwLen >= 6 && pwLen <= 128;
  const pwScore = pwLen === 0 ? 0 : pwLen < 6 ? 1 : pwLen < 10 ? 2 : 3;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
  const pwMatched = pwOk && form.pw === form.pw2;

  const reviewItems = [
    !!(form.first && form.last),
    /\S+@\S+\.\S+/.test(form.email),
    pwMatched,
  ];

  // Debounced email check
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
    setStepIdx(i => Math.min(Math.max(i + delta, 0), STEPS.length - 1));
  };

  const validateAndNext = () => {
    if (step === 'name' && (!form.first.trim() || !form.last.trim())) { setErrors({ name: "First and last name are needed" }); return; }
    if (step === 'email') {
      if (!emailValid) { setErrors({ email: "That doesn't look like a full email" }); return; }
      if (emailAvailable === false) { setErrors({ email: 'This email is already registered' }); return; }
    }
    if (step === 'password' && !pwOk) { setErrors({ password: 'Needs at least 6 characters' }); return; }
    if (step === 'dob') {
      if (!form.birthMonth || !form.birthDay || !form.birthYear) { setErrors({ dob: 'Please enter your full date of birth' }); return; }
      const dob = new Date(form.birthYear, form.birthMonth - 1, form.birthDay);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
      if (age < 18) { setErrors({ dob: 'You must be at least 18 years old' }); return; }
    }
    if (step === 'review') { submitSignup(); return; }
    go(1);
  };

  const submitSignup = async () => {
    setLoading(true); setErrors({});
    const fullName = [form.first, form.middle, form.last].filter(Boolean).join(' ').trim();
    const dobStr = form.birthYear && form.birthMonth && form.birthDay
      ? `${form.birthYear}-${String(form.birthMonth).padStart(2, '0')}-${String(form.birthDay).padStart(2, '0')}` : '';
    try {
      const res = await apiSignup(fullName, form.email, form.pw, form.phone, dobStr) as { user: User; token: string };
      setUserResult(res);
      setPhase('success');
    } catch (err: any) {
      setErrors({ email: err?.message || 'Signup failed' });
      setStepIdx(1);
    } finally { setLoading(false); }
  };

  const handleGoogle = async () => {
    try {
      setGoogleLoading(true);
      const res = await googleAuth() as { user: User; token: string };
      await store.setUser(res.user, res.token);
    } catch (err: any) { setErrors({ google: err?.message || 'Google sign-in failed' }); }
    finally { setGoogleLoading(false); }
  };

  const handleEnterApp = async () => { if (userResult) await store.setUser(userResult.user, userResult.token); };

  const progressWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  // ── SPLASH ──
  if (phase === 'splash') {
    return (
      <View style={s.container}>
        <BackgroundOrbs />
        <View style={s.splashCenter}>
          <Animated.View style={{ transform: [{ scale: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
            <OnboardingIllustrations.Splash size={160} />
          </Animated.View>
          <Text style={s.splashBrand}>Maur<Text style={{ color: COLORS.coral }}>Maket</Text></Text>
          <View style={s.dotsRow}>
            {[0, 1, 2].map(i => (
              <View key={i} style={[s.dot, { opacity: fadeAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 1, 0.3] }) }]} />
            ))}
          </View>
        </View>
      </View>
    );
  }

  // ── WELCOME ──
  if (phase === 'welcome') {
    return (
      <View style={s.container}>
        <BackgroundOrbs />
        <Animated.View style={[s.screenContent, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={s.welcomeLogo}>
            <OnboardingIllustrations.LogoMark size={36} />
            <Text style={s.welcomeBrand}>MaurMaket</Text>
          </View>
          <Animated.View style={{ transform: [{ translateY: floatAnim }] }}>
            <OnboardingIllustrations.Welcome />
          </Animated.View>
          <Text style={s.welcomeBadge}>A marketplace for real people</Text>
          <Text style={s.welcomeTitle}>
            Commerce,{'\n'}
            <Text style={s.welcomeTitleAccent}>made more human.</Text>
          </Text>
          <Text style={s.welcomeSub}>
            MaurMaket connects people, products, and opportunities in one marketplace built for how you actually buy and sell.
          </Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={s.gradientBtn} onPress={() => setPhase('wizard')} activeOpacity={0.85}>
            <Text style={s.gradientBtnText}>Get started</Text>
            <MaterialCommunityIcons name="arrow-right" size={18} color="#1A0B12" />
          </TouchableOpacity>
          <TouchableOpacity onPress={onSwitchToSignin} style={{ paddingVertical: 14 }}>
            <Text style={s.switchText}>I already have an account</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  // ── SUCCESS ──
  if (phase === 'success') {
    return (
      <View style={s.container}>
        <BackgroundOrbs />
        <Animated.View style={[s.screenContent, s.centerContent, { opacity: fadeAnim }]}>
          <OnboardingIllustrations.Success />
          <Text style={s.successBadge}>Welcome in</Text>
          <Text style={s.successTitle}>
            This is your{'\n'}
            <Text style={s.welcomeTitleAccent}>marketplace.</Text>
          </Text>
          <Text style={s.successSub}>
            {form.first ? `Good to have you, ${form.first}. ` : ''}Your MaurMaket journey starts now.
          </Text>
          <View style={s.pillRow}>
            {['Buy', 'Sell', 'Grow'].map(t => (
              <View key={t} style={s.pill}><Text style={s.pillText}>{t}</Text></View>
            ))}
          </View>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={s.gradientBtn} onPress={handleEnterApp} activeOpacity={0.85}>
            <Text style={s.gradientBtnText}>Explore MaurMaket</Text>
            <MaterialCommunityIcons name="arrow-right" size={18} color="#1A0B12" />
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  // ── WIZARD ──
  const meta = STEP_META[step!];
  const canContinue =
    (step === 'name' && !(!form.first.trim() || !form.last.trim())) ||
    (step === 'email' && emailValid && emailAvailable !== false) ||
    (step === 'password' && pwOk) ||
    (step === 'phone') ||
    (step === 'dob' && !!(form.birthMonth && form.birthDay && form.birthYear)) ||
    (step === 'review');

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.container}>
        <BackgroundOrbs />
        {/* Progress bar */}
        <View style={[s.progressOuter, { paddingTop: insets.top + 8 }]}>
          <View style={s.progressTrack}>
            <Animated.View style={[s.progressFill, { width: progressWidth }]} />
          </View>
        </View>

        {/* Back button */}
        {stepIdx > 0 && (
          <TouchableOpacity style={[s.backBtn, { top: insets.top + 20 }]} onPress={() => go(-1)}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.text} />
          </TouchableOpacity>
        )}

        {/* Step counter */}
        {step !== 'review' && (
          <Text style={[s.stepCounter, { top: insets.top + 24 }]}>{stepIdx + 1}/{STEPS.length}</Text>
        )}

        <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateX: slideAnim }] }}>
            {/* Eyebrow */}
            <Text style={s.eyebrow}>{meta.eyebrow}</Text>

            {/* Illustration */}
            <Animated.View style={{ alignItems: 'center', marginVertical: 16, transform: [{ translateY: floatAnim }] }}>
              <OnboardingIllustrations.StepIllustration step={step!} pwMatched={pwMatched} />
            </Animated.View>

            {/* Title */}
            <Text style={s.wizardTitle}>{meta.title}</Text>
            <Text style={s.wizardSub}>{meta.subtitle}</Text>

            {/* Fields */}
            <View style={s.fieldsWrap}>
              {step === 'name' && (
                <>
                  <AuthInput icon="account-outline" value={form.first} onChangeText={v => set('first', v)} placeholder="First name" autoFocus />
                  <AuthInput icon="account-outline" value={form.last} onChangeText={v => set('last', v)} placeholder="Last name" error={errors.name} />
                </>
              )}
              {step === 'email' && (
                <>
                  <AuthInput icon="email-outline" value={form.email} onChangeText={v => set('email', v)} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" error={errors.email} loading={emailChecking} rightIcon={emailAvailable === true ? 'check-circle' : emailAvailable === false ? 'close-circle' : undefined} rightColor={emailAvailable ? COLORS.green : COLORS.coral} />
                </>
              )}
              {step === 'password' && (
                <>
                  <AuthInput icon="lock-outline" value={form.pw} onChangeText={v => set('pw', v)} placeholder="Password" secureTextEntry={!showPw} error={errors.password} rightIcon={showPw ? 'eye-off-outline' : 'eye-outline'} onRightPress={() => setShowPw(s => !s)} />
                  <AuthInput icon="lock-outline" value={form.pw2} onChangeText={v => set('pw2', v)} placeholder="Confirm password" secureTextEntry={!showPw} error={form.pw2 && !pwMatched ? 'Passwords do not match' : undefined} rightIcon={form.pw2 ? (pwMatched ? 'check-circle' : 'close-circle') : undefined} rightColor={pwMatched ? COLORS.green : COLORS.coral} />
                  <View style={s.strengthRow}>
                    {[0, 1, 2].map(i => (
                      <View key={i} style={[s.strengthBar, { backgroundColor: pwScore > i ? [COLORS.coral, COLORS.yellow, COLORS.green][pwScore - 1] : COLORS.border }]} />
                    ))}
                  </View>
                </>
              )}
              {step === 'phone' && (
                <>
                  <View style={s.phoneRow}>
                    <MaterialCommunityIcons name="phone-outline" size={18} color={COLORS.text2} />
                    <Text style={s.phonePrefix}>+509</Text>
                    <View style={s.phoneDivider} />
                    <TextInput style={s.phoneInput} value={form.phone} onChangeText={v => set('phone', v.replace(/\D/g, '').slice(0, 8))} placeholder="00 00 0000" placeholderTextColor={COLORS.text2} keyboardType="number-pad" maxLength={8} />
                  </View>
                  <TouchableOpacity onPress={() => go(1)} style={{ marginTop: 12 }}>
                    <Text style={s.subtleLink}>Skip for now</Text>
                  </TouchableOpacity>
                </>
              )}
              {step === 'dob' && (
                <DobPicker birthMonth={form.birthMonth} birthDay={form.birthDay} birthYear={form.birthYear} onSelect={(m, d, y) => { set('birthMonth', m); set('birthDay', d); set('birthYear', y); }} error={errors.dob} />
              )}
              {step === 'review' && (
                <View style={s.reviewCard}>
                  <ReviewRow label="Name" value={[form.first, form.middle, form.last].filter(Boolean).join(' ')} />
                  <ReviewRow label="Email" value={form.email} />
                  <ReviewRow label="Password" value={'•'.repeat(Math.min(pwLen, 10))} />
                  <ReviewRow label="Phone" value={form.phone ? `+509 ${form.phone}` : 'Not added'} muted={!form.phone} />
                  <ReviewRow label="Birthday" value={form.birthMonth && form.birthDay && form.birthYear ? `${form.birthMonth}/${form.birthDay}/${form.birthYear}` : 'Not provided'} muted={!form.birthMonth} />
                </View>
              )}
            </View>

            {/* Google + passkey on name step only */}
            {step === 'name' && (
              <View style={s.socialSection}>
                <View style={s.dividerRow}>
                  <View style={s.dividerLine} />
                  <Text style={s.dividerText}>or continue with</Text>
                  <View style={s.dividerLine} />
                </View>
                <TouchableOpacity style={s.googleBtn} onPress={handleGoogle} disabled={googleLoading} activeOpacity={0.8}>
                  <MaterialCommunityIcons name="google" size={20} color="#4285F4" />
                  <Text style={s.googleBtnText}>{googleLoading ? 'Connecting…' : t('auth.googleSignIn')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>
        </ScrollView>

        {/* Continue button */}
        <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[s.gradientBtn, (!canContinue || loading) && s.btnDisabled]}
            onPress={validateAndNext}
            disabled={!canContinue || loading}
            activeOpacity={0.85}
          >
            <Text style={s.gradientBtnText}>{step === 'review' ? (loading ? 'Creating…' : 'Create account') : 'Continue'}</Text>
            <MaterialCommunityIcons name={step === 'review' ? 'check-decagram' : 'arrow-right'} size={17} color="#1A0B12" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── DOB PICKER ──
function DobPicker({ birthMonth, birthDay, birthYear, onSelect, error }: { birthMonth: number; birthDay: number; birthYear: number; onSelect: (m: number, d: number, y: number) => void; error?: string }) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const currentYear = new Date().getFullYear();
  return (
    <View>
      <View style={s.dobRow}>
        <View style={s.dobCol}>
          <Text style={s.dobLabel}>MONTH</Text>
          <ScrollView style={s.dobScroll} showsVerticalScrollIndicator={false}>
            {months.map((m, i) => (
              <TouchableOpacity key={i} style={[s.dobItem, birthMonth === i + 1 && s.dobItemActive]} onPress={() => onSelect(i + 1, birthDay, birthYear)}>
                <Text style={[s.dobItemText, birthMonth === i + 1 && s.dobItemTextActive]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        <View style={s.dobCol}>
          <Text style={s.dobLabel}>DAY</Text>
          <ScrollView style={s.dobScroll} showsVerticalScrollIndicator={false}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
              <TouchableOpacity key={d} style={[s.dobItem, birthDay === d && s.dobItemActive]} onPress={() => onSelect(birthMonth, d, birthYear)}>
                <Text style={[s.dobItemText, birthDay === d && s.dobItemTextActive]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        <View style={s.dobCol}>
          <Text style={s.dobLabel}>YEAR</Text>
          <ScrollView style={s.dobScroll} showsVerticalScrollIndicator={false}>
            {Array.from({ length: 80 }, (_, i) => currentYear - 18 - i).map(y => (
              <TouchableOpacity key={y} style={[s.dobItem, birthYear === y && s.dobItemActive]} onPress={() => onSelect(birthMonth, birthDay, y)}>
                <Text style={[s.dobItemText, birthYear === y && s.dobItemTextActive]}>{y}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
      {error ? <Text style={s.dobError}>{error}</Text> : null}
    </View>
  );
}

// ── BACKGROUND ORBS ──
function BackgroundOrbs() {
  const orbAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(orbAnim, { toValue: 1, duration: 6000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(orbAnim, { toValue: 0, duration: 6000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
  }, []);

  const drift1 = orbAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 18] });
  const drift2 = orbAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -22] });

  return (
    <View style={[{ position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 }, { overflow: 'hidden' }]}>
      <Animated.View style={[s.orb, { top: -60, left: -50, width: 260, height: 260, backgroundColor: '#8B5CF655', transform: [{ translateX: drift1 }, { translateY: drift2 }] }]} />
      <Animated.View style={[s.orb, { bottom: -70, right: -60, width: 280, height: 280, backgroundColor: '#EC48994d', transform: [{ translateX: drift2 }, { translateY: drift1 }] }]} />
      <Animated.View style={[s.orb, { top: '35%', right: -40, width: 160, height: 160, backgroundColor: '#FB923C33', transform: [{ translateX: drift1 }] }]} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0812' },
  screenContent: { flex: 1, paddingHorizontal: 28 },
  centerContent: { alignItems: 'center', justifyContent: 'center' },

  // Splash
  splashCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  splashBrand: { fontFamily: FONTS.heading, fontSize: 26, fontWeight: '800', color: COLORS.text, marginTop: 16 },
  dotsRow: { flexDirection: 'row', gap: 6, marginTop: 20 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.text2 },

  // Welcome
  welcomeLogo: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  welcomeBrand: { fontFamily: FONTS.heading, fontSize: 17, fontWeight: '700', color: COLORS.text },
  welcomeBadge: { fontSize: 12, fontWeight: '600', color: COLORS.text2, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginTop: 16, overflow: 'hidden' },
  welcomeTitle: { fontFamily: FONTS.heading, fontSize: 30, fontWeight: '800', color: COLORS.text, lineHeight: 36, marginTop: 12 },
  welcomeTitleAccent: { color: COLORS.coral },
  welcomeSub: { fontSize: 15, color: COLORS.text2, lineHeight: 22, marginTop: 10, maxWidth: 300 },

  // Success
  successBadge: { fontSize: 12, fontWeight: '600', color: MINT, backgroundColor: 'rgba(0,229,160,0.12)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(0,229,160,0.4)', marginTop: 16, overflow: 'hidden' },
  successTitle: { fontFamily: FONTS.heading, fontSize: 27, fontWeight: '800', color: COLORS.text, textAlign: 'center', lineHeight: 34, marginTop: 12 },
  successSub: { fontSize: 15, color: COLORS.text2, textAlign: 'center', lineHeight: 22, marginTop: 10, maxWidth: 280 },
  pillRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  pillText: { fontSize: 12, fontWeight: '600', color: COLORS.text2 },

  // Progress
  progressOuter: { paddingHorizontal: 28, paddingBottom: 8 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2, backgroundColor: COLORS.coral },

  // Back
  backBtn: { position: 'absolute', left: 28, zIndex: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  stepCounter: { position: 'absolute', right: 28, zIndex: 10, fontSize: 13, fontWeight: '600', color: COLORS.text2 },

  // Wizard
  scrollContent: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 60 },
  eyebrow: { fontSize: 11, fontWeight: '700', color: COLORS.coral, letterSpacing: 1.5, marginBottom: 8 },
  wizardTitle: { fontFamily: FONTS.heading, fontSize: 26, fontWeight: '800', color: COLORS.text, lineHeight: 32 },
  wizardSub: { fontSize: 15, color: COLORS.text2, marginTop: 8, marginBottom: 20 },
  fieldsWrap: { gap: 12 },

  // Social
  socialSection: { marginTop: 20 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  dividerText: { fontSize: 12, fontWeight: '500', color: COLORS.text2 },
  googleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 14, borderRadius: RADIUS.pill, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  googleBtnText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },

  // Buttons
  gradientBtn: { backgroundColor: COLORS.coral, padding: 16, borderRadius: RADIUS.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: COLORS.coral, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 24, elevation: 8 },
  gradientBtnText: { color: '#1A0B12', fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
  footer: { paddingHorizontal: 28, paddingTop: 8 },

  // Phone
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.card, paddingHorizontal: 16, paddingVertical: 14 },
  phonePrefix: { color: COLORS.text2, fontWeight: '600', fontSize: 16 },
  phoneDivider: { width: 1, height: 20, backgroundColor: COLORS.border },
  phoneInput: { flex: 1, backgroundColor: 'transparent', borderWidth: 0, color: COLORS.text, fontSize: 16, fontWeight: '500', padding: 0, letterSpacing: 1 },

  // Strength
  strengthRow: { flexDirection: 'row', gap: 5, marginTop: 8 },
  strengthBar: { height: 4, flex: 1, borderRadius: 2 },

  // Review
  reviewCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.card, paddingHorizontal: 16 },

  // DOB
  dobRow: { flexDirection: 'row', gap: 10 },
  dobCol: { flex: 1 },
  dobLabel: { fontSize: 10, fontWeight: '700', color: COLORS.text2, letterSpacing: 1, marginBottom: 6, textAlign: 'center' },
  dobScroll: { maxHeight: 160, backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.card },
  dobItem: { paddingVertical: 10, alignItems: 'center' },
  dobItemActive: { backgroundColor: COLORS.coral + '18' },
  dobItemText: { fontSize: 15, color: COLORS.text2, fontWeight: '500' },
  dobItemTextActive: { color: COLORS.coral, fontWeight: '700' },
  dobError: { color: COLORS.coral, fontSize: 12.5, marginTop: 8 },

  // Orbs
  orb: { position: 'absolute', borderRadius: 999 },
  switchText: { textAlign: 'center', color: COLORS.text2, fontSize: 14 },
  subtleLink: { color: COLORS.blue, fontSize: 14, fontWeight: '600' },
});
