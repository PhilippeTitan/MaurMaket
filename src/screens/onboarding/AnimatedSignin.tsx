import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, Modal, Image,
  Easing, Platform, KeyboardAvoidingView, Keyboard, Dimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle, Rect, Path, Defs, LinearGradient as SvgLinearGradient, Stop, G as SvgG } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, RADIUS, FONTS } from '../../theme';
import { useTranslation } from '../../i18n';
import { login as apiLogin, googleAuth, passkeyAuth, PasskeyUnavailableError } from '../../api';
import { store } from '../../store';
import OnboardingBackground from './components/OnboardingBackground';
import type { User } from '../../types';

const { width: SCREEN_W } = Dimensions.get('window');

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

function Field({ icon, label, value, onChangeText, placeholder, secureTextEntry, right, onFocus }: {
  icon: any; label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; secureTextEntry?: boolean; right?: React.ReactNode; onFocus?: () => void;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[s.field, focused && s.fieldFocused]}>
      <MaterialCommunityIcons name={icon} size={18} color={focused ? C.violet : C.faint} />
      <View style={{ flex: 1 }}>
        <Text style={s.fieldLabel}>{label}</Text>
        <TextInput
          style={s.fieldInput}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => { setFocused(true); onFocus?.(); }}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={C.faint}
          secureTextEntry={secureTextEntry}
          autoCapitalize="none"
        />
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
        style={[s.primaryBtn, disabled && s.primaryBtnDisabled]}
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
  onAccountMissing?: () => void;
}

