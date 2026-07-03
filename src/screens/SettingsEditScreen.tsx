import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Platform,
  KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../theme';
import { store } from '../store';
import ScreenHeader from '../components/ScreenHeader';
import { updateProfile, changePassword, updateSellerProfile } from '../api';
import { useTranslation } from '../i18n';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'SettingsEdit'>;

const FIELD_PLACEHOLDERS: Record<string, string> = {
  name: 'Full name',
  email: 'Email',
  phone: 'Phone',
  bio: 'Bio',
  password: 'New password',
  storeName: 'Store name',
};

const FIELD_ICONS: Record<string, string> = {
  name: 'account-outline',
  email: 'email-outline',
  phone: 'phone-outline',
  bio: 'text-short',
  password: 'lock-outline',
  storeName: 'storefront-outline',
};

export default function SettingsEditScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { field, title } = route.params;
  const user = store.user;
  const [loading, setLoading] = useState(false);

  const splitName = (fullName: string) => {
    const parts = (fullName || '').trim().split(/\s+/);
    if (parts.length === 0) return { first: '', middle: '', last: '' };
    if (parts.length === 1) return { first: parts[0], middle: '', last: '' };
    if (parts.length === 2) return { first: parts[0], middle: '', last: parts[1] };
    return { first: parts[0], middle: parts.slice(1, -1).join(' '), last: parts[parts.length - 1] };
  };

  const nameParts = field === 'name' ? splitName(user?.full_name || '') : null;
  const [firstName, setFirstName] = useState(nameParts?.first || '');
  const [middleName, setMiddleName] = useState(nameParts?.middle || '');
  const [lastName, setLastName] = useState(nameParts?.last || '');

  const getValue = (): string => {
    switch (field) {
      case 'name': return user?.full_name || '';
      case 'email': return user?.email || '';
      case 'phone': return user?.phone || '';
      case 'bio': return user?.bio || '';
      case 'storeName': return user?.store_name || '';
      default: return '';
    }
  };

  const [value, setValue] = useState(getValue());
  const [currentPassword, setCurrentPassword] = useState('');

  const handleSave = async () => {
    if (field === 'name') {
      const combined = [firstName, middleName, lastName].filter(Boolean).join(' ').trim();
      if (!combined) {
        Alert.alert(t('settingsEdit.required'), t('settingsEdit.cannotBeEmpty'));
        return;
      }
      setLoading(true);
      try {
        const res = await updateProfile({ fullName: combined }) as { user: typeof user };
        if (res.user) await store.setUser(res.user, store.token);
        Alert.alert(t('common.saved'), t('settingsEdit.updated', { field: title }), [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } catch (err: unknown) {
        Alert.alert(t('common.error'), err instanceof Error ? err.message : 'Failed');
      }
      setLoading(false);
      return;
    }

    if (!value.trim() && field !== 'bio') {
      Alert.alert(t('settingsEdit.required'), t('settingsEdit.cannotBeEmpty'));
      return;
    }
    if (field === 'password' && (!currentPassword || !value)) {
      Alert.alert(t('settingsEdit.required'), t('settingsEdit.bothFieldsRequired'));
      return;
    }

    setLoading(true);
    try {
      switch (field) {
        case 'email':
        case 'phone':
        case 'bio': {
          const payload: Record<string, string> = {};
          payload[field] = field === 'bio' ? value.trim() : value.trim();
          const res = await updateProfile(payload) as { user: typeof user };
          if (res.user) await store.setUser(res.user, store.token);
          break;
        }
        case 'password':
          await changePassword(currentPassword, value);
          break;
        case 'storeName': {
          const res = await updateSellerProfile({ storeName: value.trim() }) as { user: typeof user };
          if (res.user) await store.setUser(res.user, store.token);
          break;
        }
      }
      Alert.alert(t('common.saved'), t('settingsEdit.updated', { field: title }), [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: unknown) {
      Alert.alert(t('common.error'), err instanceof Error ? err.message : 'Failed');
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={styles.container}>
      <ScreenHeader
        title={title}
        onBack={() => navigation.goBack()}
        right={field !== 'name' ? (
          <TouchableOpacity onPress={handleSave} disabled={loading}>
            {loading ? (
              <ActivityIndicator size="small" color={COLORS.coral} />
            ) : (
              <Text style={styles.saveTopBtn}>{t('settingsEdit.save')}</Text>
            )}
          </TouchableOpacity>
        ) : undefined}
      />

      <View style={styles.fieldCard}>
        {field === 'name' ? (
          <>
            <View style={styles.fieldRow}>
              <MaterialCommunityIcons name="account-outline" size={18} color={COLORS.text2} />
              <TextInput
                style={styles.fieldInput}
                value={firstName}
                onChangeText={setFirstName}
                placeholder={t('settingsEdit.firstName')}
                placeholderTextColor={COLORS.text2}
                autoFocus
              />
            </View>
            <View style={[styles.fieldRow, { borderTopWidth: 1, borderTopColor: COLORS.border }]}>
              <MaterialCommunityIcons name="account-outline" size={18} color={COLORS.text2} />
              <TextInput
                style={styles.fieldInput}
                value={middleName}
                onChangeText={setMiddleName}
                placeholder={t('settingsEdit.middleNameOptional')}
                placeholderTextColor={COLORS.text2}
              />
            </View>
            <View style={[styles.fieldRow, { borderTopWidth: 1, borderTopColor: COLORS.border }]}>
              <MaterialCommunityIcons name="account-outline" size={18} color={COLORS.text2} />
              <TextInput
                style={styles.fieldInput}
                value={lastName}
                onChangeText={setLastName}
                placeholder={t('settingsEdit.lastName')}
                placeholderTextColor={COLORS.text2}
              />
            </View>
          </>
        ) : (
          <View style={styles.fieldRow}>
            <MaterialCommunityIcons
              name={FIELD_ICONS[field] as any}
              size={18}
              color={COLORS.text2}
            />
            <TextInput
              style={styles.fieldInput}
              value={value}
              onChangeText={setValue}
              placeholder={FIELD_PLACEHOLDERS[field]}
              placeholderTextColor={COLORS.text2}
              secureTextEntry={field === 'password'}
              keyboardType={field === 'email' ? 'email-address' : field === 'phone' ? 'phone-pad' : 'default'}
              autoCapitalize={field === 'email' ? 'none' : 'sentences'}
              multiline={field === 'bio'}
              numberOfLines={field === 'bio' ? 4 : 1}
              textAlignVertical={field === 'bio' ? 'top' : 'center'}
              autoFocus
            />
          </View>
        )}

        {field === 'password' && (
          <View style={[styles.fieldRow, { borderTopWidth: 1, borderTopColor: COLORS.border }]}>
            <MaterialCommunityIcons name="lock-outline" size={18} color={COLORS.text2} />
            <TextInput
              style={styles.fieldInput}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder={t('settingsEdit.currentPasswordPlaceholder')}
              placeholderTextColor={COLORS.text2}
              secureTextEntry
            />
          </View>
        )}
      </View>

      {field === 'bio' && (
        <Text style={styles.charCount}>{value.length}/150</Text>
      )}

      {field === 'name' && (
        <TouchableOpacity
          style={[styles.bottomSaveBtn, loading && { opacity: 0.5 }]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={styles.bottomSaveBtnText}>{t('settingsEdit.save')}</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  saveTopBtn: { fontSize: 14, fontWeight: '700', color: COLORS.coral },
  fieldCard: {
    marginHorizontal: SPACING.lg, marginTop: SPACING.lg,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.card, overflow: 'hidden',
  },
  fieldRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 14,
  },
  fieldInput: {
    flex: 1, fontSize: 15, color: COLORS.text, paddingVertical: 0,
  },
  charCount: {
    textAlign: 'right', fontSize: 11, color: COLORS.text2,
    marginHorizontal: SPACING.lg, marginTop: 6,
  },
  bottomSaveBtn: {
    marginHorizontal: SPACING.lg, marginTop: 14,
    backgroundColor: COLORS.coral, borderRadius: RADIUS.row,
    padding: 14, alignItems: 'center',
  },
  bottomSaveBtnText: { color: COLORS.white, fontSize: 14, fontWeight: '700' },
});
