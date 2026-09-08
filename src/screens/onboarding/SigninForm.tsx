import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../../theme';
import { useTranslation } from '../../i18n';
import { login as apiLogin, googleAuth } from '../../api';
import { store } from '../../store';
import AuthInput from './components/AuthInput';
import Divider from './components/Divider';
import type { User } from '../../types';

const GOOGLE_WEB_CLIENT_ID = '273654218158-k61mtuaq2kcvohj05roqdpe6nqmfscu0.apps.googleusercontent.com';
const GOOGLE_REDIRECT_URI = 'https://auth.expo.io/@maurinex/MaurMaketMobile';

interface SigninFormProps {
  switchMode: () => void;
  onForgotPassword: () => void;
}

export default function SigninForm({ switchMode, onForgotPassword }: SigninFormProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const appear = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(appear, { toValue: 1, duration: 320, useNativeDriver: true }),
    ]).start();
  }, [appear]);

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
          setError('No ID token received from Google');
          triggerShake();
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
      triggerShake();
    } finally {
      setGoogleLoading(false);
    }
  };

  const canSubmit = !!email.trim() && !!password.trim();

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 9, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -9, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 7, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -7, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
  };

  const handleLogin = async () => {
    if (!canSubmit || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiLogin(email.trim(), password) as { user: User; token: string };
      await store.setUser(res.user, res.token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Animated.View style={[styles.container, { opacity: appear, transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <MaterialCommunityIcons name="hand-wave-outline" size={26} color={COLORS.coral} />
        </View>
        <Text style={styles.kicker}>Welcome back</Text>
        <Text style={styles.title}>Good to see you again.</Text>
        <Text style={styles.subtitle}>Sign in and pick up where you left off.</Text>
      </View>

      <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
        <AuthInput
          icon="email-outline"
          value={email}
          onChangeText={v => { setEmail(v); setError(''); }}
          placeholder="you@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoFocus
        />
        <AuthInput
          icon="lock-outline"
          value={password}
          onChangeText={v => { setPassword(v); setError(''); }}
          placeholder="Password"
          secureTextEntry={!showPw}
          error={error}
          rightIcon={showPw ? 'eye-off-outline' : 'eye-outline'}
          onRightPress={() => setShowPw(s => !s)}
        />
      </Animated.View>

      <TouchableOpacity onPress={onForgotPassword} style={styles.forgotBtn} hitSlop={8}>
        <Text style={styles.forgotText}>{t('auth.forgotPassword')}</Text>
      </TouchableOpacity>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryBtn, (!canSubmit || loading) && styles.btnDisabled]}
          onPress={handleLogin}
          disabled={!canSubmit || loading}
          activeOpacity={0.86}
        >
          <Text style={styles.primaryBtnText}>{loading ? t('common.loading') : t('auth.signIn')}</Text>
          <View style={styles.btnIcon}><MaterialCommunityIcons name="arrow-right" size={17} color="#fff" /></View>
        </TouchableOpacity>

        <Divider />

        <TouchableOpacity style={[styles.googleBtn, googleLoading && styles.btnDisabled]} onPress={handleGoogle} disabled={googleLoading} activeOpacity={0.86}>
          <MaterialCommunityIcons name="google" size={20} color="#4285F4" />
          <Text style={styles.googleBtnText}>{googleLoading ? 'Connecting…' : t('auth.googleSignIn')}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={switchMode} style={styles.switchBtn}>
          <Text style={styles.switchText}>{t('auth.noAccount')} <Text style={styles.switchLink}>{t('auth.signUp')}</Text></Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 30 },
  hero: { marginBottom: 27 },
  heroIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', marginBottom: 17 },
  kicker: { color: COLORS.coral, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 7 },
  title: { fontFamily: 'Syne', color: COLORS.text, fontSize: 30, lineHeight: 34, fontWeight: '800', maxWidth: 330 },
  subtitle: { color: COLORS.text2, fontSize: 14, lineHeight: 20, marginTop: 8, maxWidth: 320 },
  forgotBtn: { alignSelf: 'flex-end', paddingVertical: 4, marginTop: -2 },
  forgotText: { color: COLORS.coral, fontSize: 13.5, fontWeight: '700' },
  footer: { marginTop: 19, paddingBottom: SPACING.lg },
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