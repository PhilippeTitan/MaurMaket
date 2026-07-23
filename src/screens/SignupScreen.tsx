import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../theme';
import { useTranslation } from '../i18n';
import { signup as apiSignup, googleAuth } from '../api';
import { store } from '../store';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation';
import type { User } from '../types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Signup'>;

const GOOGLE_WEB_CLIENT_ID = '273654218158-1d5a7pmsaj5ql6ejshbbi5igjaqe22nh.apps.googleusercontent.com';
const GOOGLE_REDIRECT_URI = 'https://auth.expo.io/@maurinex/MaurMaketMobile';

export default function SignupScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handleGoogleSignIn = async () => {
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
          Alert.alert(t('common.error'), 'No ID token received from Google');
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google sign-in failed';
      Alert.alert(t('common.error'), message);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSignup = async () => {
    setNameError('');
    setEmailError('');
    setPhoneError('');
    setPasswordError('');
    let hasError = false;
    if (!fullName.trim()) {
      setNameError('Full name is required');
      hasError = true;
    }
    if (!email.trim()) {
      setEmailError('Email is required');
      hasError = true;
    }
    if (!phone.trim()) {
      setPhoneError('Phone number is required');
      hasError = true;
    }
    if (!password.trim()) {
      setPasswordError('Password is required');
      hasError = true;
    } else if (password.trim().length < 6) {
      setPasswordError('Password must be at least 6 characters');
      hasError = true;
    }
    if (hasError) return;
    setLoading(true);
    try {
      const res = await apiSignup(fullName.trim(), email.trim(), password, phone.trim()) as { user: User; token: string };
      await store.setUser(res.user, res.token);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Signup failed';
      Alert.alert(t('common.error'), message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Maur<Text style={styles.logoAccent}>Maket</Text></Text>
        <Text style={styles.subtitle}>{t('auth.createAccount')}</Text>

        <TextInput
          style={[styles.input, nameError && styles.inputError]}
          placeholder={t('settingsEdit.fullName') || 'Full name'}
          placeholderTextColor={COLORS.text2}
          value={fullName}
          onChangeText={(v) => { setFullName(v); setNameError(''); }}
          returnKeyType="next"
          accessibilityLabel={t('settingsEdit.fullName') || 'Full name'}
        />
        {nameError ? <Text style={styles.error}>{nameError}</Text> : null}
        <TextInput
          style={[styles.input, emailError && styles.inputError]}
          placeholder={t('auth.emailPlaceholder')}
          placeholderTextColor={COLORS.text2}
          value={email}
          onChangeText={(v) => { setEmail(v); setEmailError(''); }}
          autoCapitalize="none"
          keyboardType="email-address"
          returnKeyType="next"
          accessibilityLabel={t('accessibility.email')}
        />
        {emailError ? <Text style={styles.error}>{emailError}</Text> : null}
        <TextInput
          style={[styles.input, phoneError && styles.inputError]}
          placeholder={t('auth.phonePlaceholder')}
          placeholderTextColor={COLORS.text2}
          value={phone}
          onChangeText={(v) => { setPhone(v); setPhoneError(''); }}
          keyboardType="phone-pad"
          returnKeyType="next"
          accessibilityLabel={t('accessibility.phone')}
        />
        {phoneError ? <Text style={styles.error}>{phoneError}</Text> : null}
        <TextInput
          style={[styles.input, passwordError && styles.inputError]}
          placeholder={t('auth.passwordPlaceholder')}
          placeholderTextColor={COLORS.text2}
          value={password}
          onChangeText={(v) => { setPassword(v); setPasswordError(''); }}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleSignup}
          accessibilityLabel={t('accessibility.password')}
        />
        {passwordError ? <Text style={styles.error}>{passwordError}</Text> : null}

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleSignup}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={t('accessibility.createAccount')}
        >
          <Text style={styles.btnText}>{loading ? t('common.loading') : t('auth.createAccount')}</Text>
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{t('auth.orContinueWith')}</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={[styles.googleBtn, googleLoading && styles.btnDisabled]}
          onPress={handleGoogleSignIn}
          disabled={googleLoading}
          accessibilityRole="button"
          accessibilityLabel={t('accessibility.signInWithGoogle')}
        >
          <MaterialCommunityIcons name="google" size={20} color="#4285F4" />
          <Text style={styles.googleBtnText}>{t('auth.googleSignIn')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate('Login')}
          accessibilityRole="button"
          accessibilityLabel={t('accessibility.goToLogin')}
        >
          <Text style={styles.link}>{t('auth.hasAccount')} <Text style={styles.linkBold}>{t('auth.signIn')}</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: SPACING.xl },
  title: { fontFamily: 'Syne', fontSize: 32, fontWeight: '800', color: COLORS.text, textAlign: 'center', marginBottom: 4 },
  logoAccent: { color: COLORS.coral },
  subtitle: { textAlign: 'center', color: COLORS.text2, marginBottom: 28, fontSize: 15 },
  input: {
    width: '100%', padding: 14, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.card,
    color: COLORS.text, fontSize: 16, marginBottom: 4,
  },
  inputError: { borderColor: COLORS.coral },
  error: { color: COLORS.coral, fontSize: 12, marginBottom: 10, marginLeft: 4 },
  btn: {
    backgroundColor: COLORS.coral, padding: 14, borderRadius: RADIUS.pill,
    alignItems: 'center', marginBottom: 12,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: COLORS.white, fontSize: 16, fontWeight: '600' },
  dividerRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { color: COLORS.text2, fontSize: 12, fontWeight: '500' },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    padding: 14, borderRadius: RADIUS.card,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
    marginBottom: 20,
  },
  googleBtnText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  link: { textAlign: 'center', color: COLORS.text2, fontSize: 14 },
  linkBold: { color: COLORS.blue, fontWeight: '600' },
});
