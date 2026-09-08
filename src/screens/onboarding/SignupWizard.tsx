import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../../theme';
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

const STEPS = ['name', 'email', 'password', 'phone', 'dob', 'review'] as const;
type Step = typeof STEPS[number];

interface SignupWizardProps {
  switchMode: () => void;
}

function ProgressRail({ stepIdx }: { stepIdx: number }) {
  return (
    <View style={styles.progressWrap}>
      <View style={styles.progressMeta}>
        <Text style={styles.progressLabel}>Create account</Text>
        <Text style={styles.progressCount}>{Math.min(stepIdx + 1, STEPS.length)} / {STEPS.length}</Text>
      </View>
      <View style={styles.progressTrack}>
        {STEPS.map((item, index) => (
          <View
            key={item}
            style={[
              styles.progressSegment,
              index <= stepIdx && styles.progressSegmentActive,
              index === stepIdx && styles.progressSegmentCurrent,
            ]}
          />
        ))}
      </View>
    </View>
  );
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
  const [birthMonth, setBirthMonth] = useState<number | null>(null);
  const [birthDay, setBirthDay] = useState<number | null>(null);
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [entered, setEntered] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [userResult, setUserResult] = useState<{ user: User; token: string } | null>(null);

  const transition = useRef(new Animated.Value(1)).current;
  const previousStep = useRef(0);
  const emailCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const [emailChecking, setEmailChecking] = useState(false);

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
      setErrors({ google: err instanceof Error ? err.message : 'Google sign-in failed' });
    } finally {
      setGoogleLoading(false);
    }
  };

  const step: Step = STEPS[stepIdx];
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const pwLen = password.length;
  const pwOk = pwLen >= 6 && pwLen <= 128;
  const pwScore = pwLen === 0 ? 0 : pwLen < 6 ? 1 : pwLen < 10 ? 2 : 3;

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

  useEffect(() => {
    const direction = stepIdx >= previousStep.current ? 1 : -1;
    previousStep.current = stepIdx;
    transition.setValue(0);
    Animated.spring(transition, {
      toValue: 1,
      friction: 8,
      tension: 70,
      useNativeDriver: true,
    }).start();
    // Direction is represented through the initial value using a native transform.
    void direction;
  }, [stepIdx, transition]);

  const goNext = () => {
    setErrors({});
    setStepIdx(i => Math.min(i + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setErrors({});
    setStepIdx(i => Math.max(i - 1, 0));
  };

  const validateAndNext = () => {
    if (step === 'name' && (!firstName.trim() || !lastName.trim())) {
      setErrors({ name: "First and last name help sellers know who they're talking to" });
      return;
    }
    if (step === 'email') {
      if (!emailValid) { setErrors({ email: "That doesn't look like a full email address" }); return; }
      if (emailAvailable === false) { setErrors({ email: 'This email is already registered' }); return; }
    }
    if (step === 'password' && !pwOk) {
      setErrors({ password: 'Needs at least 6 characters' });
      return;
    }
    if (step === 'dob') {
      if (!birthMonth || !birthDay || !birthYear) {
        setErrors({ dob: 'Please enter your full date of birth' });
        return;
      }
      const dob = new Date(birthYear, birthMonth - 1, birthDay);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const monthDelta = today.getMonth() - dob.getMonth();
      if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) age--;
      if (age < 18) { setErrors({ dob: 'You must be at least 18 years old' }); return; }
    }
    goNext();
  };

  const submitSignup = async () => {
    setLoading(true);
    setErrors({});
    const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ').trim();
    const dobStr = birthYear && birthMonth && birthDay
      ? `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`
      : '';
    try {
      const res = await apiSignup(fullName, email, password, phoneDigits, dobStr) as { user: User; token: string };
      setUserResult(res);
      setEntered(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Signup failed';
      setErrors({ email: message });
      setStepIdx(1);
    } finally {
      setLoading(false);
    }
  };

  const handleEnterApp = async () => {
    if (userResult) await store.setUser(userResult.user, userResult.token);
  };

  if (entered) {
    return <WelcomeMoment name={[firstName, middleName, lastName].filter(Boolean).join(' ')} onEnter={handleEnterApp} />;
  }

  const canContinue =
    (step === 'name' && !!firstName.trim() && !!lastName.trim()) ||
    (step === 'email' && emailValid && emailAvailable !== false) ||
    (step === 'password' && pwOk) ||
    (step === 'phone') ||
    (step === 'dob' && !!birthMonth && !!birthDay && !!birthYear);

  return (
    <View style={styles.container}>
      <ProgressRail stepIdx={stepIdx} />

      <Animated.View
        style={[
          styles.stepSurface,
          {
            opacity: transition,
            transform: [{ translateY: transition.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          },
        ]}
      >
        {stepIdx > 0 && (
          <TouchableOpacity onPress={goBack} style={styles.backBtn} hitSlop={8}>
            <MaterialCommunityIcons name="arrow-left" size={17} color={COLORS.text2} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        )}

        {step === 'name' && (
          <>
            <StepHeading eyebrow="Let's start with you" title="What's your name?" />
            <AuthInput icon="account-outline" value={firstName} onChangeText={setFirstName} placeholder="First name" autoFocus />
            <AuthInput icon="account-outline" value={lastName} onChangeText={setLastName} placeholder="Last name" error={errors.name} />
            {showMiddle ? (
              <AuthInput icon="account-outline" value={middleName} onChangeText={setMiddleName} placeholder="Middle name (optional)" />
            ) : (
              <TouchableOpacity onPress={() => setShowMiddle(true)} style={styles.secondaryAction}>
                <MaterialCommunityIcons name="plus" size={15} color={COLORS.blue} />
                <Text style={styles.subtleLink}>Add a middle name</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {step === 'email' && (
          <>
            <StepHeading eyebrow="How we reach you" title="What's your email?" />
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
              autoFocus
            />
            <View style={styles.infoLine}>
              <MaterialCommunityIcons name="information-outline" size={14} color={COLORS.text2} />
              <Text style={styles.hint}>Order updates and receipts go here.</Text>
            </View>
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
              autoFocus
            />
            <View style={styles.strengthWrap}>
              <View style={styles.strengthRow}>
                {[0, 1, 2].map(i => (
                  <View
                    key={i}
                    style={[styles.strengthBar, pwScore > i && { backgroundColor: [COLORS.coral, COLORS.yellow, COLORS.green][pwScore - 1] }]}
                  />
                ))}
              </View>
              <Text style={[styles.hint, pwOk && { color: COLORS.green }]}>
                {pwOk ? 'Good — that works' : `${pwLen}/6 characters minimum`}
              </Text>
            </View>
            <View style={styles.securityCard}>
              <MaterialCommunityIcons name="shield-lock-outline" size={18} color={COLORS.green} />
              <Text style={styles.securityText}>Your password is never shown to sellers or stored in plain text.</Text>
            </View>
          </>
        )}

        {step === 'phone' && (
          <>
            <StepHeading eyebrow="Optional, but handy for meetups" title="Add a phone number?" />
            <View style={styles.phoneRow}>
              <MaterialCommunityIcons name="phone-outline" size={19} color={COLORS.text2} />
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
                selectionColor={COLORS.coral}
                autoFocus
              />
              {phoneDigits.length >= 8 && <MaterialCommunityIcons name="check-circle" size={18} color={COLORS.green} />}
            </View>
            <Text style={styles.hint}>Used for buyer-seller meetup coordination. Never shown publicly.</Text>
            <TouchableOpacity onPress={goNext} style={styles.skipAction}>
              <Text style={styles.subtleLink}>Skip for now</Text>
              <MaterialCommunityIcons name="arrow-right" size={14} color={COLORS.blue} />
            </TouchableOpacity>
          </>
        )}

        {step === 'dob' && (
          <>
            <StepHeading eyebrow="Required for account safety" title="When's your birthday?" />
            <View style={styles.infoLine}>
              <MaterialCommunityIcons name="shield-check-outline" size={14} color={COLORS.green} />
              <Text style={styles.hint}>You must be 18 or older. This isn't shown publicly.</Text>
            </View>
            <View style={styles.dobRow}>
              <View style={styles.dobCol}>
                <Text style={styles.dobLabel}>Month</Text>
                <ScrollView style={styles.dobScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                  {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                    <TouchableOpacity key={i} style={[styles.dobItem, birthMonth === i + 1 && styles.dobItemActive]} onPress={() => setBirthMonth(i + 1)}>
                      <Text style={[styles.dobItemText, birthMonth === i + 1 && styles.dobItemTextActive]}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={styles.dobCol}>
                <Text style={styles.dobLabel}>Day</Text>
                <ScrollView style={styles.dobScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                    <TouchableOpacity key={d} style={[styles.dobItem, birthDay === d && styles.dobItemActive]} onPress={() => setBirthDay(d)}>
                      <Text style={[styles.dobItemText, birthDay === d && styles.dobItemTextActive]}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={styles.dobCol}>
                <Text style={styles.dobLabel}>Year</Text>
                <ScrollView style={styles.dobScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                  {Array.from({ length: 80 }, (_, i) => new Date().getFullYear() - 18 - i).map(y => (
                    <TouchableOpacity key={y} style={[styles.dobItem, birthYear === y && styles.dobItemActive]} onPress={() => setBirthYear(y)}>
                      <Text style={[styles.dobItemText, birthYear === y && styles.dobItemTextActive]}>{y}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
            {errors.dob && <Text style={styles.dobError}>{errors.dob}</Text>}
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
              <ReviewRow label="Birthday" value={birthMonth && birthDay && birthYear ? `${birthMonth}/${birthDay}/${birthYear}` : 'Not provided'} muted={!birthMonth} />
            </View>
            <View style={styles.reviewNote}>
              <MaterialCommunityIcons name="lock-check" size={17} color={COLORS.green} />
              <Text style={styles.reviewNoteText}>One last step. We’ll keep your account details private and use them only to run MaurMaket safely.</Text>
            </View>
          </>
        )}
      </Animated.View>

      <View style={styles.footer}>
        {step !== 'review' ? (
          <TouchableOpacity
            style={[styles.primaryBtn, !canContinue && styles.btnDisabled]}
            onPress={step === 'phone' ? goNext : validateAndNext}
            disabled={!canContinue}
            activeOpacity={0.86}
          >
            <Text style={styles.primaryBtnText}>{step === 'phone' ? (phoneDigits ? 'Continue' : 'Skip & continue') : 'Continue'}</Text>
            <View style={styles.btnIcon}><MaterialCommunityIcons name="arrow-right" size={17} color="#fff" /></View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.primaryBtn, loading && styles.btnDisabled]} onPress={submitSignup} disabled={loading} activeOpacity={0.86}>
            <MaterialCommunityIcons name="check-decagram-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>{loading ? t('common.loading') : 'Create my account'}</Text>
          </TouchableOpacity>
        )}

        {stepIdx === 0 && (
          <>
            <Divider />
            <TouchableOpacity style={[styles.googleBtn, googleLoading && styles.btnDisabled]} onPress={handleGoogle} disabled={googleLoading} activeOpacity={0.86}>
              <MaterialCommunityIcons name="google" size={20} color="#4285F4" />
              <Text style={styles.googleBtnText}>{googleLoading ? 'Connecting…' : t('auth.googleSignIn')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={switchMode} style={styles.switchBtn}>
              <Text style={styles.switchText}>{t('auth.hasAccount')} <Text style={styles.switchLink}>{t('auth.signIn')}</Text></Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 22 },
  progressWrap: { marginBottom: 28 },
  progressMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  progressLabel: { color: COLORS.text, fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
  progressCount: { color: COLORS.text2, fontSize: 11.5, fontWeight: '700' },
  progressTrack: { flexDirection: 'row', gap: 5 },
  progressSegment: { flex: 1, height: 4, borderRadius: 999, backgroundColor: COLORS.border },
  progressSegmentActive: { backgroundColor: COLORS.coral },
  progressSegmentCurrent: { opacity: 1, height: 5 },
  stepSurface: { minHeight: 385 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: 13, paddingVertical: 4 },
  backText: { color: COLORS.text2, fontSize: 13, fontWeight: '600' },
  secondaryAction: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', marginTop: 1, paddingVertical: 8 },
  subtleLink: { color: COLORS.blue, fontSize: 13.5, fontWeight: '700' },
  infoLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 2 },
  hint: { flex: 1, color: COLORS.text2, fontSize: 12.5, lineHeight: 18 },
  strengthWrap: { marginTop: 3 },
  strengthRow: { flexDirection: 'row', gap: 5, marginBottom: 7 },
  strengthBar: { flex: 1, height: 4, borderRadius: 999, backgroundColor: COLORS.border },
  securityCard: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, marginTop: 16, borderRadius: RADIUS.card, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  securityText: { flex: 1, color: COLORS.text2, fontSize: 12.5, lineHeight: 17 },
  phoneRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.card, paddingHorizontal: 15 },
  phonePrefix: { color: COLORS.text2, fontWeight: '700', fontSize: 16 },
  phoneDivider: { width: 1, height: 21, backgroundColor: COLORS.border },
  phoneInput: { flex: 1, color: COLORS.text, fontSize: 16, fontWeight: '600', padding: 0, letterSpacing: 1 },
  skipAction: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 13 },
  dobRow: { flexDirection: 'row', gap: 9, marginTop: 16 },
  dobCol: { flex: 1 },
  dobLabel: { fontSize: 10.5, fontWeight: '800', color: COLORS.text2, textTransform: 'uppercase', marginBottom: 7, textAlign: 'center', letterSpacing: 0.5 },
  dobScroll: { maxHeight: 172, backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.card },
  dobItem: { paddingVertical: 10, alignItems: 'center' },
  dobItemActive: { backgroundColor: COLORS.coral + '18' },
  dobItemText: { fontSize: 14.5, color: COLORS.text2, fontWeight: '600' },
  dobItemTextActive: { color: COLORS.coral, fontWeight: '800' },
  dobError: { color: COLORS.coral, fontSize: 12.5, marginTop: 8 },
  reviewCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.card, paddingHorizontal: 16 },
  reviewNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 14, padding: 12, borderRadius: RADIUS.card, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  reviewNoteText: { flex: 1, color: COLORS.text2, fontSize: 12, lineHeight: 17 },
  footer: { marginTop: 18, paddingBottom: SPACING.lg },
  primaryBtn: { minHeight: 56, backgroundColor: COLORS.coral, paddingHorizontal: 17, borderRadius: RADIUS.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, shadowColor: COLORS.coral, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 24, elevation: 8 },
  btnIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  btnDisabled: { opacity: 0.45, shadowOpacity: 0 },
  primaryBtnText: { color: '#fff', fontSize: 15.5, fontWeight: '800' },
  googleBtn: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 14, borderRadius: RADIUS.pill, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  googleBtnText: { color: COLORS.text, fontSize: 14.5, fontWeight: '700' },
  switchBtn: { alignItems: 'center', paddingVertical: 12 },
  switchText: { color: COLORS.text2, fontSize: 13 },
  switchLink: { color: COLORS.coral, fontWeight: '800' },
});