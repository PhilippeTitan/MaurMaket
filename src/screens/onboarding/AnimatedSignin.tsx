import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, Modal, Image, ScrollView,
  Easing, Platform, KeyboardAvoidingView, Keyboard,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import Svg, { Circle, Rect, Path, Defs, LinearGradient as SvgLinearGradient, Stop, G as SvgG } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, RADIUS, FONTS } from '../../theme';
import { useTranslation } from '@/localization';
import { login as apiLogin, completeTwoFactorLogin, googleAuth, passkeyAuth, PasskeyUnavailableError } from '../../api';
import { store } from '../../store';
import OnboardingBackground from './components/OnboardingBackground';
import type { User } from '../../types';
import { useViewport, CONTENT_MAX_WIDTH, SCREEN_GUTTER } from '@/hooks';
import { useReduceMotion } from '@/hooks/useReduceMotion';

const C = {
  bg0: COLORS.bg,
  bg1: COLORS.bg,
  surface: COLORS.surface,
  surfaceHi: COLORS.surface2,
  border: COLORS.border,
  borderHi: COLORS.borderLight,
  text: COLORS.text,
  sub: COLORS.text2,
  faint: COLORS.text3,
  violet: COLORS.coral,
  pink: COLORS.coralLight,
  amber: COLORS.warning,
  mint: COLORS.green,
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

function Field({ icon, label, value, onChangeText, placeholder, secureTextEntry, right, onFocus, keyboardType }: {
  icon: any; label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; secureTextEntry?: boolean; right?: React.ReactNode; onFocus?: () => void; keyboardType?: 'default' | 'number-pad';
}) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  return (
    <View style={[s.field, focused && s.fieldFocused]}>
      {/* Tapping anywhere in the box (icon, label, empty space) focuses the input. */}
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => inputRef.current?.focus()}
        accessibilityRole="none"
        style={s.fieldTap}
      >
        <MaterialCommunityIcons name={icon} size={18} color={focused ? C.violet : C.faint} />
        <View style={{ flex: 1 }}>
          <Text style={s.fieldLabel}>{label}</Text>
          <TextInput
            ref={inputRef}
            style={s.fieldInput}
            value={value}
            onChangeText={onChangeText}
            onFocus={() => { setFocused(true); onFocus?.(); }}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            placeholderTextColor={C.faint}
            secureTextEntry={secureTextEntry}
            keyboardType={keyboardType}
            autoCapitalize="none"
          />
        </View>
      </TouchableOpacity>
      {right}
    </View>
  );
}

/** Ghost keyboard row — the whole box is a tap target that focuses its input. */
function GhostField({ icon, label, value, onChangeText, placeholder, secureTextEntry, active, right }: {
  icon: any; label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; secureTextEntry?: boolean; active?: boolean; right?: React.ReactNode;
}) {
  const inputRef = useRef<TextInput>(null);

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => inputRef.current?.focus()}
      accessibilityRole="none"
      style={[s.field, active && s.fieldFocused]}
    >
      <MaterialCommunityIcons name={icon} size={18} color={active ? C.violet : C.sub} />
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={s.fieldLabel}>{label}</Text>
        <TextInput
          ref={inputRef}
          autoFocus={active}
          style={s.fieldInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.sub}
          secureTextEntry={secureTextEntry}
          autoCapitalize="none"
        />
      </View>
      {right}
    </TouchableOpacity>
  );
}

function PrimaryButton({ children, onPress, disabled }: { children: React.ReactNode; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.85} style={[s.primaryTouch, disabled ? { opacity: 0.7 } : null]}>
      <View style={[s.primaryBtn, disabled && s.primaryBtnDisabled]}>
        <Text style={[s.primaryBtnText, disabled && { color: C.faint }]}>{children}</Text>
      </View>
    </TouchableOpacity>
  );
}

/* ── Main Component ───────────────────────────────────────── */

interface Props {
  onSwitchToSignup: () => void;
  onForgotPassword: () => void;
  onAccountMissing?: () => void;
}

