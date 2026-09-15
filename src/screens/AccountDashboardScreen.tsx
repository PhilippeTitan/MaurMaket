import React, { useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated, Image, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS, TIER_COLORS } from '../theme';
import { store } from '../store';
import { useUser } from '../hooks';
import ScreenHeader from '../components/ScreenHeader';
import SettingsGroup from '../components/SettingsGroup';
import ProfileCard from '../components/ProfileCard';
import { resendVerificationEmail } from '../api';
import { useTranslation } from '../i18n';
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
    user?.seller_tier === 'business' ? 'Business'
    : user?.seller_tier === 'verified' ? 'Verified'
    : user?.seller_tier === 'casual' ? 'Casual'
    : null;
  const tierColor = user?.seller_tier ? TIER_COLORS[user.seller_tier] ?? COLORS.text2 : undefined;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Account" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Profile Card ── */}
        <Animated.View style={animStyle(0)}>
          <ProfileCard user={user} onPress={() => navigation.navigate('EditProfile')} />
        </Animated.View>

        {/* ── Personal Information ── */}
        <Animated.View style={animStyle(1)}>
          <SettingsGroup
            header="Personal information"
            description="Your basic profile details"
          >
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => navigation.navigate('SettingsEdit', { field: 'name', title: 'Name' })}
            >
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="account-outline" size={20} color={COLORS.white} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>Full name</Text>
                <Text style={styles.rowValue} numberOfLines={1}>{user?.full_name || 'Not set'}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text3} />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => navigation.navigate('SettingsEdit', { field: 'bio', title: 'Bio' })}
            >
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="text-box-outline" size={20} color={COLORS.white} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>Bio</Text>
                <Text style={styles.rowValue} numberOfLines={1}>
                  {user?.bio || 'Tell people about yourself'}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text3} />
            </TouchableOpacity>
          </SettingsGroup>
        </Animated.View>

        {/* ── Contact Information ── */}
        <Animated.View style={animStyle(2)}>
          <SettingsGroup
            header="Contact information"
            description="How people can reach you"
          >
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => navigation.navigate('SettingsEdit', { field: 'email', title: t('settings.email') })}
            >
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="email-outline" size={20} color={COLORS.white} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>Email</Text>
                <View style={styles.valueRow}>
                  <Text style={styles.rowValue} numberOfLines={1}>{user?.email || 'Not set'}</Text>
                  {isVerified && (
                    <MaterialCommunityIcons name="check-circle" size={14} color={COLORS.green} style={{ marginLeft: 4 }} />
                  )}
                </View>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text3} />
            </TouchableOpacity>

            {user?.email && !isVerified && (
              <>
                <View style={styles.divider} />
                <TouchableOpacity
                  style={styles.row}
                  activeOpacity={0.6}
                  onPress={async () => {
                    try {
                      await resendVerificationEmail(user.email);
                      toast.show({ kind: 'success', title: 'Verification email sent!' });
                    } catch (e: any) {
                      toast.show({ kind: 'error', title: e?.message || 'Failed to resend' });
                    }
                  }}
                >
                  <View style={styles.iconContainer}>
                    <MaterialCommunityIcons name="email-fast-outline" size={20} color={COLORS.white} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowLabel}>Verify your email</Text>
                    <Text style={styles.rowValue}>Resend verification link</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text3} />
                </TouchableOpacity>
              </>
            )}

            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => navigation.navigate('SettingsEdit', { field: 'phone', title: t('settings.phone') || 'Phone' })}
            >
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="phone-outline" size={20} color={COLORS.white} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>Phone</Text>
                <View style={styles.valueRow}>
                  <Text style={styles.rowValue} numberOfLines={1}>
                    {user?.phone ? `+509 ${user.phone}` : 'Add your phone number'}
                  </Text>
                  {user?.phone && (
                    <View style={styles.phoneBadge}>
                      <Text style={styles.phoneBadgeText}>MonCash</Text>
                    </View>
                  )}
                </View>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text3} />
            </TouchableOpacity>
          </SettingsGroup>
        </Animated.View>

        {/* ── Preferences ── */}
        <Animated.View style={animStyle(3)}>
          <SettingsGroup
            header="Preferences"
            description="Customize your experience"
          >
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => navigation.navigate('UsernameSettings')}
            >
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="at" size={20} color={COLORS.white} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>Username</Text>
                <Text style={styles.rowValue}>{user?.username ? `@${user.username}` : 'Not set'}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text3} />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => navigation.navigate('LanguageSettings')}
            >
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="translate" size={20} color={COLORS.white} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>Language</Text>
                <Text style={styles.rowValue}>{langLabel}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text3} />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => navigation.navigate('LocationSettings')}
            >
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="map-marker-outline" size={20} color={COLORS.white} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>Location</Text>
                <Text style={styles.rowValue}>{user?.location_city || 'Set your delivery area'}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text3} />
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
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingBottom: SPACING.page },

  // Rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    minHeight: 56,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.medium, color: COLORS.text },
  rowValue: { fontSize: FONT_SIZES.sm, color: COLORS.text2, marginTop: 2 },
  valueRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  phoneBadge: {
    backgroundColor: COLORS.blueMuted,
    borderRadius: RADIUS.xs,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: 6,
  },
  phoneBadgeText: { fontSize: FONT_SIZES.xs - 1, color: COLORS.blue, fontWeight: FONT_WEIGHTS.semibold },

  // Divider
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: SPACING.lg + 36 + SPACING.md,
  },

  bottomSpacer: { height: 60 },
});
