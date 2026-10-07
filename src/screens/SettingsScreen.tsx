import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS, TIER_COLORS } from '../theme';
import { ONBOARDING_COLORS } from './onboarding/theme';
import { store } from '../store';
import { useUser } from '../hooks';
import { useLowDataMode } from '../hooks/useLowDataMode';

import ScreenContainer from '../components/ScreenContainer';
import ScreenHeader from '../components/ScreenHeader';
import SettingsGroup from '../components/SettingsGroup';
import SettingsRow from '../components/SettingsRow';
import SettingsToggle from '../components/SettingsToggle';
import ProfileCard from '../components/ProfileCard';
import ConfirmModal from '../components/ConfirmModal';
import { useTranslation } from '@/localization';
import { useFocusEffect } from '@react-navigation/native';
import { updateProfile } from '../api';
import { useToast } from '../components/Toast';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export default function SettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { user, refetch } = useUser();
  const lowDataMode = useLowDataMode();
  const toast = useToast();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showName, setShowName] = useState(user?.show_real_name ?? true);
  const [savingName, setSavingName] = useState(false);

  useFocusEffect(useCallback(() => {
    void refetch();
  }, [refetch]));
  useEffect(() => setShowName(user?.show_real_name ?? true), [user?.show_real_name]);

  const isSeller = user?.role === 'seller';
  const tierLabel =
    user?.seller_tier === 'business' ? t('settings.businessSeller')
    : user?.seller_tier === 'verified' ? t('settings.verifiedSeller')
    : user?.seller_tier === 'casual' ? t('settings.casualSeller')
    : '';
  const tierColor = user?.seller_tier ? TIER_COLORS[user.seller_tier] ?? COLORS.text2 : undefined;

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm(t('settings.logoutConfirm'))) {
        store.logout();
      }
      return;
    }
    setShowLogoutModal(true);
  };

  const handleToggleName = async (nextValue: boolean) => {
    const previous = showName;
    setShowName(nextValue);
    setSavingName(true);
    try {
      await updateProfile({ showRealName: String(nextValue) });
      if (store.user && store.token) {
        await store.setUser({ ...store.user, show_real_name: nextValue } as any, store.token);
      }
    } catch {
      setShowName(previous);
      toast.show({ kind: 'error', title: t('privacy.profileVisibilityFailed') });
    } finally {
      setSavingName(false);
    }
  };

  return (
    <ScreenContainer>
      <ScreenHeader title={t('settings.title')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Profile Hero Card ── */}
        <ProfileCard compact user={user} onPress={() => navigation.navigate('EditProfile')} />

        {/* ── 1. Account & Identity ── */}
        <View>
          <SettingsGroup header={t('settings.sectionAccountIdentity')} appearance="minimal">
            <SettingsRow
              icon="account-edit-outline"
              label={t('me.editProfile')}
              chevron
              appearance="minimal"
              divider
              onPress={() => navigation.navigate('EditProfile')}
            />
            <SettingsRow
              icon="account-cog-outline"
              label={t('settings.accountSettings')}
              value={user?.username ? `@${user.username}` : undefined}
              chevron
              appearance="minimal"
              divider
              onPress={() => navigation.navigate('AccountDashboard')}
            />
            <SettingsRow
              icon="account-eye-outline"
              label={t('settings.showNameOnProfile')}
              appearance="minimal"
              rightElement={(
                <SettingsToggle
                  value={showName}
                  onValueChange={handleToggleName}
                  disabled={savingName}
                  accessibilityLabel={t('settings.showNameOnProfile')}
                />
              )}
            />
          </SettingsGroup>
        </View>

        {/* ── 2. Preferences ── */}
        <View>
          <SettingsGroup header={t('settings.preferences')} appearance="minimal">
            <SettingsRow
              icon="translate"
              label={t('language.title')}
              chevron
              appearance="minimal"
              divider
              onPress={() => navigation.navigate('LanguageSettings')}
            />
            <SettingsRow
              icon="palette-outline"
              label={t('appearance.title')}
              chevron
              appearance="minimal"
              divider
              onPress={() => navigation.navigate('AppearanceSettings')}
            />
            <SettingsRow
              icon="signal-cellular-outline"
              label={t('settings.lowDataMode')}
              appearance="minimal"
              divider
              rightElement={(
                <SettingsToggle
                  value={lowDataMode}
                  onValueChange={(enabled) => { void store.setLowDataMode(enabled).catch(() => {}); }}
                  accessibilityLabel={t('settings.lowDataMode')}
                />
              )}
            />
            <SettingsRow
              icon="bell-outline"
              label={t('settings.notificationPrefs')}
              chevron
              appearance="minimal"
              onPress={() => navigation.navigate('NotificationsSettings')}
            />
          </SettingsGroup>
        </View>

        {/* ── 3. Payments & Selling ── */}
        <View>
          <SettingsGroup header={t('settings.sectionPaymentsSelling')} appearance="minimal">
            <SettingsRow
              icon="cash"
              label={t('settings.paymentMethods')}
              chevron
              appearance="minimal"
              divider
              onPress={() => navigation.navigate('Payments')}
            />
            {isSeller ? (
              <>
                <SettingsRow
                  icon="bank-transfer-out"
                  label={t('settings.payouts')}
                  chevron
                  appearance="minimal"
                  divider
                  onPress={() => navigation.navigate('Payments')}
                />
                <SettingsRow
                  icon="storefront-outline"
                  label={t('settings.sellerTools')}
                  value={tierLabel}
                  valueColor={tierColor || COLORS.coral}
                  chevron
                  appearance="minimal"
                  onPress={() => navigation.navigate('SellerToolsSettings')}
                />
              </>
            ) : (
              <SettingsRow
                icon="store-plus-outline"
                label={t('me.becomeSeller')}
                chevron
                appearance="minimal"
                onPress={() => navigation.navigate('SellerOnboarding')}
              />
            )}
          </SettingsGroup>
        </View>

        {/* ── 4. Safety & Privacy ── */}
        <View>
          <SettingsGroup header={t('settings.sectionSafetyPrivacy')} appearance="minimal">
            <SettingsRow
              icon="shield-account-outline"
              label={t('settings.privacySettings')}
              chevron
              appearance="minimal"
              divider
              onPress={() => navigation.navigate('PrivacySettings')}
            />
            <SettingsRow
              icon="account-cancel-outline"
              label="Blocked Accounts"
              chevron
              appearance="minimal"
              divider
              onPress={() => navigation.navigate('BlockedUsers')}
            />
            <SettingsRow
              icon="shield-lock-outline"
              label={t('settings.passwordAuth')}
              chevron
              appearance="minimal"
              onPress={() => navigation.navigate('SecuritySettings')}
            />
          </SettingsGroup>
        </View>

        {/* ── 5. Support & About ── */}
        <View>
          {String((user as any)?.role) === 'admin' ? (
            <SettingsGroup header={t('settings.adminTools')} appearance="minimal">
              <SettingsRow
                icon="cash-sync"
                label={t('settings.moncashSupport')}
                chevron
                appearance="minimal"
                divider
                onPress={() => navigation.navigate('MonCashSupport')}
              />
            </SettingsGroup>
          ) : null}
          <SettingsGroup header={t('settings.helpSupport')} appearance="minimal">
            <SettingsRow
              icon="file-document-outline"
              label={t('legal.title')}
              chevron
              appearance="minimal"
              divider
              onPress={() => navigation.navigate('LegalPrivacy')}
            />
            <SettingsRow
              icon="help-circle-outline"
              label={t('settings.helpSupport')}
              chevron
              appearance="minimal"
              onPress={() => navigation.navigate('HelpSupport')}
              divider
            />
            <SettingsRow
              icon="information-outline"
              label={t('settings.version')}
              value="MaurMaket v1.0.0"
              appearance="minimal"
            />
          </SettingsGroup>
        </View>

        {/* ── Log out ── */}
        <View>
          <View style={styles.logoutSpacer} />
          <TouchableOpacity
            style={styles.logoutButtonWrap}
            activeOpacity={0.7}
            onPress={handleLogout}
            accessibilityRole="button"
            accessibilityLabel={t('settings.logout')}
          >
            <View style={styles.logoutButton}>
              <MaterialCommunityIcons name="logout" size={20} color={COLORS.coral} />
              <Text style={styles.logoutText}>{t('settings.logout')}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Bottom safe area ── */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      <ConfirmModal
        visible={showLogoutModal}
        title={t('settings.logout')}
        message={t('settings.logoutConfirm')}
        confirmLabel={t('settings.logout')}
        cancelLabel={t('common.cancel')}
        kind="warning"
        onConfirm={() => {
          setShowLogoutModal(false);
          store.logout();
        }}
        onCancel={() => setShowLogoutModal(false)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: SPACING.page,
  },
  logoutSpacer: {
    height: SPACING.xxxl,
  },
  logoutButtonWrap: {
    marginHorizontal: SPACING.lg,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
    minHeight: 52,
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  logoutText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.coral,
  },
  bottomSpacer: {
    height: 60,
  },
});
