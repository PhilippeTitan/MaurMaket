import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, Image, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Platform,
  KeyboardAvoidingView, ScrollView, Animated,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS, TOUCH } from '../theme';
import moncashLogo from '../../assets/MonNatCash/moncash.webp';
import natcashLogo from '../../assets/MonNatCash/natcash.webp';
import { store } from '../store';
import ScreenHeader from '../components/ScreenHeader';
import { updateProfile, changePassword, updateSellerProfile } from '../api';
import { useTranslation } from '../i18n';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'SettingsEdit'>;

const FIELD_META: Record<string, { placeholder: string; icon: string; iconColor: string; iconBg: string; description: string; keyboardType?: string; secure?: boolean; multiline?: boolean }> = {
  name: { placeholder: 'Full name', icon: 'account-outline', iconColor: COLORS.coral, iconBg: COLORS.coralMuted, description: 'Your display name shown on your profile' },
  email: { placeholder: 'Email', icon: 'email-outline', iconColor: COLORS.blue, iconBg: COLORS.blueMuted, description: 'Your login email address', keyboardType: 'email-address' },
  phone: { placeholder: 'Phone', icon: 'phone-outline', iconColor: COLORS.green, iconBg: COLORS.greenMuted, description: 'MonCash payment number', keyboardType: 'phone-pad' },
  phones: { placeholder: 'Phone numbers', icon: 'phone-outline', iconColor: COLORS.green, iconBg: COLORS.greenMuted, description: 'Manage your payment numbers' },
  natcash_phone: { placeholder: 'NatCash number', icon: 'cellphone', iconColor: COLORS.purple, iconBg: COLORS.purpleMuted, description: 'For direct NatCash transfers', keyboardType: 'phone-pad' },
  bio: { placeholder: 'Tell us about yourself...', icon: 'text-short', iconColor: COLORS.coral, iconBg: COLORS.coralMuted, description: 'Short bio visible on your profile', multiline: true },
  password: { placeholder: 'New password', icon: 'lock-outline', iconColor: COLORS.yellow, iconBg: COLORS.yellowMuted, description: 'Choose a strong new password', secure: true },
  storeName: { placeholder: 'Store name', icon: 'storefront-outline', iconColor: COLORS.blue, iconBg: COLORS.blueMuted, description: 'Your public store name for buyers' },
};

