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
      toast.show({ kind: 'success', title: newVal ? 'Profile is now public' : 'Profile is now private' });
    } catch {
      setProfilePublic(!newVal);
      toast.show({ kind: 'error', title: 'Failed to update profile visibility' });
    }
    setLoading(false);
  };

  const handleToggleActivity = () => {
    setShowActivity(!showActivity);
    toast.show({ kind: 'success', title: showActivity ? 'Activity hidden' : 'Activity visible' });
  };

  const handleToggleLocation = () => {
    setLocationSharing(!locationSharing);
    toast.show({ kind: 'success', title: locationSharing ? 'Location sharing disabled' : 'Location sharing enabled' });
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Privacy" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Profile Visibility ── */}
        <Animated.View style={animStyle(0)}>
          <SettingsGroup
            header="Profile visibility"
            description="Control what others see on your profile"
          >
            <View style={styles.toggleRow}>
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="eye-outline" size={20} color={COLORS.white} />
              </View>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>Public profile</Text>
                <Text style={styles.toggleSubtitle}>
                  {profilePublic
                    ? 'Your name and profile are visible to everyone'
                    : 'Only your username is visible to others'}
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
            header="Discoverability"
            description="Control how others can find you"
          >
            <View style={styles.toggleRow}>
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="map-marker-radius-outline" size={20} color={COLORS.white} />
              </View>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>Location sharing</Text>
                <Text style={styles.toggleSubtitle}>
                  {locationSharing
                    ? 'Your location is visible on the map'
                    : 'Other users cannot see your location'}
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
                <Text style={styles.toggleLabel}>Delivery location</Text>
                <Text style={styles.toggleSubtitle}>{user?.location_city || 'Set your delivery area'}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text3} />
            </TouchableOpacity>
          </SettingsGroup>
        </Animated.View>

        {/* ── Data & Control ── */}
        <Animated.View style={animStyle(2)}>
          <SettingsGroup
            header="Data & control"
            description="Manage your data and interactions"
          >
            <View style={styles.toggleRow}>
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="clock-outline" size={20} color={COLORS.white} />
              </View>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>Show activity status</Text>
                <Text style={styles.toggleSubtitle}>
                  {showActivity
                    ? 'Others can see when you\'re online'
                    : 'Your online status is hidden'}
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
              onPress={() => toast.show({ kind: 'info', title: 'Blocked users list coming soon' })}
            >
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="account-cancel-outline" size={20} color={COLORS.white} />
              </View>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>Blocked users</Text>
                <Text style={styles.toggleSubtitle}>Manage users you've blocked</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text3} />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => toast.show({ kind: 'info', title: 'Data export coming soon' })}
            >
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="database-outline" size={20} color={COLORS.white} />
              </View>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>Your data</Text>
                <Text style={styles.toggleSubtitle}>Download or manage your account data</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text3} />
            </TouchableOpacity>
          </SettingsGroup>
        </Animated.View>

        {/* ── Privacy banner ── */}
        <Animated.View style={animStyle(3)}>
          <View style={styles.banner}>
            <MaterialCommunityIcons name="shield-lock" size={20} color="#8B5CF6" />
            <Text style={styles.bannerText}>We never sell your data to third parties</Text>
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
