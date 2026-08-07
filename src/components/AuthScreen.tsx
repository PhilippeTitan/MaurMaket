import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, Animated, Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { COLORS, SPACING, RADIUS } from '../theme';
import { useTranslation } from '../i18n';
import { signup as apiSignup, login as apiLogin, googleAuthCode } from '../api';
import { store } from '../store';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import IdentityCard from '../components/IdentityCard';
import WelcomeMoment from '../components/WelcomeMoment';
import ForgotPasswordSheet from '../components/ForgotPasswordSheet';
import type { User } from '../types';

const GOOGLE_WEB_CLIENT_ID = '273654218158-k61mtuaq2kcvohj05roqdpe6nqmfscu0.apps.googleusercontent.com';
const ANDROID_CLIENT_ID = (Constants.expoConfig?.android as any)?.googleClientId ?? '';

const { width: SCREEN_W } = Dimensions.get('window');
const STEPS = ['name', 'email', 'password', 'phone', 'review'] as const;
type Step = typeof STEPS[number];

type AuthMode = 'signup' | 'signin';

interface Props {
  initialMode?: AuthMode;
  onSwitchMode?: () => void;
}

export default function AuthScreen({ initialMode = 'signup', onSwitchMode }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [forgotOpen, setForgotOpen] = useState(false);

  const switchMode = () => {
    setMode(m => m === 'signup' ? 'signin' : 'signup');
    onSwitchMode?.();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + SPACING.lg }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Brand + Mode Toggle */}
        <View style={styles.brandRow}>
          <Text style={styles.brand}>Maur<Text style={styles.brandAccent}>Maket</Text></Text>
          <View style={styles.modeSwitch}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'signup' && styles.modeBtnActive]}
              onPress={() => setMode('signup')}
            >
              <Text style={[styles.modeBtnText, mode === 'signup' && styles.modeBtnTextActive]}>Sign up</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'signin' && styles.modeBtnActive]}
              onPress={() => setMode('signin')}
            >
              <Text style={[styles.modeBtnText, mode === 'signin' && styles.modeBtnTextActive]}>Sign in</Text>
            </TouchableOpacity>
          </View>
        </View>

        {mode === 'signup' ? (
          <SignupWizard switchMode={switchMode} />
        ) : (
          <SigninForm switchMode={switchMode} onForgotPassword={() => setForgotOpen(true)} />
        )}
      </ScrollView>
      <ForgotPasswordSheet visible={forgotOpen} onClose={() => setForgotOpen(false)} />
    </KeyboardAvoidingView>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SIGNUP WIZARD — one question at a time
   ═══════════════════════════════════════════════════════════════════════════ */