export default function SettingsEditScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { field, title } = route.params;
  const user = store.user;
  const [loading, setLoading] = useState(false);

  const meta = FIELD_META[field] || FIELD_META.name;

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
      case 'phones': return user?.phone || '';
      case 'natcash_phone': return user?.natcash_phone || '';
      case 'bio': return user?.bio || '';
      case 'storeName': return user?.store_name || '';
      default: return '';
    }
  };

  const [value, setValue] = useState(getValue());
  const [natcashValue, setNatcashValue] = useState(user?.natcash_phone || '');
  const [currentPassword, setCurrentPassword] = useState('');

  // Entrance animation
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

    if (!value.trim() && field !== 'bio' && field !== 'phones') {
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
        case 'natcash_phone':
        case 'bio': {
          const payload: Record<string, string> = {};
          const apiKey = field === 'natcash_phone' ? 'natcashPhone' : field;
          payload[apiKey] = field === 'bio' ? value.trim() : value.trim();
          const res = await updateProfile(payload) as { user: typeof user };
          if (res.user) await store.setUser(res.user, store.token);
          break;
        }
        case 'phones': {
          const payload: Record<string, string> = {};
          if (value.trim()) payload.phone = value.trim();
          if (natcashValue.trim()) payload.natcashPhone = natcashValue.trim();
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
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.container}>
      <ScreenHeader
        title={title}
        onBack={() => navigation.goBack()}
        right={field !== 'name' ? (
          <TouchableOpacity onPress={handleSave} disabled={loading} accessibilityRole="button" accessibilityLabel="save">
            {loading ? (
              <ActivityIndicator size="small" color={COLORS.coral} />
            ) : (
              <Text style={styles.saveTopBtn}>{t('settingsEdit.save')}</Text>
            )}
          </TouchableOpacity>
        ) : undefined}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: anim.opacity, transform: [{ translateY: anim.translateY }] }}>

          {/* ── Field description ── */}
          <View style={styles.fieldHeader}>
            <View style={[styles.iconContainer, { backgroundColor: meta.iconBg }]}>
              <MaterialCommunityIcons name={meta.icon as any} size={20} color={meta.iconColor} />
            </View>
            <Text style={styles.fieldDescription}>{meta.description}</Text>
          </View>

          {field === 'phones' ? (
            /* ── Phone Numbers (Dual Card) ── */
            <>
              {/* MonCash Card */}
              <View style={styles.paymentCard}>
                <View style={styles.paymentHeader}>
                  <View style={styles.paymentLogoWrap}>
                    <Image source={moncashLogo} style={styles.paymentLogo} resizeMode="cover" />
                  </View>
                  <View style={styles.paymentInfo}>
                    <Text style={styles.paymentName}>MonCash</Text>
                    <Text style={styles.paymentSub}>Primary payment number</Text>
                  </View>
                  <View style={[styles.paymentBadge, { backgroundColor: COLORS.blueMuted, borderColor: COLORS.blue + '30' }]}>
                    <Text style={[styles.paymentBadgeText, { color: COLORS.blue }]}>Primary</Text>
                  </View>
                </View>
                <View style={styles.inputContainer}>
                  <Text style={styles.countryCode}>+509</Text>
                  <TextInput
                    style={styles.input}
                    value={value}
                    onChangeText={setValue}
                    placeholder="Phone number"
                    placeholderTextColor={COLORS.text3}
                    keyboardType="phone-pad"
                    autoFocus
                    accessibilityLabel="MonCash phone number"
                  />
                </View>
              </View>

              {/* NatCash Card */}
              <View style={[styles.paymentCard, { marginTop: SPACING.md }]}>
                <View style={styles.paymentHeader}>
                  <View style={[styles.paymentLogoWrap, { backgroundColor: COLORS.purpleMuted }]}>
                    <Image source={natcashLogo} style={styles.paymentLogo} resizeMode="cover" />
                  </View>
                  <View style={styles.paymentInfo}>
                    <Text style={styles.paymentName}>NatCash</Text>
                    <Text style={styles.paymentSub}>For direct NatCash transfers</Text>
                  </View>
                  <View style={[styles.paymentBadge, { backgroundColor: COLORS.purpleMuted, borderColor: COLORS.purple + '30' }]}>
                    <Text style={[styles.paymentBadgeText, { color: COLORS.purple }]}>Optional</Text>
                  </View>
                </View>
                <View style={[styles.inputContainer, { borderColor: COLORS.purple + '30' }]}>
                  <Text style={styles.countryCode}>+509</Text>
                  <TextInput
                    style={styles.input}
                    value={natcashValue}
                    onChangeText={setNatcashValue}
                    placeholder="Number"
                    placeholderTextColor={COLORS.text3}
                    keyboardType="phone-pad"
                    accessibilityLabel="NatCash phone number"
                  />
                </View>
              </View>
            </>
          ) : field === 'name' ? (
            /* ── Name (3 fields) ── */
            <View style={styles.inputCard}>
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>{t('settingsEdit.firstName')}</Text>
                <TextInput
                  style={styles.input}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder={t('settingsEdit.firstName')}
                  placeholderTextColor={COLORS.text3}
                  autoFocus
                  accessibilityLabel="first name"
                />
              </View>
              <View style={styles.divider} />
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>{t('settingsEdit.middleNameOptional')}</Text>
                <TextInput
                  style={styles.input}
                  value={middleName}
                  onChangeText={setMiddleName}
                  placeholder={t('settingsEdit.middleNameOptional')}
                  placeholderTextColor={COLORS.text3}
                  accessibilityLabel="middle name"
                />
              </View>
              <View style={styles.divider} />
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>{t('settingsEdit.lastName')}</Text>
                <TextInput
                  style={styles.input}
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder={t('settingsEdit.lastName')}
                  placeholderTextColor={COLORS.text3}
                  accessibilityLabel="last name"
                />
              </View>
            </View>
          ) : (
            /* ── Single field ── */
            <View style={styles.inputCard}>
              <View style={styles.inputContainer}>
                <TextInput
                  style={[styles.input, field === 'bio' && styles.multilineInput]}
                  value={value}
                  onChangeText={setValue}
                  placeholder={meta.placeholder}
                  placeholderTextColor={COLORS.text3}
                  secureTextEntry={meta.secure}
                  keyboardType={(meta.keyboardType as any) || 'default'}
                  autoCapitalize={field === 'email' ? 'none' : 'sentences'}
                  multiline={meta.multiline}
                  numberOfLines={meta.multiline ? 4 : 1}
                  textAlignVertical={meta.multiline ? 'top' : 'center'}
                  autoFocus
                  accessibilityLabel={field}
                />
              </View>
            </View>
          )}

          {/* ── Password extra field ── */}
          {field === 'password' && (
            <View style={[styles.inputCard, { marginTop: SPACING.md }]}>
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>{t('settingsEdit.currentPasswordPlaceholder')}</Text>
                <TextInput
                  style={styles.input}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder={t('settingsEdit.currentPasswordPlaceholder')}
                  placeholderTextColor={COLORS.text3}
                  secureTextEntry
                  accessibilityLabel="current password"
                />
              </View>
            </View>
          )}

          {/* ── Character count ── */}
          {field === 'bio' && (
            <Text style={styles.charCount}>{value.length}/150</Text>
          )}

          {/* ── Save button (name field only) ── */}
          {field === 'name' && (
            <TouchableOpacity
              style={[styles.saveButton, loading && { opacity: 0.5 }]}
              onPress={handleSave}
              disabled={loading}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="save"
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.saveButtonText}>{t('settingsEdit.save')}</Text>
              )}
            </TouchableOpacity>
          )}

        </Animated.View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
    </KeyboardAvoidingView>
  );
}

