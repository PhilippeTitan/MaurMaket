import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../theme';
import { useTranslation } from '../i18n';
import { login as apiLogin, googleAuth } from '../api';
import { store } from '../store';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation';
import type { User } from '../types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert(t('common.error'), 'Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      const res = await apiLogin(email.trim(), password) as { user: User; token: string };
      await store.setUser(res.user, res.token);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      Alert.alert(t('common.error'), message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setGoogleLoading(true);
      const { useAuthRequest, ResponseType } = require('expo-auth-session/providers/google');
      const { makeRedirectUri } = require('expo-auth-session');
      const Constants = require('expo-constants');

      const clientId = Constants.default?.expoConfig?.extra?.eas?.projectId
        ? undefined
        : undefined;

      const redirectUri = makeRedirectUri({ scheme: 'maurmaket' });

      const [request, response, promptAsync] = useAuthRequest({
        expoClientId: Constants.default?.expoConfig?.extra?.eas?.projectId,
        clientId: clientId || undefined,
        redirectUri,
        scopes: ['profile', 'email'],
        responseType: ResponseType.IdToken,
      });

      if (request) {
        const result = await promptAsync();
        if (result?.type === 'success' && result.params?.id_token) {
          const res = await googleAuth(result.params.id_token) as { user: User; token: string };
          await store.setUser(res.user, res.token);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google sign-in failed';
      Alert.alert(t('common.error'), message);
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Maur<Text style={styles.logoAccent}>Maket</Text></Text>
        <Text style={styles.subtitle}>{t('auth.signInToAccount')}</Text>

        <TextInput
          style={styles.input}
          placeholder={t('auth.emailPlaceholder')}
          placeholderTextColor={COLORS.text2}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          returnKeyType="next"
        />
        <TextInput
          style={styles.input}
          placeholder={t('auth.passwordPlaceholder')}
          placeholderTextColor={COLORS.text2}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleLogin}
        />

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.btnText}>{loading ? t('common.loading') : t('auth.signIn')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.forgotBtn} onPress={() => navigation.navigate('ForgotPassword')}>
          <Text style={styles.forgotText}>{t('auth.forgotPassword')}</Text>
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
        >
          <MaterialCommunityIcons name="google" size={20} color="#4285F4" />
          <Text style={styles.googleBtnText}>{t('auth.googleSignIn')}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
          <Text style={styles.link}>{t('auth.noAccount')} <Text style={styles.linkBold}>{t('auth.signUp')}</Text></Text>
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
    color: COLORS.text, fontSize: 16, marginBottom: 14,
  },
  btn: {
    backgroundColor: COLORS.coral, padding: 14, borderRadius: RADIUS.pill,
    alignItems: 'center', marginBottom: 12,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: COLORS.white, fontSize: 16, fontWeight: '600' },
  forgotBtn: { alignItems: 'center', marginBottom: 20 },
  forgotText: { color: COLORS.coral, fontSize: 14, fontWeight: '500' },
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
