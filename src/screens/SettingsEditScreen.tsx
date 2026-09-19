import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, Image, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Platform,
  KeyboardAvoidingView, ScrollView, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS, TOUCH } from '../theme';
import { ONBOARDING_COLORS, ONBOARDING_GRADIENT } from './onboarding/theme';
import moncashLogo from '../../assets/MonNatCash/moncash.webp';
import natcashLogo from '../../assets/MonNatCash/natcash.webp';
import { store } from '../store';
import ScreenHeader from '../components/ScreenHeader';
import { updateProfile, changePassword, updateSellerProfile, resendVerificationEmail } from '../api';
import { useTranslation } from '@/localization';
import { useToast } from '../components/Toast';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'SettingsEdit'>;

const FIELD_META: Record<string, { placeholderKey: string; icon: string; iconColor: string; iconBg: string; descriptionKey: string; keyboardType?: string; secure?: boolean; multiline?: boolean }> = {
  name: { placeholderKey: 'settingsEdit.fullNamePlaceholder', icon: 'account-outline', iconColor: ONBOARDING_COLORS.coral, iconBg: 'rgba(255, 77, 106, 0.15)', descriptionKey: 'settingsEdit.fullNameDesc' },
  email: { placeholderKey: 'field.email', icon: 'email-outline', iconColor: ONBOARDING_COLORS.blue, iconBg: 'rgba(0, 194, 255, 0.15)', descriptionKey: 'settingsEdit.emailDesc', keyboardType: 'email-address' },
  phone: { placeholderKey: 'field.phone', icon: 'phone-outline', iconColor: ONBOARDING_COLORS.green, iconBg: 'rgba(0, 229, 160, 0.15)', descriptionKey: 'settingsEdit.phoneDesc', keyboardType: 'phone-pad' },
  phones: { placeholderKey: 'settingsEdit.phonesPlaceholder', icon: 'phone-outline', iconColor: ONBOARDING_COLORS.green, iconBg: 'rgba(0, 229, 160, 0.15)', descriptionKey: 'settingsEdit.phonesDesc' },
  natcash_phone: { placeholderKey: 'settingsEdit.natcashPlaceholder', icon: 'cellphone', iconColor: ONBOARDING_COLORS.purple, iconBg: 'rgba(139, 92, 246, 0.15)', descriptionKey: 'settingsEdit.natcashDesc', keyboardType: 'phone-pad' },
  bio: { placeholderKey: 'settingsEdit.bioPlaceholder', icon: 'text-short', iconColor: ONBOARDING_COLORS.coral, iconBg: 'rgba(255, 77, 106, 0.15)', descriptionKey: 'settingsEdit.bioDesc', multiline: true },
  password: { placeholderKey: 'settings.newPassword', icon: 'lock-outline', iconColor: ONBOARDING_COLORS.yellow, iconBg: 'rgba(255, 224, 102, 0.15)', descriptionKey: 'settingsEdit.newPasswordDesc', secure: true },
  storeName: { placeholderKey: 'field.storeName', icon: 'storefront-outline', iconColor: ONBOARDING_COLORS.blue, iconBg: 'rgba(0, 194, 255, 0.15)', descriptionKey: 'settingsEdit.storeNameDesc' },
};