export default function AnimatedSignin({ onSwitchToSignup, onForgotPassword, onAccountMissing }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyScreenVisible, setPasskeyScreenVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
    Animated.timing(fadeIn, { toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    Animated.loop(Animated.timing(spin, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true })).start();
  }, []);

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
      // Hold for the celebration beat before entering the app
      setTimeout(async () => {
        await store.setUser(user, token);
      }, 950);
    });
  };

  const handleLogin = async () => {
    if (!canSubmit || isSuccess) return;
    setLoading(true);
    try {
      const res = await apiLogin(email.trim(), password) as { user: User; token: string };
      playSuccessAndEnter(res.user, res.token);
    } catch (err: any) {
      const message = String(err?.message || '').toLowerCase();
      if (onAccountMissing && (message.includes('user not found') || message.includes('email not found'))) {
        onAccountMissing();
      } else {
        setErrorMessage(err?.message || 'Invalid email or password');
        triggerShake();
      }
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
    } catch (err: any) { setErrorMessage(err?.message || 'Google sign-in failed'); }
    finally { setGoogleLoading(false); }
  };

  const handlePasskey = async () => {
    if (isSuccess) return;
    try {
      setPasskeyLoading(true);
      setPasskeyScreenVisible(true);
      const res = await passkeyAuth() as { user: User; token: string };
      setPasskeyScreenVisible(false);
      playSuccessAndEnter(res.user, res.token);
    } catch (err: any) {
      setPasskeyScreenVisible(false);
      if (err instanceof PasskeyUnavailableError) {
        setErrorMessage(err.message || 'Passkeys aren’t available on this device yet');
      } else {
        setErrorMessage(err?.message || 'Passkey sign-in failed');
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
      <View style={{ flex: 1, backgroundColor: '#120E1F' }}>
        <OnboardingBackground />

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
            {/* Fields */}
            <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
              <Field icon="email-outline" label="Email address" value={email} onChangeText={setEmail} placeholder="you@email.com" onFocus={() => setFocusedField('email')} />
              <View style={{ height: 12 }} />
              <Field icon="lock-outline" label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry={!showPw} onFocus={() => setFocusedField('password')} right={
                <TouchableOpacity onPress={() => setShowPw(s => !s)}>
                  <MaterialCommunityIcons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={17} color={C.faint} />
                </TouchableOpacity>
              } />
            </Animated.View>

            {/* Forgot password */}
            <TouchableOpacity onPress={onForgotPassword} style={{ alignSelf: 'flex-end', marginTop: 12, marginBottom: 16 }}>
              <Text style={{ color: C.sub, fontSize: 13, fontWeight: '500' }}>{t('auth.forgotPassword')}</Text>
            </TouchableOpacity>

            {/* Sign in button */}
            <PrimaryButton onPress={handleLogin} disabled={!canSubmit || loading}>{loading ? t('common.loading') : 'Sign in →'}</PrimaryButton>

            <View style={s.separatorRow}>
              <View style={s.separatorLine} />
              <Text style={s.separatorText}>or</Text>
              <View style={s.separatorLine} />
            </View>

            {/* Social sign-in icons (no text labels) */}
            <View style={s.providerRow}>
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
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePasskey} style={s.providerCard} disabled={passkeyLoading}>
                <View style={s.providerIconWrap}>
                  <Animated.View style={[s.providerIconRing, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}> 
                    <LinearGradient colors={['#7C3AED', '#8B5CF6', '#A78BFA', '#93C5FD', '#C084FC', '#7C3AED']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.providerIconRingFill} />
                  </Animated.View>
                  <View style={s.providerIconInner}>
                    {passkeyLoading ? <MaterialCommunityIcons name="loading" size={40} color="#8B5CF6" /> : <MaterialCommunityIcons name="fingerprint" size={40} color="#8B5CF6" />}
                  </View>
                </View>
              </TouchableOpacity>
            </View>

            {/* Switch to signup */}
            <TouchableOpacity onPress={onSwitchToSignup} style={{ paddingVertical: 14 }}>
              <Text style={{ textAlign: 'center', color: C.sub, fontSize: 14, fontWeight: '500' }}>
                New here? <Text style={{ color: C.pink, fontWeight: '700' }}>Create an account →</Text>
              </Text>
            </TouchableOpacity>
          </Animated.View>

        </Animated.View>
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
            <View style={s.keyboardGhostStack}>
            {(['email', 'password'] as const).map((fieldName) => {
              const isEmail = fieldName === 'email';
              const isActive = focusedField === fieldName;
              return (
                <View key={fieldName} style={[s.field, isActive && s.fieldFocused]}>
                  <MaterialCommunityIcons
                    name={isEmail ? 'email-outline' : 'lock-outline'}
                    size={18}
                    color={isActive ? C.violet : C.sub}
                  />
                  <View style={{ flex: 1, justifyContent: 'center' }}>
                    <Text style={s.fieldLabel}>{isEmail ? 'Email address' : 'Password'}</Text>
                    <TextInput
                      autoFocus={isActive}
                      style={s.fieldInput}
                      value={isEmail ? email : password}
                      onChangeText={isEmail ? setEmail : setPassword}
                      placeholder={isEmail ? 'Email address' : 'Password'}
                      placeholderTextColor={C.sub}
                      secureTextEntry={!isEmail && !showPw}
                      autoCapitalize="none"
                    />
                  </View>
                  {!isEmail && (
                    <TouchableOpacity onPress={() => setShowPw(value => !value)}>
                      <MaterialCommunityIcons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={17} color={C.faint} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
            </View>
            <View style={s.keyboardGhostSignIn}>
              <TouchableOpacity
                onPress={handleGhostSignIn}
                disabled={!canSubmit || loading}
                style={s.keyboardGhostButton}
                accessibilityRole="button"
                accessibilityLabel="Sign in"
              >
                <Text style={[s.keyboardGhostSignInText, (!canSubmit || loading) && s.keyboardGhostDisabledText]}>Sign in</Text>
                <MaterialCommunityIcons name="arrow-right" size={17} color={canSubmit && !loading ? C.sub : C.faint} />
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      )}
      {passkeyScreenVisible && (
        <View style={s.passkeyScreenOverlay} pointerEvents="box-none">
          <View style={s.passkeyScreenBackdrop}>
            <OnboardingBackground />
            <View style={s.passkeyScreenContent}>
              <Image
                source={require('../../../illustration/sign-in-passkey.webp')}
                style={s.passkeyHeroImage}
                resizeMode="contain"
              />

              <View style={s.passkeyLoaderWrap}>
                <Animated.View style={[s.passkeyLoaderRing, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
                  <LinearGradient colors={['#78F3FF', '#8B5CF6', '#FF4D6A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.passkeyLoaderGradient} />
                </Animated.View>
                <Text style={s.passkeyLoaderText}>Verifying your passkey...</Text>
              </View>

              {/* Close preview button */}
              <TouchableOpacity
                onPress={() => setPasskeyScreenVisible(false)}
                style={s.passkeyCloseBtn}
                activeOpacity={0.8}
              >
                <Text style={s.passkeyCloseText}>Close Preview ✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

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
  logoCenter: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
  },
  wordmarkBig: {
    width: '100%',
    height: 48,
    resizeMode: 'contain',
  },
  formWrap: { width: '100%' },
  welcomeHeaderWrap: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: '30%',
    height: 190,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(18, 14, 31, 0.85)',
    shadowColor: C.pink,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 12,
    zIndex: 10,
  },
  welcomeHeaderImg: { width: '100%', height: '100%' },

  errorBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, backgroundColor: 'rgba(3, 2, 8, 0.76)' },
  errorCard: { width: '100%', maxWidth: 360, alignItems: 'center', padding: 24, borderRadius: 24, backgroundColor: 'rgba(18, 14, 31, 0.98)', borderWidth: 1, borderColor: 'rgba(236, 72, 153, 0.42)', shadowColor: C.pink, shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  errorIconRing: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(236, 72, 153, 0.14)', borderWidth: 1, borderColor: 'rgba(236, 72, 153, 0.34)', marginBottom: 16 },
  errorTitle: { color: C.text, fontFamily: FONTS.heading, fontSize: 21, fontWeight: '800', textAlign: 'center' },
  errorMessage: { color: C.sub, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  errorButton: { width: '100%', marginTop: 22 },
  errorButtonGradient: { height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  errorButtonText: { color: '#1A0B12', fontSize: 15, fontWeight: '800' },

  field: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 58, borderRadius: 16, backgroundColor: 'rgba(13, 10, 27, 0.9)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)', paddingHorizontal: 16, alignSelf: 'stretch' },
  fieldFocused: { borderColor: C.violet, backgroundColor: 'rgba(38,29,60,0.92)' },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: C.sub },
  fieldInput: { backgroundColor: 'transparent', borderWidth: 0, color: C.text, fontSize: 14, fontWeight: '500' as const, padding: 0 },
  keyboardGhostOverlay: { ...StyleSheet.absoluteFill, zIndex: 15, backgroundColor: 'rgba(10,8,18,0.52)' },
  keyboardDimmer: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10,8,18,0.52)' },
  keyboardGhostContainer: { position: 'absolute', left: 28, right: 28, bottom: 56 },
  keyboardGhostStack: { gap: 12, marginBottom: 15 },
  keyboardGhostSignIn: { height: 52, borderRadius: 999, backgroundColor: 'rgba(139,92,246,0.32)', borderWidth: 1, borderColor: C.violet, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  keyboardGhostButton: { flex: 1, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  keyboardGhostSignInText: { color: C.sub, fontSize: 15, fontWeight: '800' },
  keyboardGhostDisabledText: { color: C.faint },

  primaryBtn: { height: 52, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'stretch' },
  primaryBtnDisabled: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  separatorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, marginBottom: 16 },
  separatorLine: { flex: 1, height: 1, backgroundColor: 'rgba(221,232,255,0.24)' },
  separatorText: { color: C.sub, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  providerRow: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 3 },
  providerCard: { alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  providerIconWrap: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center' },
  providerIconRing: { width: 68, height: 68, borderRadius: 34, position: 'absolute' },
  providerIconRingFill: { width: 68, height: 68, borderRadius: 34 },
  providerIconInner: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1040' },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#1A0B12' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { fontSize: 12, fontWeight: '500', color: C.faint },

  passkeyScreenOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  passkeyScreenBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', backgroundColor: 'rgba(10, 8, 18, 0.94)' },
  passkeyScreenContent: { alignItems: 'center', justifyContent: 'center', width: '100%', paddingHorizontal: 24 },
  passkeyHeroImage: {
    width: Math.min(340, SCREEN_W - 48),
    height: Math.min(340, SCREEN_W - 48),
    resizeMode: 'contain',
  },
  passkeyLoaderWrap: { alignItems: 'center', marginTop: 24 },
  passkeyLoaderRing: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.borderHi },
  passkeyLoaderGradient: { width: 40, height: 40, borderRadius: 20 },
  passkeyLoaderText: { color: C.sub, fontSize: 14, marginTop: 12, fontWeight: '600' },
  passkeyCloseBtn: {
    marginTop: 24,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  passkeyCloseText: {
    color: C.text,
    fontSize: 13,
    fontWeight: '700',
  },
});
