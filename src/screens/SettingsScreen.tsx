import React from 'react';
import { View, Text, Image, ScrollView, StyleSheet, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS, TOUCH } from '../theme';
import { store } from '../store';
import { useUser } from '../hooks';
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

export default function SettingsScreen({ navigation }: Props) {
  const { t, language } = useTranslation();
  const toast = useToast();
  const { user } = useUser();

  const tierLabel =
    user?.seller_tier === 'business'
      ? 'Business'
      : user?.seller_tier === 'verified'
        ? 'Verified'
        : user?.seller_tier === 'casual'
          ? 'Casual'
          : '';

  const langLabel =
    language === 'en' ? 'English' : language === 'ht' ? 'Kreyòl' : 'Français';

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

  return (
    <ScreenContainer>
      <ScreenHeader
        title={t('settings.title')}
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Account ── */}
        <SectionHeader title={t('settings.account') || 'Account'} />
        <SettingsCard>
          <CardRow
            icon="email-outline"
            label={t('settings.email')}
            value={user?.email}
            chevron
            onPress={() =>
              navigation.navigate('SettingsEdit', {
                field: 'email',
                title: t('settings.email'),
              })
            }
            divider
          />
          <View style={styles.phoneRow}>
            <View style={styles.phoneIcon}>
              <MaterialCommunityIcons
                name="phone-outline"
                size={20}
                color={COLORS.text2}
              />
            </View>
            <Text style={styles.phoneLabel}>{t('settings.phone')}</Text>
            <View style={styles.phoneBadges}>
              {user?.phone && (
                <View style={styles.badge}>
                  <Image
                    source={moncashLogo}
                    style={styles.badgeIcon}
                    resizeMode="cover"
                  />
                  <Text style={styles.badgeText}>MC</Text>
                </View>
              )}
              {user?.natcash_phone && (
                <View style={[styles.badge, styles.badgeNat]}>
                  <Image
                    source={natcashLogo}
                    style={styles.badgeIcon}
                    resizeMode="cover"
                  />
                  <Text style={[styles.badgeText, styles.badgeTextNat]}>
                    NC
                  </Text>
                </View>
              )}
              {!user?.phone && !user?.natcash_phone && (
                <Text style={styles.notSet}>{t('settings.notSet') || 'Not set'}</Text>
              )}
            </View>
            <MaterialCommunityIcons
              name="chevron-right"
              size={16}
              color={COLORS.text3}
            />
          </View>
          <CardRow
            icon="lock-outline"
            label={t('settings.changePassword')}
            value="••••••••"
            chevron
            onPress={() =>
              navigation.navigate('SettingsEdit', {
                field: 'password',
                title: t('settings.changePassword'),
              })
            }
          />
        </SettingsCard>

        {/* ── Privacy ── */}
        <SectionHeader title={t('settings.privacy') || 'Privacy'} />
        <SettingsCard>
          <CardRow
            icon="shield-lock-outline"
            label={t('settings.profileVisibility') || 'Profile visibility'}
            value={user?.show_real_name ? (t('settings.nameVisible') || 'Name visible') : (t('settings.nameHidden') || 'Name hidden')}
            chevron
            onPress={() => navigation.navigate('PrivacySettings')}
          />
        </SettingsCard>

        {/* ── Location ── */}
        <SectionHeader title={t('settings.location') || 'Location'} />
        <SettingsCard>
          <CardRow
            icon="map-marker-outline"
            iconColor={COLORS.green}
            label={t('settings.deliveryAddress') || 'Delivery address'}
            value={user?.location_city}
            chevron
            onPress={() => navigation.navigate('LocationSettings')}
          />
        </SettingsCard>

        {/* ── Seller ── */}
        <SectionHeader title={t('settings.verification') || 'Verification & tier'} />
        <SettingsCard>
          <CardRow
            icon="shield-check-outline"
            iconColor={COLORS.yellow}
            label={t('settings.sellerTools') || 'Seller tools'}
            value={tierLabel}
            valueColor={tierLabel ? COLORS.green : COLORS.text2}
            chevron
            onPress={() => navigation.navigate('SellerToolsSettings')}
          />
        </SettingsCard>

        {/* ── Preferences ── */}
        <SectionHeader title={t('settings.preferences') || 'Preferences'} />
        <SettingsCard>
          <CardRow
            icon="translate"
            label={t('settings.language')}
            value={langLabel}
            chevron
            onPress={() => navigation.navigate('LanguageSettings')}
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

        {/* ── Version ── */}
        <Text style={styles.version}>MaurMaket v1.0.0</Text>

        {/* ── Bottom safe area ── */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: SPACING.page,
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
  version: {
    textAlign: 'center',
    fontSize: FONT_SIZES.xs,
    color: COLORS.text3,
    marginTop: SPACING.xl,
  },
  bottomSpacer: {
    height: 60,
  },
});


