import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../../theme';
import { useTranslation } from '../../i18n';
import { signup as apiSignup, googleAuth, API_BASE } from '../../api';
import { store } from '../../store';
import AuthInput from './components/AuthInput';
import StepHeading from './components/StepHeading';
import ReviewRow from './components/ReviewRow';
import Divider from './components/Divider';
import WelcomeMoment from '../../components/WelcomeMoment';
import type { User } from '../../types';

const GOOGLE_WEB_CLIENT_ID = '273654218158-k61mtuaq2kcvohj05roqdpe6nqmfscu0.apps.googleusercontent.com';
const GOOGLE_REDIRECT_URI = 'https://auth.expo.io/@maurinex/MaurMaketMobile';

const STEPS = ['name', 'email', 'password', 'phone', 'review'] as const;
type Step = typeof STEPS[number];

interface SignupWizardProps {
  switchMode: () => void;
}

export default function SignupWizard({ switchMode }: SignupWizardProps) {
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

  // Real-time email availability
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const [emailChecking, setEmailChecking] = useState(false);
  const emailCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleGoogle = async () => {
    try {
      setGoogleLoading(true);
      const Crypto = require('expo-crypto');
      const WebBrowser = require('expo-web-browser');
      WebBrowser.maybeCompleteAuthSession();

      const state = Crypto.randomUUID();
      const nonce = Crypto.randomUUID();

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${GOOGLE_WEB_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}` +
        `&response_type=id_token` +
        `&scope=${encodeURIComponent('openid profile email')}` +
        `&state=${state}` +
        `&nonce=${nonce}`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, GOOGLE_REDIRECT_URI);

      if (result.type === 'success' && result.url) {
        const hash = result.url.split('#')[1] || '';
        const params = new URLSearchParams(hash);
        const idToken = params.get('id_token');
        if (idToken) {
          const res = await googleAuth(idToken) as { user: User; token: string };
          await store.setUser(res.user, res.token);
        } else {
          setErrors({ google: 'No ID token received from Google' });
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
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const pwLen = password.length;
  const pwOk = pwLen >= 6 && pwLen <= 128;
  const pwScore = pwLen === 0 ? 0 : pwLen < 6 ? 1 : pwLen < 10 ? 2 : 3;

  // Debounced email availability check
  const checkEmailAvailability = useCallback(async (emailToCheck: string) => {
    if (!emailValid) {
      setEmailAvailable(null);
      return;
    }
    setEmailChecking(true);
    try {
      const res = await fetch(`${API_BASE}/auth/check-email?email=${encodeURIComponent(emailToCheck)}`);
      const data = await res.json();
      setEmailAvailable(data.available);
      if (!data.available) {
        setErrors(prev => ({ ...prev, email: 'This email is already registered' }));
      } else {
        setErrors(prev => { const next = { ...prev }; delete next.email; return next; });
      }
    } catch {
      setEmailAvailable(null);
    } finally {
      setEmailChecking(false);
    }
  }, [emailValid]);

  useEffect(() => {
    if (emailCheckTimer.current) clearTimeout(emailCheckTimer.current);
    if (emailValid && email.length > 5) {
      emailCheckTimer.current = setTimeout(() => checkEmailAvailability(email), 500);
    } else {
      setEmailAvailable(null);
    }
    return () => { if (emailCheckTimer.current) clearTimeout(emailCheckTimer.current); };
  }, [email, emailValid, checkEmailAvailability]);

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
      if (emailAvailable === false) { setErrors({ email: 'This email is already registered' }); return; }
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

  if (entered) {
    return <WelcomeMoment name={[firstName, middleName, lastName].filter(Boolean).join(' ')} onEnter={() => {}} />;
  }

  return (
    <>
      <View style={styles.centeredHeader}>
        <Text style={styles.brand}>Maur<Text style={styles.brandAccent}>Maket</Text></Text>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>Join Haiti's marketplace</Text>
      </View>

      {/* Step content */}
      <View style={styles.stepContent}>
        {stepIdx > 0 && (
          <TouchableOpacity onPress={goBack} style={styles.backBtnInline}>
            <MaterialCommunityIcons name="arrow-left" size={18} color={COLORS.text2} />
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>
        )}
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
              loading={emailChecking}
              rightIcon={emailAvailable === true ? 'check-circle' : emailAvailable === false ? 'close-circle' : undefined}
              rightColor={emailAvailable ? COLORS.green : COLORS.coral}
            />
            {!emailValid && email.length === 0 && <Text style={styles.hint}>Order updates and receipts go here</Text>}
            {emailValid && emailAvailable === true && <Text style={[styles.hint, { color: COLORS.green }]}>✓ Email is available</Text>}
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
              (step === 'email' && (!emailValid || emailAvailable === false)) ||
              (step === 'password' && !pwOk)
            ) && styles.btnDisabled]}
            onPress={validateAndNext}
            disabled={
              (step === 'name' && (!firstName.trim() || !lastName.trim())) ||
              (step === 'email' && (!emailValid || emailAvailable === false)) ||
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

const styles = StyleSheet.create({
  centeredHeader: { alignItems: 'center', marginBottom: 36, marginTop: SPACING.xl },
  brand: { fontFamily: 'Syne', fontSize: 20, fontWeight: '800', color: COLORS.text },
  brandAccent: { color: COLORS.coral },
  title: { fontFamily: 'Syne', fontSize: 34, fontWeight: '800', color: COLORS.text, marginBottom: 8, textAlign: 'center', marginTop: 12 },
  subtitle: { color: COLORS.text2, fontSize: 15, textAlign: 'center' },

  stepContent: { flex: 1, marginTop: 22 },
  backBtnInline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  backBtnText: { color: COLORS.text2, fontSize: 14, fontWeight: '500' },

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

  strengthRow: { flexDirection: 'row', gap: 5, marginTop: 12 },
  strengthBar: { height: 4, flex: 1, borderRadius: 2 },

  reviewCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.card, paddingHorizontal: 16,
  },

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

  hint: { color: COLORS.text2, fontSize: 12.5, marginTop: 8 },
  subtleLink: { color: COLORS.blue, fontSize: 13.5, fontWeight: '600', marginTop: 14 },
});
