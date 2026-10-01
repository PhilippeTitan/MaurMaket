import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../theme';
import { ONBOARDING_COLORS } from './onboarding/theme';
import { store } from '../store';
import { useUser } from '../hooks';
import ScreenHeader from '../components/ScreenHeader';
import SettingsGroup from '../components/SettingsGroup';
import SettingsToggle from '../components/SettingsToggle';
import { updateProfile, getPresenceVisibility, setPresenceVisibility } from '../api';
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
  const [presenceVisibility, setPresenceVisibilityState] = useState<'everyone' | 'chatted_with' | 'nobody'>('chatted_with');
  const [presenceSaving, setPresenceSaving] = useState(false);
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

  useEffect(() => {
    getPresenceVisibility().then(result => setPresenceVisibilityState(result.visibility)).catch(() => {});
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

  const handlePresenceVisibility = async (next: 'everyone' | 'chatted_with' | 'nobody') => {
    if (presenceSaving || next === presenceVisibility) return;
    const previous = presenceVisibility;
    setPresenceVisibilityState(next);
    setPresenceSaving(true);
    try {
      await setPresenceVisibility(next);
      if (store.user) await store.setUser({ ...store.user, presence_visibility: next } as any, store.token!);
    } catch {
      setPresenceVisibilityState(previous);
      toast.show({ kind: 'error', title: t('privacy.presenceUpdateFailed') });
    } finally { setPresenceSaving(false); }
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
              </View>
              <SettingsToggle
                value={profilePublic}
                onValueChange={handleToggleProfile}
                disabled={loading}
                accent={ONBOARDING_COLORS.violet}
                accessibilityLabel={t('privacy.publicProfile')}
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
              </View>
              <SettingsToggle
                value={locationSharing}
                onValueChange={handleToggleLocation}
                accent={COLORS.blue}
                accessibilityLabel={t('privacy.locationSharing')}
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
                <Text style={styles.rowValue}>{user?.location_city || t('account.setLocation')}</Text>
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
            <View style={styles.presenceRow}>
              <View style={styles.presenceTitleRow}>
                <View style={styles.iconContainer}>
                  <MaterialCommunityIcons name="clock-outline" size={20} color={COLORS.white} />
                </View>
                <View style={styles.toggleText}>
                  <Text style={styles.toggleLabel}>{t('privacy.presenceVisibility')}</Text>
                  <Text style={styles.rowValue}>{t('privacy.presenceReciprocal')}</Text>
                </View>
              </View>
              <View style={styles.presenceChoices}>
                {(['everyone', 'chatted_with', 'nobody'] as const).map(option => (
                  <TouchableOpacity
                    key={option}
                    style={[styles.presenceChoice, presenceVisibility === option && styles.presenceChoiceSelected]}
                    onPress={() => handlePresenceVisibility(option)}
                    disabled={presenceSaving}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: presenceVisibility === option, disabled: presenceSaving }}
                  >
                    <Text style={[styles.presenceChoiceText, presenceVisibility === option && styles.presenceChoiceTextSelected]}>{t(`privacy.presence.${option}`)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
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
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text3} />
            </TouchableOpacity>
          </SettingsGroup>
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
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    minHeight: 54,
  },
  iconContainer: {
    width: 28,
    height: 32,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: { flex: 1 },
  presenceRow: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm },
  presenceTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, minHeight: 44 },
  presenceChoices: { flexDirection: 'row', gap: 6, marginTop: SPACING.xs },
  presenceChoice: { flex: 1, minHeight: 40, paddingHorizontal: 4, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border },
  presenceChoiceSelected: { backgroundColor: COLORS.coral + '20', borderColor: COLORS.coral },
  presenceChoiceText: { color: COLORS.text2, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  presenceChoiceTextSelected: { color: COLORS.coral },
  toggleLabel: { fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.medium, color: COLORS.text },
  rowValue: { fontSize: FONT_SIZES.sm, color: COLORS.text2, marginTop: 2 },

  // Plain row for navigation items
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    minHeight: 54,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: SPACING.sm + 28 + SPACING.md,
  },

  bottomSpacer: { height: 60 },
});