function SignupWizard({ switchMode }: { switchMode: () => void }) {
  const { t } = useTranslation();
  const [stepIdx, setStepIdx] = useState(0);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showMiddle, setShowMiddle] = useState(false);
  const [middleName, setMiddleName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [phoneDigits, setPhoneDigits] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [entered, setEntered] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogle = async () => {
    try {
      setGoogleLoading(true);
      WebBrowser.maybeCompleteAuthSession();
      const redirectUri = 'https://auth.expo.io/@maurinex/MaurMaketMobile';
      const state = Math.random().toString(36).substring(2);
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${GOOGLE_WEB_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent('openid profile email')}` +
        `&state=${state}` +
        `&access_type=offline`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const code = url.searchParams.get('code');
        if (code) {
          const res = await googleAuthCode(code) as any;
          await store.setUser(res.user, res.token);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google sign-in failed';
      setErrors({ google: message });
    } finally {
      setGoogleLoading(false);
    }
  };

  const step: Step = STEPS[stepIdx];
  const pwLen = password.length;
  const pwOk = pwLen >= 6 && pwLen <= 128;
  const pwScore = pwLen === 0 ? 0 : pwLen < 6 ? 1 : pwLen < 10 ? 2 : 3;

  const currentStepCredit =
    step === 'name' ? (firstName.trim() && lastName.trim() ? 1 : 0.15) :
    step === 'email' ? (emailValid ? 1 : 0.15) :
    step === 'password' ? (pwOk ? 1 : 0.15) :
    1;
  const progress = Math.min((stepIdx + currentStepCredit) / STEPS.length, 1);

  const goNext = () => { setErrors({}); setStepIdx(i => Math.min(i + 1, STEPS.length - 1)); };
  const goBack = () => { setErrors({}); setStepIdx(i => Math.max(i - 1, 0)); };

  const validateAndNext = () => {
    if (step === 'name') {
      if (!firstName.trim() || !lastName.trim()) {
        setErrors({ name: "First and last name help sellers know who they're talking to" });
        return;
      }
    }
    if (step === 'email') {
      if (!emailValid) { setErrors({ email: "That doesn't look like a full email address" }); return; }
    }
    if (step === 'password') {
      if (!pwOk) { setErrors({ password: 'Needs at least 6 characters' }); return; }
    }
    goNext();
  };

  const submitSignup = async () => {
    setLoading(true);
    setErrors({});
    const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ').trim();
    try {
      const res = await apiSignup(fullName, email, password, phoneDigits) as { user: User; token: string };
      await store.setUser(res.user, res.token);
      setEntered(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Signup failed';
      setErrors({ email: message });
      setStepIdx(1);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    setGoogleLoading(true);
    promptAsync().finally(() => setGoogleLoading(false));
  };

  if (entered) {
    return <WelcomeMoment name={[firstName, middleName, lastName].filter(Boolean).join(' ')} onEnter={() => {}} />;
  }

  return (
    <>
      {/* Progress bar */}
      <View style={styles.progressRow}>
        {stepIdx > 0 ? (
          <TouchableOpacity onPress={goBack} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={18} color={COLORS.text} />
          </TouchableOpacity>
        ) : <View style={{ width: 36 }} />}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.min(progress, 1) * 100}%` }]} />
        </View>
        <Text style={styles.progressLabel}>{stepIdx + 1}/{STEPS.length}</Text>
      </View>

      {/* Identity Card */}
      <IdentityCard
        firstName={firstName}
        email={emailValid ? email : ''}
        phone={phoneDigits.length === 8 ? phoneDigits : ''}
        hasPassword={pwOk}
        progress={Math.min(progress, 1)}
      />

      {/* Step content */}
      <View style={styles.stepContent}>
        {step === 'name' && (
          <>
            <StepHeading eyebrow="Let's start with you" title="What's your name?" />
            <AuthInput
              icon="account-outline"
              value={firstName}
              onChangeText={setFirstName}
              placeholder="First name"
              autoFocus
            />
            <AuthInput
              icon="account-outline"
              value={lastName}
              onChangeText={setLastName}
              placeholder="Last name"
              error={errors.name}
            />
            {showMiddle ? (
              <AuthInput
                icon="account-outline"
                value={middleName}
                onChangeText={setMiddleName}
                placeholder="Middle name (optional)"
              />
            ) : (
              <TouchableOpacity onPress={() => setShowMiddle(true)}>
                <Text style={styles.subtleLink}>+ Add a middle name</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {step === 'email' && (
          <>
            <StepHeading eyebrow="How sellers reach you" title="What's your email?" />
            <AuthInput
              icon="email-outline"
              value={email}
              onChangeText={setEmail}
              placeholder="you@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email}
              rightIcon={emailValid ? 'check-circle' : undefined}
              rightColor={COLORS.green}
            />
            {!emailValid && <Text style={styles.hint}>Order updates and receipts go here</Text>}
          </>
        )}

        {step === 'password' && (
          <>
            <StepHeading eyebrow="Keep it yours" title="Create a password" />
            <AuthInput
              icon="lock-outline"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              secureTextEntry={!showPw}
              error={errors.password}
              rightIcon={showPw ? 'eye-off-outline' : 'eye-outline'}
              onRightPress={() => setShowPw(s => !s)}
            />
            <View style={styles.strengthRow}>
              {[0, 1, 2].map(i => (
                <View key={i} style={[
                  styles.strengthBar,
                  { backgroundColor: pwScore > i ? [COLORS.coral, COLORS.yellow, COLORS.green][pwScore - 1] : COLORS.border },
                ]} />
              ))}
            </View>
            <Text style={[styles.hint, pwOk && { color: COLORS.green }]}>
              {pwOk ? '✓ Good — that works' : `${pwLen}/6 characters minimum`}
            </Text>
          </>
        )}

        {step === 'phone' && (
          <>
            <StepHeading eyebrow="Optional, but handy for meetups" title="Add a phone number?" />
            <View style={styles.phoneRow}>
              <MaterialCommunityIcons name="phone-outline" size={18} color={COLORS.text2} />
              <Text style={styles.phonePrefix}>+509</Text>
              <View style={styles.phoneDivider} />
              <TextInput
                style={styles.phoneInput}
                value={phoneDigits}
                onChangeText={v => setPhoneDigits(v.replace(/\D/g, '').slice(0, 8))}
                placeholder="00 00 0000"
                placeholderTextColor={COLORS.text2}
                keyboardType="number-pad"
                maxLength={8}
              />
            </View>
            <Text style={styles.hint}>Used for buyer-seller meetup coordination — never shown publicly.</Text>
            <TouchableOpacity onPress={goNext}>
              <Text style={styles.subtleLink}>Skip for now</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'review' && (
          <>
            <StepHeading eyebrow="Last look" title="Ready to join?" />
            <View style={styles.reviewCard}>
              <ReviewRow label="Name" value={[firstName, middleName, lastName].filter(Boolean).join(' ')} />
              <ReviewRow label="Email" value={email} />
              <ReviewRow label="Password" value={'•'.repeat(Math.min(pwLen, 10))} />
              <ReviewRow label="Phone" value={phoneDigits ? `+509 ${phoneDigits}` : 'Not added'} muted={!phoneDigits} />
            </View>
          </>
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        {step !== 'review' ? (
          <TouchableOpacity
            style={[styles.primaryBtn, (
              (step === 'name' && (!firstName.trim() || !lastName.trim())) ||
              (step === 'email' && !emailValid) ||
              (step === 'password' && !pwOk)
            ) && styles.btnDisabled]}
            onPress={validateAndNext}
            disabled={
              (step === 'name' && (!firstName.trim() || !lastName.trim())) ||
              (step === 'email' && !emailValid) ||
              (step === 'password' && !pwOk)
            }
          >
            <Text style={styles.primaryBtnText}>Continue</Text>
            <MaterialCommunityIcons name="arrow-right" size={17} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.btnDisabled]}
            onPress={submitSignup}
            disabled={loading}
          >
            <MaterialCommunityIcons name="check-decagram" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>{loading ? t('common.loading') : 'Create my account'}</Text>
          </TouchableOpacity>
        )}

        {stepIdx === 0 && (
          <>
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
                {t('auth.hasAccount')} <Text style={styles.switchLink}>{t('auth.signIn')}</Text>
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SIGN IN FORM
   ═══════════════════════════════════════════════════════════════════════════ */
function SigninForm({ switchMode, onForgotPassword }: { switchMode: () => void; onForgotPassword: () => void }) {
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
      WebBrowser.maybeCompleteAuthSession();
      const redirectUri = 'https://auth.expo.io/@maurinex/MaurMaketMobile';
      const state = Math.random().toString(36).substring(2);
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${GOOGLE_WEB_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent('openid profile email')}` +
        `&state=${state}` +
        `&access_type=offline`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const code = url.searchParams.get('code');
        if (code) {
          const res = await googleAuthCode(code) as any;
          await store.setUser(res.user, res.token);
        }
      }
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

  const handleGoogle = () => {
    setGoogleLoading(true);
    promptAsync().finally(() => setGoogleLoading(false));
  };

  return (
    <>
      <View style={styles.signInHeader}>
        <Text style={styles.signInTitle}>Welcome back</Text>
        <Text style={styles.signInSubtitle}>Good to see you again.</Text>
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

/* ═══════════════════════════════════════════════════════════════════════════
   SHARED COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */
function StepHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <View style={styles.stepHeading}>
      <Text style={styles.stepEyebrow}>{eyebrow}</Text>
      <Text style={styles.stepTitle}>{title}</Text>
    </View>
  );
}

function ReviewRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={[styles.reviewValue, muted && { color: COLORS.text2 }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function Divider() {
  return (
    <View style={styles.dividerRow}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>or</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

function AuthInput({
  icon, value, onChangeText, placeholder, keyboardType, autoCapitalize,
  secureTextEntry, error, rightIcon, rightColor, onRightPress, autoFocus,
}: {
  icon: string; value: string; onChangeText: (v: string) => void;
  placeholder: string; keyboardType?: any; autoCapitalize?: any;
  secureTextEntry?: boolean; error?: string; rightIcon?: string;
  rightColor?: string; onRightPress?: () => void; autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.inputWrap}>
      <View style={[
        styles.inputRow,
        focused && styles.inputRowFocused,
        error && styles.inputRowError,
      ]}>
        <MaterialCommunityIcons
          name={icon as any}
          size={18}
          color={focused ? COLORS.coral : COLORS.text2}
        />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.text2}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          secureTextEntry={secureTextEntry}
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {rightIcon ? (
          <TouchableOpacity onPress={onRightPress} style={styles.inputRight}>
            <MaterialCommunityIcons name={rightIcon as any} size={18} color={rightColor || COLORS.text2} />
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? (
        <View style={styles.errorRow}>
          <MaterialCommunityIcons name="alert-circle-outline" size={14} color={COLORS.coral} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════════════════════════════ */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flexGrow: 1, paddingHorizontal: SPACING.xl },

  // Brand + mode switch
  brandRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  brand: { fontFamily: 'Syne', fontSize: 20, fontWeight: '800', color: COLORS.text },
  brandAccent: { color: COLORS.coral },
  modeSwitch: {
    flexDirection: 'row', backgroundColor: COLORS.surface2, borderRadius: 999, padding: 3,
  },
  modeBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
  modeBtnActive: { backgroundColor: COLORS.coral },
  modeBtnText: { fontSize: 12.5, fontWeight: '600', color: COLORS.text2 },
  modeBtnTextActive: { color: '#fff' },

  // Progress bar
  progressRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18, marginTop: 4,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center',
  },
  progressTrack: { flex: 1, height: 6, backgroundColor: COLORS.surface2, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.coral, borderRadius: 3 },
  progressLabel: { fontSize: 12, fontWeight: '600', color: COLORS.text2, width: 34, textAlign: 'right' },

  // Step content
  stepContent: { flex: 1, marginTop: 22 },
  stepHeading: { marginBottom: 20 },
  stepEyebrow: {
    fontSize: 12.5, fontWeight: '700', color: COLORS.coral, textTransform: 'uppercase',
    letterSpacing: 0.6, marginBottom: 6,
  },
  stepTitle: {
    fontFamily: 'Syne', fontSize: 26, fontWeight: '800', color: COLORS.text, lineHeight: 30,
  },

  // Inputs
  inputWrap: { marginBottom: 12 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: RADIUS.card, paddingHorizontal: 16, paddingVertical: 14,
  },
  inputRowFocused: { borderColor: COLORS.coral },
  inputRowError: { borderColor: COLORS.coral },
  input: {
    flex: 1, backgroundColor: 'transparent', borderWidth: 0,
    color: COLORS.text, fontSize: 16, fontWeight: '500', padding: 0,
  },
  inputRight: { padding: 4 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  errorText: { color: COLORS.coral, fontSize: 13, fontWeight: '500' },
  hint: { color: COLORS.text2, fontSize: 12.5, marginTop: 8 },

  // Password strength
  strengthRow: { flexDirection: 'row', gap: 5, marginTop: 12 },
  strengthBar: { height: 4, flex: 1, borderRadius: 2 },

  // Phone
  phoneRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: RADIUS.card, paddingHorizontal: 16, paddingVertical: 14,
  },
  phonePrefix: { color: COLORS.text2, fontWeight: '600', fontSize: 16 },
  phoneDivider: { width: 1, height: 20, backgroundColor: COLORS.border },
  phoneInput: {
    flex: 1, backgroundColor: 'transparent', borderWidth: 0,
    color: COLORS.text, fontSize: 16, fontWeight: '500', padding: 0, letterSpacing: 1,
  },

  // Review
  reviewCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.card, paddingHorizontal: 16,
  },
  reviewRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  reviewLabel: { color: COLORS.text2, fontSize: 13.5 },
  reviewValue: { color: COLORS.text, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },

  // Footer
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
  dividerRow: {
    flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 12,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { color: COLORS.text2, fontSize: 11.5, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  switchText: { textAlign: 'center', color: COLORS.text2, fontSize: 13.5, marginTop: 16 },
  switchLink: { color: COLORS.coral, fontWeight: '700', fontSize: 13.5 },

  // Sign in
  signInHeader: { marginBottom: 28, marginTop: 8 },
  signInTitle: { fontFamily: 'Syne', fontSize: 30, fontWeight: '800', color: COLORS.text, marginBottom: 6 },
  signInSubtitle: { color: COLORS.text2, fontSize: 14.5 },
  forgotBtn: { alignItems: 'flex-end', marginTop: -4, marginBottom: 8 },
  forgotText: { color: COLORS.coral, fontSize: 14, fontWeight: '500' },

  // Subtle link
  subtleLink: { color: COLORS.blue, fontSize: 13.5, fontWeight: '600', marginTop: 14 },
});
