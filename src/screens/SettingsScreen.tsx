import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, TouchableOpacity, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS, TIER_COLORS } from '../theme';
import { store } from '../store';
import { useUser } from '../hooks';

import ScreenContainer from '../components/ScreenContainer';
import ScreenHeader from '../components/ScreenHeader';
import SettingsGroup from '../components/SettingsGroup';
import SettingsRow from '../components/SettingsRow';
import ProfileCard from '../components/ProfileCard';
import ConfirmModal from '../components/ConfirmModal';
import { useTranslation } from '../i18n';

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
            header={t('settings.sectionAccount') || 'Account'}
            accentColor={COLORS.blue}
          >
            <SettingsRow
              icon="account-cog-outline"
              label="Account settings"
              subtitle="Profile, contact info, preferences"
              value={user?.username ? `@${user.username}` : undefined}
              chevron
              onPress={() => navigation.navigate('AccountDashboard')}
            />
          </SettingsGroup>
        </Animated.View>

        {/* ── Payments ── */}
        <Animated.View style={animStyle(2)}>
          <SettingsGroup header="Payments">
            <SettingsRow
              icon="cash"
              label="Payment methods"
              subtitle="MonCash & NatCash"
              chevron
              onPress={() => navigation.navigate('Payments')}
              divider
            />
            {isSeller ? (
              <SettingsRow
              icon="bank-transfer-out"
              label="Payouts"
              subtitle="Manage your earnings"
              chevron
              onPress={() => navigation.navigate('Payments')}
              />
            ) : null}
          </SettingsGroup>
        </Animated.View>

        {/* ── Notifications ── */}
        <Animated.View style={animStyle(3)}>
          <SettingsGroup header="Notifications">
            <SettingsRow
              icon="bell-outline"
              label="Notification preferences"
              subtitle="Choose what you get notified about"
              chevron
              onPress={() => navigation.navigate('NotificationsSettings')}
            />
          </SettingsGroup>
        </Animated.View>

        {/* ── Security ── */}
        <Animated.View style={animStyle(4)}>
          <SettingsGroup header="Security">
            <SettingsRow
              icon="shield-lock-outline"
              label="Password & authentication"
              subtitle="Password, 2FA, trusted devices"
              chevron
              onPress={() => navigation.navigate('SecuritySettings')}
            />
          </SettingsGroup>
        </Animated.View>

        {/* ── Privacy ── */}
        <Animated.View style={animStyle(5)}>
          <SettingsGroup
            header={t('settings.sectionPrivacy') || 'Privacy'}
            accentColor="#8B5CF6"
          >
            <SettingsRow
              icon="eye-outline"
              label="Privacy controls"
              subtitle="Profile visibility, data, blocked users"
              chevron
              onPress={() => navigation.navigate('PrivacySettings')}
            />
          </SettingsGroup>
        </Animated.View>

        {/* ── Selling ── */}
        <Animated.View style={animStyle(6)}>
          <SettingsGroup
            header={t('settings.sectionSelling') || 'Selling'}
            accentColor={isSeller ? COLORS.blue : COLORS.coral}
          >
            <SettingsRow
              icon={isSeller ? 'storefront-outline' : 'store-plus-outline'}
              label={isSeller ? t('settings.sellerTools') || 'Seller tools' : t('me.becomeSeller') || 'Become a seller'}
              subtitle={isSeller ? `${tierLabel} seller` : 'Start selling on MaurMaket'}
              value={isSeller ? tierLabel : undefined}
              valueColor={isSeller ? (tierColor || COLORS.green) : undefined}
              chevron
              onPress={() => navigation.navigate(isSeller ? 'SellerToolsSettings' : 'SellerOnboarding')}
            />
          </SettingsGroup>
        </Animated.View>

        {/* ── App ── */}
        <Animated.View style={animStyle(7)}>
          <SettingsGroup header="App">
            <SettingsRow
              icon="palette-outline"
              label="Appearance"
              subtitle="Theme, accent color, app icon"
              chevron
              onPress={() => navigation.navigate('AppearanceSettings')}
              divider
            />
            <SettingsRow
              icon="help-circle-outline"
              label="Help & Support"
              subtitle="FAQs, contact, report a problem"
              chevron
              onPress={() => navigation.navigate('HelpSupport')}
              divider
            />
            <SettingsRow
              icon="information-outline"
              label={t('settings.version') || 'Version'}
              value="MaurMaket v1.0.0"
            />
          </SettingsGroup>
        </Animated.View>

        {/* ── Log out ── */}
        <Animated.View style={animStyle(8)}>
          <View style={styles.logoutSpacer} />
          <TouchableOpacity
            style={styles.logoutButton}
            activeOpacity={0.7}
            onPress={handleLogout}
          >
            <MaterialCommunityIcons name="logout" size={20} color={COLORS.coral} />
            <Text style={styles.logoutText}>{t('settings.logout')}</Text>
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
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    backgroundColor: COLORS.coralMuted,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.coral + '20',
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
