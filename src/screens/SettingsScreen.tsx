import React from 'react';
import { View, Text, Image, ScrollView, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS, TOUCH, TIER_COLORS, getDisplayName } from '../theme';
import { store } from '../store';
import { useUser } from '../hooks';
import { getImageUrl } from '../api';
import moncashLogo from '../../assets/MonNatCash/moncash.webp';
import natcashLogo from '../../assets/MonNatCash/natcash.webp';
import ScreenContainer from '../components/ScreenContainer';
import ScreenHeader from '../components/ScreenHeader';
import SettingsCard from '../components/SettingsCard';
import SectionHeader from '../components/SectionHeader';
import CardRow from '../components/CardRow';
import { i18n, useTranslation } from '../i18n';
import { useToast } from '../components/Toast';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

/* ── Helpers ────────────────────────────────────────────── */

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/* ── Component ──────────────────────────────────────────── */

export default function SettingsScreen({ navigation }: Props) {
  const { t, language } = useTranslation();
  const toast = useToast();
  const { user } = useUser();

  const isSeller = user?.role === 'seller';
  const tierLabel =
    user?.seller_tier === 'business' ? t('settings.businessSeller')
    : user?.seller_tier === 'verified' ? t('settings.verifiedSeller')
    : user?.seller_tier === 'casual' ? t('settings.casualSeller')
    : '';
  const tierColor = user?.seller_tier ? TIER_COLORS[user.seller_tier] ?? COLORS.text2 : undefined;

  const langLabel = language === 'en' ? 'English' : language === 'ht' ? 'Kreyòl' : 'Français';

  const avatarUri = user?.avatar_url ? getImageUrl(user.avatar_url) : null;
  const displayName = getDisplayName(user);
  const initials = getInitials(displayName);

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm(t('settings.logoutConfirm'))) {
        store.logout();
      }
      return;
    }
    toast.show({
      kind: 'warning',
      title: t('settings.logout'),
      message: t('settings.logoutConfirm'),
      actionLabel: t('settings.logout'),
      onAction: () => store.logout(),
    });
  };

  /* ── Tier badge (small pill in profile hero) ──── */
  const tierBadge = tierLabel ? (
    <View style={[styles.tierPill, { backgroundColor: (tierColor ?? COLORS.text2) + '20' }]}>
      <Text style={[styles.tierPillText, { color: tierColor ?? COLORS.text2 }]}>{tierLabel}</Text>
    </View>
  ) : null;

  return (
    <ScreenContainer>
      <ScreenHeader title={t('settings.title')} onBack={() => navigation.goBack()} titleSize={20} backSize={24} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Profile Hero ── */}
        <TouchableOpacity
          style={styles.profileHero}
          activeOpacity={0.65}
          onPress={() => navigation.navigate('EditProfile')}
          accessibilityRole="button"
          accessibilityLabel={t('settings.editProfile')}
        >
          <View style={styles.avatarOuter}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName} numberOfLines={1}>{displayName}</Text>
            {user?.username ? (
              <Text style={styles.profileUsername}>@{user.username}</Text>
            ) : null}
            <View style={styles.profileMeta}>
              {tierBadge}
              {user?.email_verified ? (
                <View style={styles.verifiedBadge}>
                  <MaterialCommunityIcons name="check-circle" size={13} color={COLORS.green} />
                  <Text style={styles.verifiedText}>{t('settings.emailVerified')}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.text3} />
        </TouchableOpacity>

        {/* ── Account ── */}
        <SectionHeader title={t('settings.sectionAccount') || 'Account'} />
        <SettingsCard>
          <CardRow
            icon="email-outline"
            label={t('settings.email')}
            value={user?.email}
            chevron
            onPress={() => navigation.navigate('SettingsEdit', { field: 'email', title: t('settings.email') })}
            divider
          />

          {/* Phone row with payment badges (custom layout) */}
          <View style={styles.phoneRow}>
            <View style={styles.phoneIcon}>
              <MaterialCommunityIcons name="phone-outline" size={20} color={COLORS.text2} />
            </View>
            <Text style={styles.phoneLabel}>{t('settings.phone')}</Text>
            <View style={styles.phoneBadges}>
              {user?.phone ? (
                <View style={styles.badge}>
                  <Image source={moncashLogo} style={styles.badgeIcon} resizeMode="cover" />
                  <Text style={styles.badgeText}>MC</Text>
                </View>
              ) : null}
              {user?.natcash_phone ? (
                <View style={[styles.badge, styles.badgeNat]}>
                  <Image source={natcashLogo} style={styles.badgeIcon} resizeMode="cover" />
                  <Text style={[styles.badgeText, styles.badgeTextNat]}>NC</Text>
                </View>
              ) : null}
              {!user?.phone && !user?.natcash_phone ? (
                <Text style={styles.notSet}>{t('settings.buyer')}</Text>
              ) : null}
            </View>
            <MaterialCommunityIcons name="chevron-right" size={16} color={COLORS.text3} />
          </View>

          <CardRow
            icon="at"
            label={t('username.label')}
            value={user?.username ? `@${user.username}` : undefined}
            chevron
            onPress={() => navigation.navigate('UsernameSettings')}
            divider
          />
          <CardRow
            icon="lock-outline"
            label={t('settings.changePassword')}
            value="••••••••"
            chevron
            onPress={() => navigation.navigate('SettingsEdit', { field: 'password', title: t('settings.changePassword') })}
            divider
          />
          <CardRow
            icon="translate"
            label={t('settings.language')}
            value={langLabel}
            chevron
            onPress={() => navigation.navigate('LanguageSettings')}
          />
        </SettingsCard>

        {/* ── Shopping ── */}
        <SectionHeader title={t('settings.sectionShopping') || 'Shopping'} />
        <SettingsCard>
          <CardRow
            icon="map-marker-outline"
            iconColor={COLORS.green}
            label={t('settings.deliveryLocation')}
            value={user?.location_city}
            chevron
            onPress={() => navigation.navigate('LocationSettings')}
            divider
          />
          <CardRow
            icon="home-outline"
            label={t('me.addresses')}
            chevron
            onPress={() => navigation.navigate('Addresses')}
          />
        </SettingsCard>

        {/* ── Selling ── */}
        <SectionHeader title={t('settings.sectionSelling') || 'Selling'} />
        <SettingsCard>
          <CardRow
            icon={isSeller ? 'storefront-outline' : 'store-plus-outline'}
            iconColor={isSeller ? COLORS.blue : COLORS.green}
            label={isSeller ? t('settings.sellerTools') : t('me.becomeSeller')}
            value={isSeller ? tierLabel : undefined}
            valueColor={isSeller ? COLORS.green : undefined}
            chevron
            onPress={() => navigation.navigate(isSeller ? 'SellerToolsSettings' : 'SellerOnboarding')}
          />
        </SettingsCard>

        {/* ── Privacy ── */}
        <SectionHeader title={t('settings.sectionPrivacy') || 'Privacy'} />
        <SettingsCard>
          <CardRow
            icon="shield-lock-outline"
            label={t('settings.profileVisibility') || 'Profile visibility'}
            value={user?.show_real_name ? (t('settings.nameVisible') || 'Name visible') : (t('settings.nameHidden') || 'Name hidden')}
            chevron
            onPress={() => navigation.navigate('PrivacySettings')}
          />
        </SettingsCard>

        {/* ── App ── */}
        <SectionHeader title={t('settings.sectionApp') || 'App'} />
        <SettingsCard>
          <CardRow
            icon="information-outline"
            label={t('settings.version') || 'Version'}
            value="MaurMaket v1.0.0"
          />
        </SettingsCard>

        {/* ── Log out ── */}
        <View style={styles.logoutSpacer} />
        <SettingsCard>
          <CardRow
            icon="logout"
            iconColor={COLORS.coral}
            label={t('settings.logout')}
            valueColor={COLORS.coral}
            onPress={handleLogout}
          />
        </SettingsCard>

        {/* ── Bottom safe area ── */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </ScreenContainer>
  );
}

/* ── Styles ──────────────────────────────────────────────── */

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: SPACING.page,
  },

  /* Profile hero */
  profileHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  avatarOuter: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: COLORS.surface2,
  },
  avatarImg: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 20,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text2,
  },
  profileInfo: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
  },
  profileUsername: {
    fontSize: FONT_SIZES.base,
    color: COLORS.text2,
  },
  profileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: 2,
  },
  tierPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
  },
  tierPillText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  verifiedText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.green,
    fontWeight: FONT_WEIGHTS.semibold,
  },

  /* Phone row (custom layout for payment badges) */
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    minHeight: TOUCH.min,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  phoneIcon: {
    width: 28,
    alignItems: 'center',
  },
  phoneLabel: {
    flex: 1,
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.text,
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
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
  },
  badgeNat: {
    backgroundColor: COLORS.purpleMuted,
  },
  badgeIcon: {
    width: 12,
    height: 12,
  },
  badgeText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.blue,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  badgeTextNat: {
    color: COLORS.purple,
  },
  notSet: {
    fontSize: FONT_SIZES.base,
    color: COLORS.text2,
  },

  /* Footer */
  logoutSpacer: {
    height: SPACING.xl,
  },
  bottomSpacer: {
    height: 60,
  },
});
