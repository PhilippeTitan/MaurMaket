import React, { useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated, Image, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS, TIER_COLORS } from '../theme';
import { ONBOARDING_COLORS } from './onboarding/theme';
import { store } from '../store';
import { useUser } from '../hooks';
import ScreenHeader from '../components/ScreenHeader';
import SettingsGroup from '../components/SettingsGroup';
import ProfileCard from '../components/ProfileCard';
import { useTranslation } from '@/localization';
import { useToast } from '../components/Toast';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'AccountDashboard'>;

/**
 * Account Dashboard
 *
 * Architecture: PROFILE CARD → PERSONAL INFO → CONTACT INFO → PREFERENCES
 *
 * ┌─────────────────────────────────────┐
 * │ PROFILE CARD                        │
 * │  64px avatar, name, @username       │
 * │  tier badge, verification status    │
 * ├─────────────────────────────────────┤
 * │ PERSONAL INFORMATION                │
 * │  Full name                          │
 * │  Bio                                │
 * ├─────────────────────────────────────┤
 * │ CONTACT INFORMATION                 │
 * │  Email (+ verify)                   │
 * │  Phone                              │
 * ├─────────────────────────────────────┤
 * │ PREFERENCES                         │
 * │  Username                           │
 * │  Language                           │
 * │  Location                           │
 * └─────────────────────────────────────┘
 */
