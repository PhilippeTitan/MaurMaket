import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated, Switch,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../theme';
import { store } from '../store';
import { useUser } from '../hooks';
import ScreenHeader from '../components/ScreenHeader';
import SettingsGroup from '../components/SettingsGroup';
import { updateProfile } from '../api';
import { useTranslation } from '@/localization';
import { useToast } from '../components/Toast';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'PrivacySettings'>;

/**
 * Privacy Dashboard
 *
 * Architecture: PROFILE VISIBILITY → DISCOVERABILITY → DATA & CONTROL
 *
 * ┌─────────────────────────────────────┐
 * │ PROFILE VISIBILITY                  │
 * │  Public / Private profile           │
 * ├─────────────────────────────────────┤
 * │ DISCOVERABILITY                     │
 * │  Search visibility                  │
 * │  Location sharing                   │
 * ├─────────────────────────────────────┤
 * │ DATA & CONTROL                      │
 * │  Show activity status               │
 * │  Blocked users                      │
 * │  Account data                       │
 * └─────────────────────────────────────┘
 */
export default function PrivacySettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { user } = useUser();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [profilePublic, setProfilePublic] = useState(user?.show_real_name ?? true);
  const [showActivity, setShowActivity] = useState(true);
  const [locationSharing, setLocationSharing] = useState(Boolean(user?.location_lat));

  const sections = useRef(
    Array.from({ length: 4 }, () => ({
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

  const handleToggleProfile = async () => {
    const newVal = !profilePublic;
    setProfilePublic(newVal);
    setLoading(true);
    try {
      await updateProfile({ showRealName: String(newVal) });
      await store.setUser({ ...store.user!, show_real_name: newVal } as any, store.token!);
      toast.show({ kind: 'success', title: newVal ? t('privacy.profileNowPublic') : t('privacy.profileNowPrivate') });
    } catch {
      setProfilePublic(!newVal);
      toast.show({ kind: 'error', title: t('privacy.profileVisibilityFailed') });
    }
    setLoading(false);
  };

  const handleToggleActivity = () => {
    setShowActivity(!showActivity);
    toast.show({ kind: 'success', title: showActivity ? t('privacy.activityHidden') : t('privacy.activityVisible') });
  };

  const handleToggleLocation = () => {
    setLocationSharing(!locationSharing);
    toast.show({ kind: 'success', title: locationSharing ? t('privacy.locationDisabledToast') : t('privacy.locationEnabledToast') });
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('privacy.title')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Profile Visibility ── */}
        <Animated.View style={animStyle(0)}>
          <SettingsGroup
            header={t('settings.profileVisibility')}
            description={t('privacy.profileVisibilityDesc')}
          >
            <View style={styles.toggleRow}>
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="eye-outline" size={20} color={COLORS.white} />
              </View>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>{t('privacy.publicProfile')}</Text>
                <Text style={styles.toggleSubtitle}>
                  {profilePublic
                    ? t('privacy.publicProfileOn')
                    : t('privacy.publicProfileOff')}
                </Text>
              </View>
              <Switch
                value={profilePublic}
                onValueChange={handleToggleProfile}
                trackColor={{ false: COLORS.border, true: '#8B5CF640' }}
                thumbColor={profilePublic ? '#8B5CF6' : COLORS.text3}
                disabled={loading}
              />
            </View>
          </SettingsGroup>
        </Animated.View>

        {/* ── Discoverability ── */}
        <Animated.View style={animStyle(1)}>
          <SettingsGroup
            header={t('privacy.discoverability')}
            description={t('privacy.discoverabilityDesc')}
          >
            <View style={styles.toggleRow}>
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="map-marker-radius-outline" size={20} color={COLORS.white} />
              </View>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>{t('privacy.locationSharing')}</Text>
                <Text style={styles.toggleSubtitle}>
                  {locationSharing
                    ? t('privacy.locationSharingOn')
                    : t('privacy.locationSharingOff')}
                </Text>
              </View>
              <Switch
                value={locationSharing}
                onValueChange={handleToggleLocation}
                trackColor={{ false: COLORS.border, true: COLORS.blue + '40' }}
                thumbColor={locationSharing ? COLORS.blue : COLORS.text3}
              />
            </View>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => navigation.navigate('LocationSettings')}
            >
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="map-marker-outline" size={20} color={COLORS.white} />
              </View>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>{t('settings.deliveryLocation')}</Text>
                <Text style={styles.toggleSubtitle}>{user?.location_city || t('account.setLocation')}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text3} />
            </TouchableOpacity>
          </SettingsGroup>
        </Animated.View>

        {/* ── Data & Control ── */}
        <Animated.View style={animStyle(2)}>
          <SettingsGroup
            header={t('privacy.dataControl')}
            description={t('privacy.dataControlDesc')}
          >
            <View style={styles.toggleRow}>
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="clock-outline" size={20} color={COLORS.white} />
              </View>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>{t('privacy.showActivity')}</Text>
                <Text style={styles.toggleSubtitle}>
                  {showActivity
                    ? t('privacy.showActivityOn')
                    : t('privacy.showActivityOff')}
                </Text>
              </View>
              <Switch
                value={showActivity}
                onValueChange={handleToggleActivity}
                trackColor={{ false: COLORS.border, true: COLORS.yellow + '40' }}
                thumbColor={showActivity ? COLORS.yellow : COLORS.text3}
              />
            </View>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => toast.show({ kind: 'info', title: t('privacy.blockedUsersSoon') })}
            >
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="account-cancel-outline" size={20} color={COLORS.white} />
              </View>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>{t('privacy.blockedUsers')}</Text>
                <Text style={styles.toggleSubtitle}>{t('privacy.blockedUsersDesc')}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text3} />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => toast.show({ kind: 'info', title: t('privacy.dataExportSoon') })}
            >
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="database-outline" size={20} color={COLORS.white} />
              </View>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>{t('privacy.yourData')}</Text>
                <Text style={styles.toggleSubtitle}>{t('privacy.yourDataDesc')}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text3} />
            </TouchableOpacity>
          </SettingsGroup>
        </Animated.View>

        {/* ── Privacy banner ── */}
        <Animated.View style={animStyle(3)}>
          <View style={styles.banner}>
            <MaterialCommunityIcons name="shield-lock" size={20} color="#8B5CF6" />
            <Text style={styles.bannerText}>{t('privacy.noSellingBanner')}</Text>
          </View>
        </Animated.View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

/* ── Styles ──────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingBottom: SPACING.page },

  // Toggle rows (used in groups)
  toggleRow: {
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
  toggleText: { flex: 1 },
  toggleLabel: { fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.medium, color: COLORS.text },
  toggleSubtitle: { fontSize: FONT_SIZES.sm, color: COLORS.text2, marginTop: 2 },

  // Plain row for navigation items
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    minHeight: 56,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: SPACING.lg + 36 + SPACING.md,
  },

  // Trust banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
    padding: SPACING.lg,
    backgroundColor: '#8B5CF610',
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: '#8B5CF620',
  },
  bannerText: { flex: 1, fontSize: FONT_SIZES.sm, color: COLORS.text2, lineHeight: 18 },

  bottomSpacer: { height: 60 },
});
