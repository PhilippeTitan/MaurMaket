import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Animated,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../../theme';
import { useTranslation } from '@/localization';
import { signup as apiSignup, API_BASE } from '../../api';
import { store } from '../../store';
import AuthInput from '@/components/AuthInput';
import StepHeading from './components/StepHeading';
import ReviewRow from './components/ReviewRow';
import Divider from './components/Divider';
import AuthBadge, { AuthGlyph } from './components/AuthBadge';
import ProgressTrail from './components/ProgressTrail';
import PasskeyButton from './components/PasskeyButton';
import WelcomeMoment from '../../components/WelcomeMoment';
import type { User } from '../../types';
import AuthMethodsCard from '../../components/AuthMethodsCard';

const STEPS = ['name', 'email', 'password', 'phone', 'dob', 'review'] as const;
type Step = typeof STEPS[number];

const STEP_LABELS: Record<Step, string> = {
  name: 'signup.aboutYou', email: 'signup.emailTitle', password: 'signup.createPassword',
  phone: 'signup.phoneTitle', dob: 'signup.birthdayTitle', review: 'signup.reviewTitle',
};
const STEP_GLYPHS: Record<Step, AuthGlyph> = {
  name: 'name', email: 'email', password: 'password',
  phone: 'phone', dob: 'dob', review: 'review',
};

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
  const [birthMonth, setBirthMonth] = useState<number | null>(null);
  const [birthDay, setBirthDay] = useState<number | null>(null);
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [entered, setEntered] = useState(false);
  const [userResult, setUserResult] = useState<{ user: User; token: string } | null>(null);
  const stepFade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    stepFade.setValue(0);
    Animated.timing(stepFade, { toValue: 1, duration: 360, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx]);

  // Real-time email availability
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const [emailChecking, setEmailChecking] = useState(false);
  const emailCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const res = await fetch(`${API_BASE}/user/check-email?email=${encodeURIComponent(emailToCheck)}`);
      const data = await res.json();
      setEmailAvailable(data.available);
      if (!data.available) {
        setErrors(prev => ({ ...prev, email: t('signup.emailTaken') }));
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
        setErrors({ name: t('signup.nameError') });
        return;
      }
    }
    if (step === 'email') {
      if (!emailValid) { setErrors({ email: t('signup.emailInvalid') }); return; }
      if (emailAvailable === false) { setErrors({ email: t('signup.emailTaken') }); return; }
    }
    if (step === 'password') {
      if (!pwOk) { setErrors({ password: t('signup.passwordError') }); return; }
    }
    if (step === 'dob') {
      if (!birthMonth || !birthDay || !birthYear) { setErrors({ dob: t('signup.dobError') }); return; }
      const dob = new Date(birthYear, birthMonth - 1, birthDay);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
      if (age < 18) { setErrors({ dob: t('signup.dobAgeError') }); return; }
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
    if (userResult) {
      await store.setUser(userResult.user, userResult.token);
    }
  };

  if (entered) {
    return <WelcomeMoment name={[firstName, middleName, lastName].filter(Boolean).join(' ')} onEnter={handleEnterApp} />;
  }

  return (
    <>
      {stepIdx === 0 ? (
        <View style={styles.centeredHeader}>
          <AuthBadge variant="name" />
          <Text style={styles.brand}>Maur<Text style={styles.brandAccent}>Maket</Text></Text>
          <Text style={styles.title}>{t('signup.createAccount')}</Text>
          <Text style={styles.subtitle}>{t('signup.joinHaiti')}</Text>
        </View>
      ) : (
        <View style={styles.wizardHeader}>
          <ProgressTrail step={stepIdx + 1} total={STEPS.length} label={t(STEP_LABELS[step])} />
          <AuthBadge variant={STEP_GLYPHS[step]} />
        </View>
      )}

      {/* Step content */}
      <Animated.View
        style={[
          styles.stepContent,
          {
            opacity: stepFade,
            transform: [{ translateX: stepFade.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
          },
        ]}
      >
        {stepIdx > 0 && (
          <TouchableOpacity onPress={goBack} style={styles.backBtnInline}>
            <MaterialCommunityIcons name="arrow-left" size={18} color={COLORS.text2} />
            <Text style={styles.backBtnText}>{t('signup.back')}</Text>
          </TouchableOpacity>
        )}
        {step === 'name' && (
          <>
            <StepHeading eyebrow={t('signup.aboutYou')} title={t('signup.whatsName')} />
            <AuthInput
              icon="account-outline"
              value={firstName}
              onChangeText={setFirstName}
              placeholder={t('signup.firstName')}
              autoFocus
            />
            <AuthInput
              icon="account-outline"
              value={lastName}
              onChangeText={setLastName}
              placeholder={t('signup.lastName')}
              error={errors.name}
            />
            {showMiddle ? (
              <AuthInput
                icon="account-outline"
                value={middleName}
                onChangeText={setMiddleName}
                placeholder={t('signup.middleName')}
              />
            ) : (
              <TouchableOpacity onPress={() => setShowMiddle(true)}>
                <Text style={styles.subtleLink}>{t('signup.addMiddle')}</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {step === 'email' && (
          <>
            <StepHeading eyebrow={t('signup.emailSubtitle')} title={t('signup.emailTitle')} />
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
            {!emailValid && email.length === 0 && <Text style={styles.hint}>{t('signup.emailHint')}</Text>}
            {emailValid && emailAvailable === true && <Text style={[styles.hint, { color: COLORS.green }]}>{t('signup.emailAvailable')}</Text>}
          </>
        )}

        {step === 'password' && (
          <>
            <StepHeading eyebrow={t('signup.passwordSubtitle')} title={t('signup.createPassword')} />
            <AuthInput
              icon="lock-outline"
              value={password}
              onChangeText={setPassword}
              placeholder={t('signup.passwordPlaceholder')}
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
              {pwOk ? t('signup.passwordGood') : t('signup.passwordMin', { count: String(pwLen) })}
            </Text>
          </>
        )}

        {step === 'phone' && (
          <>
            <StepHeading eyebrow={t('signup.phoneSubtitle')} title={t('signup.phoneTitle')} />
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
            <Text style={styles.hint}>{t('signup.phoneHint')}</Text>
            <TouchableOpacity onPress={goNext}>
              <Text style={styles.subtleLink}>{t('signup.phoneSkip')}</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'dob' && (
          <>
            <StepHeading eyebrow={t('signup.birthdaySubtitle')} title={t('signup.birthdayTitle')} />
            <Text style={styles.hint}>{t('signup.birthdayHint')}</Text>
            <View style={styles.dobRow}>
              <View style={styles.dobCol}>
                <Text style={styles.dobLabel}>{t('signup.month')}</Text>
                <ScrollView style={styles.dobScroll} showsVerticalScrollIndicator={false}>
                  {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.dobItem, birthMonth === i + 1 && styles.dobItemActive]}
                      onPress={() => setBirthMonth(i + 1)}
                    >
                      <Text style={[styles.dobItemText, birthMonth === i + 1 && styles.dobItemTextActive]}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={styles.dobCol}>
                <Text style={styles.dobLabel}>{t('signup.day')}</Text>
                <ScrollView style={styles.dobScroll} showsVerticalScrollIndicator={false}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                    <TouchableOpacity
                      key={d}
                      style={[styles.dobItem, birthDay === d && styles.dobItemActive]}
                      onPress={() => setBirthDay(d)}
                    >
                      <Text style={[styles.dobItemText, birthDay === d && styles.dobItemTextActive]}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={styles.dobCol}>
                <Text style={styles.dobLabel}>{t('signup.year')}</Text>
                <ScrollView style={styles.dobScroll} showsVerticalScrollIndicator={false}>
                  {Array.from({ length: 80 }, (_, i) => new Date().getFullYear() - 18 - i).map(y => (
                    <TouchableOpacity
                      key={y}
                      style={[styles.dobItem, birthYear === y && styles.dobItemActive]}
                      onPress={() => setBirthYear(y)}
                    >
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
            <StepHeading eyebrow={t('signup.reviewSubtitle')} title={t('signup.reviewTitle')} />
            <View style={styles.reviewCard}>
              <ReviewRow label={t('signup.reviewName')} value={[firstName, middleName, lastName].filter(Boolean).join(' ')} />
              <ReviewRow label={t('signup.reviewEmail')} value={email} />
              <ReviewRow label={t('signup.reviewPassword')} value={'•'.repeat(Math.min(pwLen, 10))} />
              <ReviewRow label={t('signup.reviewPhone')} value={phoneDigits ? `+509 ${phoneDigits}` : t('signup.notAdded')} muted={!phoneDigits} />
              <ReviewRow label={t('signup.reviewBirthday')} value={birthMonth && birthDay && birthYear ? `${birthMonth}/${birthDay}/${birthYear}` : t('signup.notProvided')} muted={!birthMonth} />
            </View>
          </>
        )}
      </Animated.View>

      {/* Footer */}
      <View style={styles.footer}>
        {step !== 'review' ? (
          <TouchableOpacity
            style={[styles.primaryBtn, (
              (step === 'name' && (!firstName.trim() || !lastName.trim())) ||
              (step === 'email' && (!emailValid || emailAvailable === false)) ||
              (step === 'password' && !pwOk) ||
              (step === 'dob' && (!birthMonth || !birthDay || !birthYear))
            ) && styles.btnDisabled]}
            onPress={validateAndNext}
            disabled={
              (step === 'name' && (!firstName.trim() || !lastName.trim())) ||
              (step === 'email' && (!emailValid || emailAvailable === false)) ||
              (step === 'password' && !pwOk) ||
              (step === 'dob' && (!birthMonth || !birthDay || !birthYear))
            }
          >
            <Text style={styles.primaryBtnText}>{t('signup.continue')}</Text>
            <MaterialCommunityIcons name="arrow-right" size={17} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.btnDisabled]}
            onPress={submitSignup}
            disabled={loading}
          >
            <MaterialCommunityIcons name="check-decagram" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>{loading ? t('common.loading') : t('signup.createBtn')}</Text>
          </TouchableOpacity>
        )}

        {stepIdx === 0 && (
          <>
            <Divider />
            <View style={styles.altMethods}>
              <PasskeyButton />
            </View>
            <AuthMethodsCard compact />
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
  wizardHeader: { marginTop: SPACING.lg, marginBottom: 4, alignItems: 'stretch' },
  altMethods: { gap: 12 },
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
  dobRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  dobCol: { flex: 1 },
  dobLabel: { fontSize: 11, fontWeight: '700', color: COLORS.text2, textTransform: 'uppercase', marginBottom: 6, textAlign: 'center' },
  dobScroll: { maxHeight: 160, backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.card },
  dobItem: { paddingVertical: 10, alignItems: 'center' },
  dobItemActive: { backgroundColor: COLORS.coral + '18' },
  dobItemText: { fontSize: 15, color: COLORS.text2, fontWeight: '500' },
  dobItemTextActive: { color: COLORS.coral, fontWeight: '700' },
  dobError: { color: COLORS.coral, fontSize: 12.5, marginTop: 8 },
});