export default function SettingsEditScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const { field, title } = route.params;
  const user = store.user;
  const [loading, setLoading] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);

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

  const handleVerifyEmail = async () => {
    if (!user?.email) return;
    setSendingVerification(true);
    try {
      await resendVerificationEmail(user.email);
      toast.show({ kind: 'success', title: t('settingsEdit.verificationEmailSent') });
    } catch (err: unknown) {
      toast.show({ kind: 'error', title: err instanceof Error ? err.message : t('settingsEdit.resendFailed') });
    } finally {
      setSendingVerification(false);
    }
  };

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
          { text: t('common.ok'), onPress: () => navigation.goBack() },
        ]);
      } catch (err: unknown) {
        Alert.alert(t('common.error'), err instanceof Error ? err.message : t('settings.failed'));
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
        { text: t('common.ok'), onPress: () => navigation.goBack() },
      ]);
    } catch (err: unknown) {
      Alert.alert(t('common.error'), err instanceof Error ? err.message : t('settings.failed'));
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
            <Text style={styles.fieldDescription}>{t(meta.descriptionKey)}</Text>
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
                    <Text style={styles.paymentSub}>{t('settingsEdit.primaryPayment')}</Text>
                  </View>
                  <View style={[styles.paymentBadge, { backgroundColor: COLORS.blueMuted, borderColor: COLORS.blue + '30' }]}>
                    <Text style={[styles.paymentBadgeText, { color: COLORS.blue }]}>{t('settingsEdit.badgePrimary')}</Text>
                  </View>
                </View>
                <View style={styles.inputContainer}>
                  <Text style={styles.countryCode}>+509</Text>
                  <TextInput
                    style={styles.input}
                    value={value}
                    onChangeText={setValue}
                    placeholder={t('field.phone')}
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
                    <Text style={styles.paymentSub}>{t('settingsEdit.natcashDesc')}</Text>
                  </View>
                  <View style={[styles.paymentBadge, { backgroundColor: COLORS.purpleMuted, borderColor: COLORS.purple + '30' }]}>
                    <Text style={[styles.paymentBadgeText, { color: COLORS.purple }]}>{t('settingsEdit.badgeOptional')}</Text>
                  </View>
                </View>
                <View style={[styles.inputContainer, { borderColor: COLORS.purple + '30' }]}>
                  <Text style={styles.countryCode}>+509</Text>
                  <TextInput
                    style={styles.input}
                    value={natcashValue}
                    onChangeText={setNatcashValue}
                    placeholder={t('field.phone')}
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
                  placeholder={t(meta.placeholderKey)}
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

          {field === 'email' && user?.email && !user.email_verified && (
            <TouchableOpacity
              style={styles.verifyCard}
              activeOpacity={0.8}
              onPress={handleVerifyEmail}
              disabled={sendingVerification}
            >
              <View style={styles.verifyIconWrap}>
                <MaterialCommunityIcons name="email-fast-outline" size={18} color={COLORS.white} />
              </View>
              <View style={styles.verifyTextWrap}>
                <Text style={styles.verifyTitle}>{t('verify.title')}</Text>
                <Text style={styles.verifySubtitle}>
                  {sendingVerification ? t('settingsEdit.sendingVerificationLink') : t('settingsEdit.resendVerificationLink')}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text3} />
            </TouchableOpacity>
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
              <LinearGradient
                colors={ONBOARDING_GRADIENT}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.saveButtonInner}
              >
                {loading ? (
                  <ActivityIndicator color={ONBOARDING_COLORS.white} />
                ) : (
                  <Text style={styles.saveButtonText}>{t('settingsEdit.save')}</Text>
                )}
              </LinearGradient>
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
  saveTopBtn: { fontSize: FONT_SIZES.md, fontWeight: FONT_WEIGHTS.bold, color: ONBOARDING_COLORS.violet },

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
    color: ONBOARDING_COLORS.sub,
    lineHeight: 22,
  },

  /* Input cards */
  inputCard: {
    marginHorizontal: SPACING.lg,
    backgroundColor: ONBOARDING_COLORS.surface,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: ONBOARDING_COLORS.border,
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
    color: ONBOARDING_COLORS.sub,
    fontWeight: FONT_WEIGHTS.medium,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.lg,
    minHeight: 52,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZES.lg,
    color: ONBOARDING_COLORS.text,
    paddingVertical: SPACING.md,
    fontWeight: FONT_WEIGHTS.medium,
  },
  multilineInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  divider: {
    height: 1,
    backgroundColor: ONBOARDING_COLORS.border,
    marginLeft: SPACING.lg + 40 + SPACING.md,
  },
  countryCode: {
    fontSize: FONT_SIZES.lg,
    color: ONBOARDING_COLORS.sub,
    fontWeight: FONT_WEIGHTS.semibold,
  },

  /* Payment cards */
  paymentCard: {
    marginHorizontal: SPACING.lg,
    backgroundColor: ONBOARDING_COLORS.surface,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: ONBOARDING_COLORS.border,
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
    backgroundColor: 'rgba(0, 194, 255, 0.15)',
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
    color: ONBOARDING_COLORS.text,
  },
  paymentSub: {
    fontSize: FONT_SIZES.xs,
    color: ONBOARDING_COLORS.sub,
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
    color: ONBOARDING_COLORS.faint,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
  },

  /* Inline verification card */
  verifyCard: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    backgroundColor: ONBOARDING_COLORS.surface,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: ONBOARDING_COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  verifyIconWrap: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.sm,
    backgroundColor: ONBOARDING_COLORS.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyTextWrap: {
    flex: 1,
  },
  verifyTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: ONBOARDING_COLORS.text,
  },
  verifySubtitle: {
    fontSize: FONT_SIZES.xs,
    color: ONBOARDING_COLORS.sub,
    marginTop: 2,
  },

  /* Save button */
  saveButton: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
    borderRadius: RADIUS.card,
    overflow: 'hidden',
  },
  saveButtonInner: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: ONBOARDING_COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },

  bottomSpacer: {
    height: 60,
  },
});
