import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, TouchableOpacity, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS, TIER_COLORS } from '../theme';
import { store } from '../store';
import { useUser } from '../hooks';
import { resendVerificationEmail } from '../api';
import moncashLogo from '../../assets/MonNatCash/moncash.webp';
import natcashLogo from '../../assets/MonNatCash/natcash.webp';
import ScreenContainer from '../components/ScreenContainer';
import ScreenHeader from '../components/ScreenHeader';
import SettingsGroup from '../components/SettingsGroup';
import SettingsRow from '../components/SettingsRow';
import ProfileCard from '../components/ProfileCard';
import ConfirmModal from '../components/ConfirmModal';
import { useTranslation } from '../i18n';
import { useToast } from '../components/Toast';
import AuthMethodsCard from '../components/AuthMethodsCard';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

/* ── Component ──────────────────────────────────────────── */

export default function SettingsScreen({ navigation }: Props) {
  const { t, language } = useTranslation();
  const toast = useToast();
  const { user } = useUser();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);

  // Staggered entrance animations
  const sections = useRef(
    Array.from({ length: 8 }, () => ({
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

    // Check Google connection
    const { getMe } = require('../api');
    getMe().then((data: any) => {
      setGoogleConnected(Boolean(data.user?.google_linked || data.user?.accounts?.some((a: any) => a.provider === 'google')));
    }).catch(() => setGoogleConnected(false));
  }, []);

  const handlePasskeyEnroll = async () => {
    if (Platform.OS !== 'web') {
      toast.show({ kind: 'info', title: 'Passkeys are only available on the web version' });
      return;
    }
    try {
      const { API_BASE } = require('../api');
      await require('../api').getMe();
      const res = await fetch(`${API_BASE.replace('/api', '')}/api/auth/passkey/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || 'Failed to register passkey');
      }
      toast.show({ kind: 'success', title: 'Passkey registered successfully' });
    } catch (err: any) {
      toast.show({ kind: 'error', title: err?.message || 'Failed to register passkey' });
    }
  };

  const isSeller = user?.role === 'seller';
  const tierLabel =
    user?.seller_tier === 'business' ? t('settings.businessSeller')
    : user?.seller_tier === 'verified' ? t('settings.verifiedSeller')
    : user?.seller_tier === 'casual' ? t('settings.casualSeller')
    : '';
  const tierColor = user?.seller_tier ? TIER_COLORS[user.seller_tier] ?? COLORS.text2 : undefined;

  const langLabel = language === 'en' ? 'English' : language === 'ht' ? 'Kreyòl' : 'Français';

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
              icon="email-outline"
              iconColor={COLORS.blue}
              iconBg={COLORS.blueMuted}
              label={t('settings.email')}
              value={user?.email}
              chevron
              onPress={() => navigation.navigate('SettingsEdit', { field: 'email', title: t('settings.email') })}
              divider
            />
            {user?.email && !user.email_verified ? (
              <SettingsRow
                icon="email-fast-outline"
                iconColor="#F59E0B"
                iconBg="#F59E0B18"
                label="Verify your email"
                subtitle="Resend verification link"
                chevron
                onPress={async () => {
                  try {
                    await resendVerificationEmail(user.email);
                    toast.show({ kind: 'success', title: 'Verification email sent! Check your inbox.' });
                  } catch (e: any) {
                    toast.show({ kind: 'error', title: e?.message || 'Failed to resend' });
                  }
                }}
                divider
              />
            ) : null}
            <SettingsRow
              icon="phone-outline"
              iconColor={COLORS.green}
              iconBg={COLORS.greenMuted}
              label={t('settings.phone')}
              subtitle={
                user?.phone ? `MonCash: ${user.phone}` :
                user?.natcash_phone ? `NatCash: ${user.natcash_phone}` :
                t('settings.buyer')
              }
              rightElement={
                <View style={styles.phoneBadges}>
                  {user?.phone ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>MC</Text>
                    </View>
                  ) : null}
                  {user?.natcash_phone ? (
                    <View style={[styles.badge, styles.badgeNat]}>
                      <Text style={[styles.badgeText, styles.badgeTextNat]}>NC</Text>
                    </View>
                  ) : null}
                </View>
              }
              chevron
              divider
            />
            <SettingsRow
              icon="at"
              iconBg={COLORS.surface2}
              label={t('username.label')}
              value={user?.username ? `@${user.username}` : undefined}
              chevron
              onPress={() => navigation.navigate('UsernameSettings')}
              divider
            />
            <SettingsRow
              icon="translate"
              iconColor={COLORS.purple}
              iconBg={COLORS.purpleMuted}
              label={t('settings.language')}
              value={langLabel}
              chevron
              onPress={() => navigation.navigate('LanguageSettings')}
            />
          </SettingsGroup>
        </Animated.View>

        {/* ── Sign-in & Security ── */}
        <Animated.View style={animStyle(2)}>
          <SettingsGroup
            header="Sign-in & security"
            accentColor={COLORS.green}
          >
            <AuthMethodsCard googleConnected={googleConnected} onPasskeyEnroll={handlePasskeyEnroll} />
          </SettingsGroup>
          <SettingsGroup style={{ marginTop: -SPACING.xs }}>
            <SettingsRow
              icon="lock-outline"
              iconColor={COLORS.yellow}
              iconBg={COLORS.yellowMuted}
              label={t('settings.changePassword')}
              value="••••••••"
              chevron
              onPress={() => navigation.navigate('SettingsEdit', { field: 'password', title: t('settings.changePassword') })}
            />
          </SettingsGroup>
        </Animated.View>

        {/* ── Shopping ── */}
        <Animated.View style={animStyle(3)}>
          <SettingsGroup
            header={t('settings.sectionShopping') || 'Shopping'}
            accentColor={COLORS.green}
          >
            <SettingsRow
              icon="map-marker-outline"
              iconColor={COLORS.green}
              iconBg={COLORS.greenMuted}
              label={t('settings.deliveryLocation')}
              subtitle={user?.location_city || 'Set your delivery area'}
              chevron
              onPress={() => navigation.navigate('LocationSettings')}
              divider
            />
            <SettingsRow
              icon="home-outline"
              iconBg={COLORS.surface2}
              label={t('me.addresses')}
              subtitle="Manage saved addresses"
              chevron
              onPress={() => navigation.navigate('Addresses')}
            />
          </SettingsGroup>
        </Animated.View>

        {/* ── Selling ── */}
        <Animated.View style={animStyle(4)}>
          <SettingsGroup
            header={t('settings.sectionSelling') || 'Selling'}
            accentColor={isSeller ? COLORS.blue : COLORS.coral}
          >
            <SettingsRow
              icon={isSeller ? 'storefront-outline' : 'store-plus-outline'}
              iconColor={isSeller ? COLORS.blue : COLORS.coral}
              iconBg={isSeller ? COLORS.blueMuted : COLORS.coralMuted}
              label={isSeller ? t('settings.sellerTools') : t('me.becomeSeller')}
              subtitle={isSeller ? `${tierLabel} seller` : 'Start selling on MaurMaket'}
              value={isSeller ? tierLabel : undefined}
              valueColor={isSeller ? (tierColor || COLORS.green) : undefined}
              chevron
              onPress={() => navigation.navigate(isSeller ? 'SellerToolsSettings' : 'SellerOnboarding')}
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
              icon="shield-lock-outline"
              iconColor="#8B5CF6"
              iconBg="#8B5CF618"
              label={t('settings.profileVisibility') || 'Profile visibility'}
              value={user?.show_real_name ? (t('settings.nameVisible') || 'Name visible') : (t('settings.nameHidden') || 'Name hidden')}
              chevron
              onPress={() => navigation.navigate('PrivacySettings')}
            />
          </SettingsGroup>
        </Animated.View>

        {/* ── App ── */}
        <Animated.View style={animStyle(6)}>
          <SettingsGroup
            header={t('settings.sectionApp') || 'App'}
            accentColor={COLORS.text3}
          >
            <SettingsRow
              icon="information-outline"
              iconBg={COLORS.surface2}
              label={t('settings.version') || 'Version'}
              value="MaurMaket v1.0.0"
            />
          </SettingsGroup>
        </Animated.View>

        {/* ── Log out ── */}
        <Animated.View style={animStyle(7)}>
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
  phoneBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.blueMuted,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeNat: {
    backgroundColor: COLORS.purpleMuted,
  },
  badgeText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.blue,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  badgeTextNat: {
    color: COLORS.purple,
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