export default function AnimatedSignin({ onSwitchToSignup, onForgotPassword, onAccountMissing }: Props) {
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  const vp = useViewport();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [usingBackupCode, setUsingBackupCode] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const ghostOpacity = useRef(new Animated.Value(1)).current;
  const keyboardLift = useRef(new Animated.Value(0)).current;

  // Animations
  const fadeIn = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;

  // Success celebration animations
  const successAnim = useRef(new Animated.Value(0)).current;
  const formOpacity = useRef(new Animated.Value(1)).current;
  const welcomeOpacity = useRef(new Animated.Value(0)).current;
  const welcomeScale = useRef(new Animated.Value(0.82)).current;
  const welcomeTranslateY = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    if (reduceMotion) {
      fadeIn.setValue(1);
      spin.setValue(0);
      return;
    }
    Animated.timing(fadeIn, { toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const spinLoop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true }));
    spinLoop.start();
    return () => spinLoop.stop();
  }, [fadeIn, reduceMotion, spin]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, event => {
      setKeyboardHeight(event.endCoordinates.height);
      Animated.timing(keyboardLift, { toValue: -92, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      setFocusedField(null);
      Animated.timing(keyboardLift, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });
    return () => { showSubscription.remove(); hideSubscription.remove(); };
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

  const playSuccessAndEnter = (user: User, token: string) => {
    Keyboard.dismiss();
    setIsSuccess(true);

    Animated.parallel([
      // 1. Form gracefully fades out & shifts down slightly
      Animated.timing(formOpacity, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      // 2. Logo text shrinks and moves up towards header
      Animated.timing(successAnim, {
        toValue: 1,
        duration: 650,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: true,
      }),
      // 3. Welcome back banner springs & blooms into place
      Animated.sequence([
        Animated.delay(120),
        Animated.parallel([
          Animated.timing(welcomeOpacity, {
            toValue: 1,
            duration: 400,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.spring(welcomeScale, {
            toValue: 1,
            friction: 7,
            tension: 40,
            useNativeDriver: true,
          }),
          Animated.timing(welcomeTranslateY, {
            toValue: 0,
            duration: 450,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start(() => {
      // Keep the welcome moment visible long enough to register before
      // switching the root navigation into the authenticated app.
      setTimeout(async () => {
        await store.setUser(user, token);
      }, 1700);
    });
  };

  const handleLogin = async () => {
    if (!canSubmit || isSuccess) return;
    setLoading(true);
    try {
      const res = await apiLogin(email.trim(), password) as { user?: User; token?: string; requiresTwoFactor?: boolean };
      if (res.requiresTwoFactor) {
        setRequiresTwoFactor(true);
        setErrorMessage(null);
        return;
      }
      if (!res.user || !res.token) throw new Error('Sign in did not return an authenticated session.');
      playSuccessAndEnter(res.user, res.token);
    } catch (err: any) {
      const message = String(err?.message || '').toLowerCase();
      if (onAccountMissing && (message.includes('user not found') || message.includes('email not found'))) {
        onAccountMissing();
      } else {
        setErrorMessage(err?.message || t('signin.incorrectCredentials'));
        triggerShake();
      }
    } finally { setLoading(false); }
  };

  const handleTwoFactorLogin = async () => {
    if (twoFactorCode.trim().length < 6 || loading || isSuccess) return;
    setLoading(true);
    try {
      const res = await completeTwoFactorLogin(twoFactorCode.trim(), usingBackupCode) as { user: User; token: string };
      playSuccessAndEnter(res.user, res.token);
    } catch (err: any) {
      setErrorMessage(err?.message || 'That verification code was not accepted.');
      triggerShake();
    } finally { setLoading(false); }
  };

  const handleGhostSignIn = () => {
    if (!canSubmit || loading) return;
    Keyboard.dismiss();
    setFocusedField(null);
    handleLogin();
  };

  const handleGoogle = async () => {
    if (isSuccess) return;
    try {
      setGoogleLoading(true);
      const res = await googleAuth() as { user: User; token: string };
      playSuccessAndEnter(res.user, res.token);
    } catch (err: any) { setErrorMessage(err?.message || t('signin.googleFailed')); }
    finally { setGoogleLoading(false); }
  };

  const handlePasskey = async () => {
    if (isSuccess) return;
    try {
      setPasskeyLoading(true);
      const res = await passkeyAuth() as { user: User; token: string };
      playSuccessAndEnter(res.user, res.token);
    } catch (err: any) {
      if (err instanceof PasskeyUnavailableError) {
        setErrorMessage(t('signin.passkeyUnavailable'));
      } else {
        setErrorMessage(err?.message || t('signin.passkeyFailed'));
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg0 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <View style={{ flex: 1, backgroundColor: C.bg0 }}>
        <OnboardingBackground />

        {/* The column scrolls rather than squashing: it centres itself while the window can
            hold it, and on a window that cannot (short phone, landscape, split screen, small
            browser window) the user scrolls to the last link instead of losing it off the
            bottom. flexGrow + the column's own flex:1 is what keeps it centred. */}
        <ScrollView
          style={s.screenScroll}
          contentContainerStyle={[
            s.screenScrollContent,
            {
              paddingTop: Math.max(insets.top, SPACING.lg),
              paddingBottom: Math.max(insets.bottom, SPACING.lg),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[s.content, { transform: [{ translateY: keyboardLift }] }]}>

          {/* Header wordmark: starts bigger, shrinks and moves up on success */}
          <Animated.View style={[
            s.logoCenter,
            {
              transform: [
                {
                  translateY: successAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -38],
                  }),
                },
                {
                  scale: successAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 0.55],
                  }),
                },
              ],
            },
          ]}>
            <Image
              source={require('../../../assets/Logo/webp/Maurmaket Logo Text Trans Solo.webp')}
              style={s.wordmarkBig}
              resizeMode="contain"
            />
          </Animated.View>

          {/* Welcome Back Header illustration: animated in on success taking center stage */}
          <Animated.View
            pointerEvents="none"
            style={[
              s.welcomeHeaderWrap,
              {
                opacity: welcomeOpacity,
                transform: [
                  { scale: welcomeScale },
                  { translateY: welcomeTranslateY },
                ],
              },
            ]}
          >
            <Image
              source={require('../../../illustration/welcome-back-header.webp')}
              style={s.welcomeHeaderImg}
              resizeMode="cover"
            />
          </Animated.View>

          {/* Sign in form: fades out upon successful login */}
          <Animated.View
            style={[
              s.formWrap,
              {
                opacity: formOpacity,
                transform: [
                  {
                    translateY: formOpacity.interpolate({
                      inputRange: [0, 1],
                      outputRange: [16, 0],
                    }),
                  },
                ],
              },
            ]}
            pointerEvents={isSuccess ? 'none' : 'auto'}
          >
            {/* Credentials or Better Auth's second-factor challenge */}
            <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
              {requiresTwoFactor ? (
                <>
                  <Text style={{ color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>{t('signin.twoFactorTitle')}</Text>
                  <Text style={{ color: C.sub, fontSize: 13, marginBottom: 16 }}>{t('signin.twoFactorBody')}</Text>
                  <Field icon={usingBackupCode ? 'key-outline' : 'shield-key-outline'} label={usingBackupCode ? t('signin.backupCode') : t('signin.authenticatorCode')} value={twoFactorCode} onChangeText={setTwoFactorCode} placeholder="000000" keyboardType={usingBackupCode ? 'default' : 'number-pad'} />
                </>
              ) : (
                <>
                  <Field icon="email-outline" label={t('signin.emailAddress')} value={email} onChangeText={setEmail} placeholder={t('signin.emailAddressPlaceholder')} onFocus={() => setFocusedField('email')} />
                  <View style={{ height: 12 }} />
                  <Field icon="lock-outline" label={t('signin.passwordLabel')} value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry={!showPw} onFocus={() => setFocusedField('password')} right={
                    <TouchableOpacity onPress={() => setShowPw(s => !s)} hitSlop={{ top: 20, bottom: 20, left: 50, right: 0 }} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 50, justifyContent: 'center', alignItems: 'center' }}>
                      <MaterialCommunityIcons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={28} color={C.faint} />
                    </TouchableOpacity>
                  } />
                </>
              )}
            </Animated.View>

            {/* Forgot password */}
            {requiresTwoFactor ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -1, marginBottom: 3 }}>
                <TouchableOpacity onPress={() => { setUsingBackupCode(value => !value); setTwoFactorCode(''); }} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }} style={s.textLink}>
                  <Text style={{ color: C.sub, fontSize: 13, fontWeight: '500' }}>{usingBackupCode ? t('signin.useAuthenticator') : t('signin.useBackupCode')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setRequiresTwoFactor(false); setTwoFactorCode(''); setUsingBackupCode(false); }} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }} style={s.textLink}>
                  <Text style={{ color: C.sub, fontSize: 13, fontWeight: '500' }}>{t('signin.backToSignIn')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={onForgotPassword} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }} style={[s.textLink, { alignSelf: 'flex-end', marginTop: -1, marginBottom: 3 }]}>
                <Text style={{ color: C.sub, fontSize: 13, fontWeight: '500' }}>{t('auth.forgotPassword')}</Text>
              </TouchableOpacity>
            )}

            {/* Sign in button */}
            <PrimaryButton onPress={requiresTwoFactor ? handleTwoFactorLogin : handleLogin} disabled={loading || isSuccess || (requiresTwoFactor ? twoFactorCode.trim().length < 6 : !canSubmit)}>{loading ? t('common.loading') : requiresTwoFactor ? t('signin.verifyCode') : t('signin.signInBtn')}</PrimaryButton>

            {!requiresTwoFactor && <View style={s.separatorRow}>
              <View style={s.separatorLine} />
              <Text style={s.separatorText}>{t('signin.or')}</Text>
              <View style={s.separatorLine} />
            </View>}

            {/* Social sign-in icons (no text labels) */}
            {!requiresTwoFactor && <View style={s.providerRow}>
              <TouchableOpacity onPress={handleGoogle} style={s.providerCard}>
                <View style={s.providerIconWrap}>
                  <Animated.View style={[s.providerIconRing, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
                    <LinearGradient colors={['#EC4899', '#F97316', '#EAB308', '#22C55E', '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.providerIconRingFill} />
                  </Animated.View>
                  <View style={s.providerIconInner}>
                    <Svg width="40" height="40" viewBox="0 0 24 24">
                      <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </Svg>
                  </View>
                </View>
                <Text style={s.providerLabel}>{t('signin.google')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePasskey} style={s.providerCard} disabled={passkeyLoading} accessibilityRole="button" accessibilityLabel={t('signin.passkey')}>
                <View style={s.providerIconWrap}>
                  <Animated.View style={[s.providerIconRing, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}> 
                    <LinearGradient colors={['#7C3AED', '#8B5CF6', '#A78BFA', '#93C5FD', '#C084FC', '#7C3AED']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.providerIconRingFill} />
                  </Animated.View>
                  <View style={s.providerIconInner}>
                    {passkeyLoading ? <MaterialCommunityIcons name="loading" size={40} color="#8B5CF6" /> : <MaterialCommunityIcons name="fingerprint" size={40} color="#8B5CF6" />}
                  </View>
                </View>
                <Text style={s.providerLabel}>{t('signin.passkey')}</Text>
              </TouchableOpacity>
            </View>}

            {/* Switch to signup */}
            {!requiresTwoFactor && <TouchableOpacity onPress={onSwitchToSignup} hitSlop={{ top: 6, bottom: 6, left: 12, right: 12 }} style={{ paddingVertical: 14 }}>
              <Text style={{ textAlign: 'center', color: C.sub, fontSize: 14, fontWeight: '500' }}>
                {t('signin.newHere')} <Text style={{ color: C.pink, fontWeight: '700' }}>{t('signin.createAccount')}</Text>
              </Text>
            </TouchableOpacity>}
          </Animated.View>

          </Animated.View>
        </ScrollView>
      </View>
      {focusedField && (
        <Animated.View style={[s.keyboardGhostOverlay, { opacity: ghostOpacity }]}>
          <BlurView intensity={72} tint="dark" style={s.keyboardDimmer}>
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => { Keyboard.dismiss(); setFocusedField(null); }}
              style={StyleSheet.absoluteFill}
              accessibilityLabel="Dismiss keyboard"
            />
          </BlurView>
          <View style={s.keyboardGhostContainer}>
            {/* Same centred column as the form behind it, so the floating stack keeps the
                app's content width instead of stretching across a desktop window. */}
            <View style={s.keyboardGhostColumn}>
            <View style={s.keyboardGhostStack}>
            {(['email', 'password'] as const).map((fieldName) => {
              const isEmail = fieldName === 'email';
              const isActive = focusedField === fieldName;
              return (
                <GhostField
                  key={fieldName}
                  icon={isEmail ? 'email-outline' : 'lock-outline'}
                  label={isEmail ? t('signin.emailAddress') : t('signin.passwordLabel')}
                  value={isEmail ? email : password}
                  onChangeText={isEmail ? setEmail : setPassword}
                  placeholder={isEmail ? t('signin.emailAddressPlaceholder') : t('signin.passwordLabel')}
                  secureTextEntry={!isEmail && !showPw}
                  active={isActive}
                  right={!isEmail ? (
                    <TouchableOpacity onPress={() => setShowPw(value => !value)} hitSlop={{ top: 20, bottom: 20, left: 50, right: 0 }} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 50, justifyContent: 'center', alignItems: 'center' }}>
                      <MaterialCommunityIcons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={28} color={C.faint} />
                    </TouchableOpacity>
                  ) : undefined}
                />
              );
            })}
            </View>
            <View style={s.keyboardGhostSignIn}>
              <TouchableOpacity
                onPress={handleGhostSignIn}
                disabled={!canSubmit || loading}
                style={s.keyboardGhostButton}
                accessibilityRole="button"
                accessibilityLabel={t('signin.signInBtnKeyboard')}
              >
                <Text style={[s.keyboardGhostSignInText, (!canSubmit || loading) && s.keyboardGhostDisabledText]}>{t('signin.signInBtnKeyboard')}</Text>
                <MaterialCommunityIcons name="arrow-right" size={17} color={canSubmit && !loading ? C.sub : C.faint} />
              </TouchableOpacity>
            </View>
            </View>
          </View>
        </Animated.View>
      )}

      <Modal visible={!!errorMessage} transparent animationType="fade" onRequestClose={() => setErrorMessage(null)}>
        <View style={s.errorBackdrop}>
          <View style={s.errorCard}>
            <View style={s.errorIconRing}>
              <MaterialCommunityIcons name="shield-alert-outline" size={30} color={C.pink} />
            </View>
            <Text style={s.errorTitle}>{t('signin.couldNotSignIn')}</Text>
            <Text style={s.errorMessage}>
              {errorMessage === 'Invalid email or password'
                ? t('signin.incorrectCredentials')
                : errorMessage === 'Too many sign-in attempts'
                  ? t('signin.tooManyAttempts')
                  : errorMessage}
            </Text>
            <TouchableOpacity style={s.errorButton} onPress={() => setErrorMessage(null)} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={t('signin.tryAgain')}>
              <LinearGradient colors={[C.violet, C.pink, C.amber]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.errorButtonGradient}>
                <Text style={s.errorButtonText}>{t('signin.tryAgain')}</Text>
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
  screenScroll: { flex: 1 },
  screenScrollContent: { flexGrow: 1 },
  // One centred column, capped at the same content width the signup wizard uses so a wide
  // window (tablet, desktop web, split screen) centres the form instead of stretching the
  // fields across the screen. The gutters come from the shared viewport module too, so the
  // sign-in form lines up with every other step in the flow.
  content: { flex: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: SCREEN_GUTTER },
  logoCenter: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
  },
  wordmarkBig: {
    width: '100%',
    height: 48,
  },
  formWrap: { width: '100%' },
  welcomeHeaderWrap: {
    position: 'absolute',
    left: SCREEN_GUTTER,
    right: SCREEN_GUTTER,
    top: '30%',
    height: 190,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    shadowColor: C.pink,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 12,
    zIndex: 10,
  },
  welcomeHeaderImg: { width: '100%', height: '100%' },

  errorBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, backgroundColor: 'rgba(3, 2, 8, 0.76)' },
  errorCard: { width: '100%', maxWidth: 360, alignItems: 'center', padding: 24, borderRadius: 24, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, shadowColor: C.pink, shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  errorIconRing: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.coralMuted, borderWidth: 1, borderColor: COLORS.coral, marginBottom: 16 },
  errorTitle: { color: C.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  errorMessage: { color: C.sub, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  errorButton: { width: '100%', marginTop: 22 },
  errorButtonGradient: { height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  errorButtonText: { color: COLORS.black, fontSize: 15, fontWeight: '800' },

  field: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 58, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16, alignSelf: 'stretch' },
  // Negative margin cancels the parent's padding so the tap target is the whole box,
  // not just the icon + input. The eye toggle renders after this and stays on top.
  fieldTap: { flex: 1, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, marginHorizontal: -16 },
  fieldFocused: { borderColor: C.violet, backgroundColor: C.surfaceHi },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: C.sub },
  fieldInput: { backgroundColor: 'transparent', borderWidth: 0, color: C.text, fontSize: 14, fontWeight: '500' as const, padding: 0 },
  keyboardGhostOverlay: { ...StyleSheet.absoluteFill, zIndex: 15, backgroundColor: 'rgba(10,8,18,0.52)' },
  keyboardDimmer: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10,8,18,0.52)' },
  keyboardGhostContainer: { position: 'absolute', left: 0, right: 0, bottom: 56, alignItems: 'center' },
  keyboardGhostColumn: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, paddingHorizontal: SCREEN_GUTTER },
  keyboardGhostStack: { gap: 12, marginBottom: 15 },
  keyboardGhostSignIn: { height: 52, borderRadius: 999, backgroundColor: COLORS.coralMuted, borderWidth: 1, borderColor: C.violet, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  keyboardGhostButton: { flex: 1, alignSelf: 'stretch', width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  keyboardGhostSignInText: { color: C.sub, fontSize: 15, fontWeight: '800' },
  keyboardGhostDisabledText: { color: C.faint },

  primaryTouch: { width: '100%', alignSelf: 'stretch' },
  // Text links get real geometry, not just hitSlop — mouse/trackpad clicks ignore hitSlop.
  textLink: { paddingVertical: 13, paddingHorizontal: 10, minHeight: 44, justifyContent: 'center' },
  primaryBtn: { height: 52, borderRadius: 999, backgroundColor: C.violet, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'stretch' },
  primaryBtnDisabled: { borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceHi },
  separatorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, marginBottom: 16 },
  separatorLine: { flex: 1, height: 1, backgroundColor: C.border },
  separatorText: { color: C.sub, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  providerRow: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 3 },
  providerCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: 4, minWidth: 76, minHeight: 88 },
  providerLabel: { color: C.sub, fontSize: 12, fontWeight: '600', marginTop: 5 },
  providerIconWrap: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center' },
  providerIconRing: { width: 68, height: 68, borderRadius: 34, position: 'absolute' },
  providerIconRingFill: { width: 68, height: 68, borderRadius: 34 },
  providerIconInner: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceHi },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.black },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { fontSize: 12, fontWeight: '500', color: C.faint },

});
