import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { COLORS, SPACING, RADIUS } from '../theme';
import { store } from '../store';
import { useUser } from '../hooks';
import ScreenHeader from '../components/ScreenHeader';
import { updateUsername } from '../api';
import { useTranslation } from '../i18n';
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

  const handleSave = async () => {
    if (!isValid || !changed) return;
    setSaving(true);
    setError('');
    try {
      const res = await updateUsername(clean) as { user: { username: string } };
      await store.setUser({ ...store.user!, username: res.user.username } as any, store.token!);
      toast.success('Username updated', `@${res.user.username}`);
      navigation.goBack();
    } catch (err: any) {
      const msg = err?.message || 'Failed to update username';
      setError(msg);
      toast.error('Error', msg);
    }
    setSaving(false);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Username" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll}>

      <View style={styles.card}>
        <Text style={styles.label}>Your username</Text>
        <Text style={styles.hint}>1-30 characters. Letters, numbers, periods, and underscores only.</Text>
        <View style={styles.inputRow}>
          <Text style={styles.at}>@</Text>
          <TextInput
            style={[styles.input, error && styles.inputError]}
            value={username}
            onChangeText={(v) => { setUsername(v); setError(''); }}
            placeholder="username"
            placeholderTextColor={COLORS.text2}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {clean && isValid && changed ? (
          <Text style={styles.preview}>New username: @{clean}</Text>
        ) : null}
        {clean && !isValid ? (
          <Text style={styles.errorText}>
            {clean.length > 30 ? 'Too long (max 30 characters)'
              : clean.startsWith('.') || clean.endsWith('.') ? 'Cannot start or end with a period'
              : clean.includes('..') ? 'No consecutive periods'
              : 'Must start with a letter or number'}
          </Text>
        ) : null}
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, (!isValid || !changed || saving) && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={!isValid || !changed || saving}
      >
        {saving ? (
          <ActivityIndicator size={16} color={COLORS.white} />
        ) : (
          <Text style={styles.saveBtnText}>{t('common.save')}</Text>
        )}
      </TouchableOpacity>

      <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingBottom: 20 },
  card: {
    marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.card,
    padding: 14,
  },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  hint: { fontSize: 12, color: COLORS.text2, marginBottom: 12 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.row, overflow: 'hidden',
  },
  at: {
    paddingLeft: 12, fontSize: 15, fontWeight: '600', color: COLORS.text2,
  },
  input: {
    flex: 1, padding: 12, color: COLORS.text, fontSize: 14,
  },
  inputError: { borderColor: COLORS.coral },
  errorText: { fontSize: 12, color: COLORS.coral, marginTop: 8 },
  preview: { fontSize: 12, color: COLORS.green, marginTop: 8 },
  saveBtn: {
    marginHorizontal: SPACING.lg, marginTop: 16,
    backgroundColor: COLORS.coral, borderRadius: RADIUS.row,
    padding: 14, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: COLORS.white, fontSize: 14, fontWeight: '700' },
});
