import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, TouchableOpacity, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS, TIER_COLORS } from '../theme';
import { ONBOARDING_COLORS, ONBOARDING_GRADIENT } from './onboarding/theme';
import { store } from '../store';
import { useUser } from '../hooks';

import ScreenContainer from '../components/ScreenContainer';
import ScreenHeader from '../components/ScreenHeader';
import SettingsGroup from '../components/SettingsGroup';
import SettingsRow from '../components/SettingsRow';
import ProfileCard from '../components/ProfileCard';
import ConfirmModal from '../components/ConfirmModal';
import { useTranslation } from '@/localization';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

/* ── Component ──────────────────────────────────────────── */

export default function SettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { user } = useUser();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Staggered entrance animations — 9 sections (profile + 7 groups + logout)
  const sections = useRef(
    Array.from({ length: 9 }, () => ({
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(16),
    }))
  ).current;

  useEffect(() => {
    Animated.stagger(60,
      sections.map(s =>
        Animated.parallel([
          Animated.timing(s.opacity, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(s.translateY, { toValue: 0, duration: 350, useNativeDriver: true }),
        ])
      )
    ).start();
  }, []);

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

  const animStyle = (i: number) => ({
    opacity: sections[i].opacity,
    transform: [{ translateY: sections[i].translateY }],
  });

  return (
    <ScreenContainer>
      <ScreenHeader title={t('settings.title')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Profile Hero ── */}
        <Animated.View style={animStyle(0)}>
          <ProfileCard user={user} onPress={() => navigation.navigate('EditProfile')} />
        </Animated.View>

        {/* ── Account ── */}
        <Animated.View style={animStyle(1)}>
          <SettingsGroup
            header={t('settings.sectionAccount')}
            accentColor={COLORS.blue}
          >
            <SettingsRow
              icon="account-cog-outline"
              label={t('settings.accountSettings')}
              subtitle={t('settings.profileContact')}
              value={user?.username ? `@${user.username}` : undefined}
              chevron
              onPress={() => navigation.navigate('AccountDashboard')}
            />
          </SettingsGroup>
        </Animated.View>

        {/* ── Payments ── */}
        <Animated.View style={animStyle(2)}>
          <SettingsGroup header={t('settings.payments')}>
            <SettingsRow
              icon="cash"
              label={t('settings.paymentMethods')}
              subtitle={t('settings.moncashNatcash')}
              chevron
              onPress={() => navigation.navigate('Payments')}
              divider
            />
            {isSeller ? (
              <SettingsRow
              icon="bank-transfer-out"
              label={t('settings.payouts')}
              subtitle={t('settings.manageEarnings')}
              chevron
              onPress={() => navigation.navigate('Payments')}
              />
            ) : null}
          </SettingsGroup>
        </Animated.View>

        {/* ── Notifications ── */}
        <Animated.View style={animStyle(3)}>
          <SettingsGroup header={t('settings.notifications')}>
            <SettingsRow
              icon="bell-outline"
              label={t('settings.notificationPrefs')}
              subtitle={t('settings.chooseNotifs')}
              chevron
              onPress={() => navigation.navigate('NotificationsSettings')}
            />
          </SettingsGroup>
        </Animated.View>

        {/* ── Security ── */}
        <Animated.View style={animStyle(4)}>
          <SettingsGroup header={t('settings.security')}>
            <SettingsRow
              icon="shield-lock-outline"
              label={t('settings.passwordAuth')}
              subtitle={t('settings.password2fa')}
              chevron
              onPress={() => navigation.navigate('SecuritySettings')}
            />
          </SettingsGroup>
        </Animated.View>

        {/* ── Privacy ── */}
        <Animated.View style={animStyle(5)}>
          <SettingsGroup
            header={t('settings.sectionPrivacy')}
            accentColor="#8B5CF6"
          >
            <SettingsRow
              icon="eye-outline"
              label={t('settings.profileVisibility')}
              subtitle={t('settings.nameVisibleHidden')}
              chevron
              onPress={() => navigation.navigate('PrivacySettings')}
            />
          </SettingsGroup>
        </Animated.View>

        {/* ── Selling ── */}
        <Animated.View style={animStyle(6)}>
          <SettingsGroup
            header={t('settings.sectionSelling')}
            accentColor={isSeller ? COLORS.blue : COLORS.coral}
          >
            <SettingsRow
              icon={isSeller ? 'storefront-outline' : 'store-plus-outline'}
              label={isSeller ? t('settings.sellerTools') : t('me.becomeSeller')}
              subtitle={isSeller ? t('settings.tierSeller', { tier: tierLabel }) : t('me.startSelling')}
              value={isSeller ? tierLabel : undefined}
              valueColor={isSeller ? (tierColor || COLORS.green) : undefined}
              chevron
              onPress={() => navigation.navigate(isSeller ? 'SellerToolsSettings' : 'SellerOnboarding')}
            />
          </SettingsGroup>
        </Animated.View>

        {/* ── App ── */}
        <Animated.View style={animStyle(7)}>
          <SettingsGroup header={t('settings.app')}>
            <SettingsRow
              icon="palette-outline"
              label={t('appearance.title')}
              subtitle={t('appearance.subtitle')}
              chevron
              onPress={() => navigation.navigate('AppearanceSettings')}
              divider
            />
            <SettingsRow
              icon="help-circle-outline"
              label={t('settings.helpSupport')}
              subtitle={t('settings.helpDesc')}
              chevron
              onPress={() => navigation.navigate('HelpSupport')}
              divider
            />
            <SettingsRow
              icon="information-outline"
              label={t('settings.version')}
              value="MaurMaket v1.0.0"
            />
          </SettingsGroup>
        </Animated.View>

        {/* ── Log out ── */}
        <Animated.View style={animStyle(8)}>
          <View style={styles.logoutSpacer} />
          <TouchableOpacity
            style={styles.logoutButtonWrap}
            activeOpacity={0.7}
            onPress={handleLogout}
          >
            <LinearGradient
              colors={ONBOARDING_GRADIENT}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.logoutButton}
            >
              <MaterialCommunityIcons name="logout" size={20} color={ONBOARDING_COLORS.white} />
              <Text style={styles.logoutText}>{t('settings.logout')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

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

/* ── Styles ──────────────────────────────────────────────── */

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
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: ONBOARDING_COLORS.borderHi,
  },
  logoutText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.semibold,
    color: ONBOARDING_COLORS.white,
  },
  bottomSpacer: {
    height: 60,
  },
});