/* ── Styles ──────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scrollContent: { paddingBottom: SPACING.page },
  saveTopBtn: { fontSize: FONT_SIZES.md, fontWeight: FONT_WEIGHTS.bold, color: COLORS.coral },

  /* Field header */
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldDescription: {
    flex: 1,
    fontSize: FONT_SIZES.base,
    color: COLORS.text2,
    lineHeight: 22,
  },

  /* Input cards */
  inputCard: {
    marginHorizontal: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    minHeight: 52,
  },
  inputLabel: {
    width: 120,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text2,
    fontWeight: FONT_WEIGHTS.medium,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.lg,
    minHeight: 52,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZES.lg,
    color: COLORS.text,
    paddingVertical: SPACING.md,
    fontWeight: FONT_WEIGHTS.medium,
  },
  multilineInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: SPACING.lg + 40 + SPACING.md,
  },
  countryCode: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.text2,
    fontWeight: FONT_WEIGHTS.semibold,
  },

  /* Payment cards */
  paymentCard: {
    marginHorizontal: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  paymentLogoWrap: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.blueMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  paymentLogo: {
    width: 36,
    height: 36,
  },
  paymentInfo: {
    flex: 1,
  },
  paymentName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
  },
  paymentSub: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.text2,
    marginTop: 1,
  },
  paymentBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  paymentBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    textTransform: 'uppercase',
  },

  /* Char count */
  charCount: {
    textAlign: 'right',
    fontSize: FONT_SIZES.xs,
    color: COLORS.text3,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
  },

  /* Save button */
  saveButton: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
    backgroundColor: COLORS.coral,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
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