export default function AccountDashboardScreen({ navigation }: Props) {
  const { t, language } = useTranslation();
  const toast = useToast();
  const { user } = useUser();

  const sections = useRef(
    Array.from({ length: 5 }, () => ({
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

  const animStyle = (i: number) => ({
    opacity: sections[i].opacity,
    transform: [{ translateY: sections[i].translateY }],
  });

  const langLabel = language === 'en' ? 'English' : language === 'ht' ? 'Kreyòl' : 'Français';
  const isVerified = user?.email_verified;
  const tierLabel =
    user?.seller_tier === 'business' ? t('productDetail.trustBusiness')
    : user?.seller_tier === 'verified' ? t('settings.verified')
    : user?.seller_tier === 'casual' ? t('sellerOnboarding.casualTitle')
    : null;
  const tierColor = user?.seller_tier ? TIER_COLORS[user.seller_tier] ?? COLORS.text2 : undefined;

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('account.title')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Profile Card ── */}
        <Animated.View style={animStyle(0)}>
          <ProfileCard user={user} onPress={() => navigation.navigate('EditProfile')} />
        </Animated.View>

        {/* ── Personal Information ── */}
        <Animated.View style={animStyle(1)}>
          <SettingsGroup
            header={t('account.personalInfo')}
            description={t('account.personalInfoDesc')}
          >
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => navigation.navigate('SettingsEdit', { field: 'name', title: t('field.name') })}
            >
              <View style={[styles.iconContainer, { backgroundColor: 'rgba(255, 77, 106, 0.15)' }]}>
                <MaterialCommunityIcons name="account-outline" size={20} color={ONBOARDING_COLORS.coral} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{t('account.fullName')}</Text>
                <Text style={styles.rowValue} numberOfLines={1}>{user?.full_name || t('common.notSet')}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={ONBOARDING_COLORS.faint} />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => navigation.navigate('SettingsEdit', { field: 'bio', title: t('field.bio') })}
            >
              <View style={[styles.iconContainer, { backgroundColor: 'rgba(139, 92, 246, 0.15)' }]}>
                <MaterialCommunityIcons name="text-box-outline" size={20} color={ONBOARDING_COLORS.purple} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{t('field.bio')}</Text>
                <Text style={styles.rowValue} numberOfLines={1}>
                  {user?.bio || t('account.bioPlaceholder')}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={ONBOARDING_COLORS.faint} />
            </TouchableOpacity>
          </SettingsGroup>
        </Animated.View>

        {/* ── Contact Information ── */}
        <Animated.View style={animStyle(2)}>
          <SettingsGroup
            header={t('account.contactInfo')}
            description={t('account.contactInfoDesc')}
          >
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => navigation.navigate('SettingsEdit', { field: 'email', title: t('settings.email') })}
            >
              <View style={[styles.iconContainer, { backgroundColor: 'rgba(0, 194, 255, 0.15)' }]}>
                <MaterialCommunityIcons name="email-outline" size={20} color={ONBOARDING_COLORS.blue} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{t('field.email')}</Text>
                <View style={styles.valueRow}>
                  <Text style={styles.rowValue} numberOfLines={1}>{user?.email || t('common.notSet')}</Text>
                  {isVerified && (
                    <MaterialCommunityIcons name="check-circle" size={14} color={ONBOARDING_COLORS.green} style={{ marginLeft: 4 }} />
                  )}
                </View>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={ONBOARDING_COLORS.faint} />
            </TouchableOpacity>

            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => navigation.navigate('SettingsEdit', { field: 'phone', title: t('field.phone') })}
            >
              <View style={[styles.iconContainer, { backgroundColor: 'rgba(0, 229, 160, 0.15)' }]}>
                <MaterialCommunityIcons name="phone-outline" size={20} color={ONBOARDING_COLORS.green} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{t('field.phone')}</Text>
                <View style={styles.valueRow}>
                  <Text style={styles.rowValue} numberOfLines={1}>
                    {user?.phone ? `+509 ${user.phone}` : t('account.addPhone')}
                  </Text>
                  {user?.phone && (
                    <View style={styles.phoneBadge}>
                      <Text style={styles.phoneBadgeText}>MonCash</Text>
                    </View>
                  )}
                </View>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={ONBOARDING_COLORS.faint} />
            </TouchableOpacity>
          </SettingsGroup>
        </Animated.View>

        {/* ── Preferences ── */}
        <Animated.View style={animStyle(3)}>
          <SettingsGroup
            header={t('account.preferencesHeader')}
            description={t('account.preferencesDesc')}
          >
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => navigation.navigate('UsernameSettings')}
            >
              <View style={[styles.iconContainer, { backgroundColor: 'rgba(255, 224, 102, 0.15)' }]}>
                <MaterialCommunityIcons name="at" size={20} color={ONBOARDING_COLORS.yellow} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{t('field.username')}</Text>
                <Text style={styles.rowValue}>{user?.username ? `@${user.username}` : t('common.notSet')}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={ONBOARDING_COLORS.faint} />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => navigation.navigate('LanguageSettings')}
            >
              <View style={[styles.iconContainer, { backgroundColor: 'rgba(139, 92, 246, 0.15)' }]}>
                <MaterialCommunityIcons name="translate" size={20} color={ONBOARDING_COLORS.purple} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{t('account.language')}</Text>
                <Text style={styles.rowValue}>{langLabel}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={ONBOARDING_COLORS.faint} />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => navigation.navigate('LocationSettings')}
            >
              <View style={[styles.iconContainer, { backgroundColor: 'rgba(0, 229, 160, 0.15)' }]}>
                <MaterialCommunityIcons name="map-marker-outline" size={20} color={ONBOARDING_COLORS.green} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{t('settings.location')}</Text>
                <Text style={styles.rowValue}>{user?.location_city || t('account.setLocation')}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={ONBOARDING_COLORS.faint} />
            </TouchableOpacity>
          </SettingsGroup>
        </Animated.View>

        {/* ── Bottom safe area ── */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: ONBOARDING_COLORS.bg0 },
  scroll: { paddingBottom: SPACING.page },

  // Rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    minHeight: 56,
    backgroundColor: 'rgba(255,255,255,0.015)',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: ONBOARDING_COLORS.border,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.medium, color: ONBOARDING_COLORS.text },
  rowValue: { fontSize: FONT_SIZES.sm, color: ONBOARDING_COLORS.sub, marginTop: 2 },
  valueRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  phoneBadge: {
    backgroundColor: 'rgba(0, 194, 255, 0.15)',
    borderRadius: RADIUS.xs,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 194, 255, 0.32)',
  },
  phoneBadgeText: { fontSize: FONT_SIZES.xs - 1, color: ONBOARDING_COLORS.blue, fontWeight: FONT_WEIGHTS.semibold },

  // Divider
  divider: {
    height: 1,
    backgroundColor: ONBOARDING_COLORS.border,
    marginLeft: SPACING.lg + 36 + SPACING.md,
  },

  bottomSpacer: { height: 60 },
});
