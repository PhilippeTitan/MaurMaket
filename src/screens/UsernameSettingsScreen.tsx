import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Animated,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../theme';
import { store } from '../store';
import { useUser } from '../hooks';
import ScreenHeader from '../components/ScreenHeader';
import SettingsGroup from '../components/SettingsGroup';
import AuthInput from '../components/AuthInput';
import PrimaryButton from '../components/PrimaryButton';
import { updateUsername } from '../api';
import { useTranslation } from '@/localization';
import { useToast } from '../components/Toast';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'UsernameSettings'>;

export default function UsernameSettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useUser();
  const [username, setUsername] = useState(user?.username || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const clean = username.toLowerCase().replace(/[^a-z0-9._]/g, '');
  const isValid = clean.length >= 1 && clean.length <= 30
    && /^[a-z0-9]/.test(clean)
    && !clean.startsWith('.')
    && !clean.endsWith('.')
    && !clean.includes('..');
  const changed = clean !== user?.username;

  const anim = useRef({
    opacity: new Animated.Value(0),
    translateY: new Animated.Value(16),
  }).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(anim.opacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(anim.translateY, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleSave = async () => {
    if (!isValid || !changed) return;
    setSaving(true);
    setError('');
    try {
      const res = await updateUsername(clean) as { user: { username: string } };
      await store.setUser({ ...store.user!, username: res.user.username } as any, store.token!);
      toast.success(t('username.updated'), res.user.username);
      navigation.goBack();
    } catch (err: any) {
      const msg = err?.message || t('username.updateFailed');
      setError(msg);
      toast.error(t('common.error'), msg);
    }
    setSaving(false);
  };

  const getErrorText = () => {
    if (clean.length > 30) return t('username.tooLong');
    if (clean.startsWith('.') || clean.endsWith('.')) return t('username.noEdgePeriod');
    if (clean.includes('..')) return t('username.noDoublePeriod');
    return t('username.startAlphanumeric');
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('username.title')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: anim.opacity, transform: [{ translateY: anim.translateY }] }}>
          <SettingsGroup
            header="Username"
            accentColor={COLORS.blue}
            description={t('username.hint')}
          >
            <View style={styles.inputCard}>
              <AuthInput
                icon="at"
                prefix="@"
                value={username}
                onChangeText={(v) => { setUsername(v); setError(''); }}
                placeholder={t('username.placeholder')}
                autoCapitalize="none"
                autoFocus
              />
            </View>

            {/* Validation messages */}
            {error ? (
              <View style={styles.messageRow}>
                <MaterialCommunityIcons name="alert-circle" size={16} color={COLORS.coral} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {clean && !isValid ? (
              <View style={styles.messageRow}>
                <MaterialCommunityIcons name="alert-circle" size={16} color={COLORS.coral} />
                <Text style={styles.errorText}>{getErrorText()}</Text>
              </View>
            ) : null}

            {clean && isValid && changed ? (
              <View style={styles.messageRow}>
                <MaterialCommunityIcons name="check-circle" size={16} color={COLORS.green} />
                <Text style={styles.previewText}>{t('username.newPreview', { username: clean })}</Text>
              </View>
            ) : null}
          </SettingsGroup>
        </Animated.View>

        {/* ── Save button ── */}
        <View style={{ marginHorizontal: SPACING.lg, marginTop: SPACING.xl }}>
          <PrimaryButton onPress={handleSave} disabled={!isValid || !changed} loading={saving}>
            {t('common.save')}
          </PrimaryButton>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

/* ── Styles ──────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingBottom: SPACING.page },

  inputCard: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
    borderWidth: 1.5,
    borderColor: COLORS.blue + '40',
    borderRadius: RADIUS.card,
    paddingHorizontal: SPACING.lg,
    minHeight: 52,
  },
  at: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.blue,
    marginRight: SPACING.xs,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZES.lg,
    color: COLORS.text,
    paddingVertical: SPACING.md,
    fontWeight: FONT_WEIGHTS.medium,
  },
  inputError: {
    borderColor: COLORS.coral,
  },

  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
  },
  errorText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.coral,
    flex: 1,
  },
  previewText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.green,
    flex: 1,
  },

  saveButton: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
    backgroundColor: COLORS.coral,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },

  bottomSpacer: {
    height: 60,
  },
});
