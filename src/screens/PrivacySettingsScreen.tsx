import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS, TOUCH } from '../theme';
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

export default function PrivacySettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { user } = useUser();
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [showRealName, setShowRealName] = useState(user?.show_real_name ?? false);
  const [showPublicCity, setShowPublicCity] = useState(user?.show_public_city ?? false);
  const [hideFollowerLists, setHideFollowerLists] = useState(user?.hide_follower_lists ?? false);
  const [hideFollowerCounts, setHideFollowerCounts] = useState(user?.hide_follower_counts ?? false);

  const [presenceVisibility, setPresenceVisibilityState] = useState<'everyone' | 'chatted_with' | 'nobody'>('chatted_with');
  const [presenceSaving, setPresenceSaving] = useState(false);

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

  const handleToggleRealName = async () => {
    const next = !showRealName;
    setShowRealName(next);
    try {
      await updateProfile({ showRealName: next });
      await store.setUser({ ...store.user!, show_real_name: next } as any, store.token!);
      toast.success(
        next ? 'Real Name Visible' : 'Display Name Only',
        next ? 'Your real name is now visible on public profile and reviews.' : 'Your legal identity is private. Chosen username is displayed.'
      );
    } catch {
      setShowRealName(!next);
      toast.error('Update Failed', 'Could not update name visibility. Rolled back.');
    }
  };

  const handleTogglePublicCity = async () => {
    const next = !showPublicCity;
    setShowPublicCity(next);
    try {
      await updateProfile({ showPublicCity: next });
      await store.setUser({ ...store.user!, show_public_city: next } as any, store.token!);
      toast.success(
        next ? 'City Visible' : 'City Hidden',
        next ? 'Broad city is now visible on your public profile.' : 'City hidden from public profile.'
      );
    } catch {
      setShowPublicCity(!next);
      toast.error('Update Failed', 'Could not update city visibility. Rolled back.');
    }
  };

  const handleToggleFollowerLists = async () => {
    const next = !hideFollowerLists;
    setHideFollowerLists(next);
    try {
      await updateProfile({ hideFollowerLists: next });
      await store.setUser({ ...store.user!, hide_follower_lists: next } as any, store.token!);
      toast.success(
        next ? 'Follower Lists Hidden' : 'Follower Lists Public',
        next ? 'Visitors cannot browse your follower or following lists.' : 'Visitors can view your follower lists.'
      );
    } catch {
      setHideFollowerLists(!next);
      toast.error('Update Failed', 'Could not update follower list privacy. Rolled back.');
    }
  };

  const handleToggleFollowerCounts = async () => {
    const next = !hideFollowerCounts;
    setHideFollowerCounts(next);
    try {
      await updateProfile({ hideFollowerCounts: next });
      await store.setUser({ ...store.user!, hide_follower_counts: next } as any, store.token!);
      toast.success(
        next ? 'Counts Hidden' : 'Counts Visible',
        next ? 'Follower counts are hidden on your public profile.' : 'Follower counts are visible.'
      );
    } catch {
      setHideFollowerCounts(!next);
      toast.error('Update Failed', 'Could not update follower count privacy. Rolled back.');
    }
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
      toast.error('Update Failed', t('privacy.presenceUpdateFailed'));
    } finally { setPresenceSaving(false); }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('privacy.title')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Public Identity & Privacy ── */}
        <Animated.View style={animStyle(0)}>
          <SettingsGroup
            header="Identity & Profile Visibility"
            description="Manage how your identity is presented across profiles, listings, reviews, and messaging. Legal KYC documents remain completely private."
          >
            <View style={styles.toggleRow}>
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="account-badge-outline" size={20} color={COLORS.text2} />
              </View>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>Show Real Name</Text>
                <Text style={styles.rowValue}>
                  {showRealName ? 'Displaying legal name publicly' : 'Chosen username displayed (KYC private)'}
                </Text>
              </View>
              <SettingsToggle
                value={showRealName}
                onValueChange={handleToggleRealName}
                accent={COLORS.coral}
                accessibilityLabel="Show Real Name"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.toggleRow}>
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="city-variant-outline" size={20} color={COLORS.text2} />
              </View>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>Public City</Text>
                <Text style={styles.rowValue}>
                  {showPublicCity ? (user?.location_city || 'City visible on profile') : 'Hidden (exact address is never displayed)'}
                </Text>
              </View>
              <SettingsToggle
                value={showPublicCity}
                onValueChange={handleTogglePublicCity}
                accent={COLORS.blue}
                accessibilityLabel="Public City"
              />
            </View>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => {
                if (user?.id) {
                  navigation.navigate('Storefront', { sellerId: user.id });
                }
              }}
            >
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="eye-outline" size={20} color={COLORS.text2} />
              </View>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>View Profile as Visitor</Text>
                <Text style={styles.rowValue}>Preview your profile with active privacy settings</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text3} />
            </TouchableOpacity>
          </SettingsGroup>
        </Animated.View>

        {/* ── Social Privacy ── */}
        <Animated.View style={animStyle(1)}>
          <SettingsGroup
            header="Followers & Activity"
            description="Control who can see your network and followers."
          >
            <View style={styles.toggleRow}>
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="account-group-outline" size={20} color={COLORS.text2} />
              </View>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>Hide Follower Lists</Text>
                <Text style={styles.rowValue}>
                  {hideFollowerLists ? 'Lists are private to you' : 'Visitors can view who you follow'}
                </Text>
              </View>
              <SettingsToggle
                value={hideFollowerLists}
                onValueChange={handleToggleFollowerLists}
                accent={COLORS.coral}
                accessibilityLabel="Hide Follower Lists"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.toggleRow}>
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="counter" size={20} color={COLORS.text2} />
              </View>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>Hide Follower Counts</Text>
                <Text style={styles.rowValue}>
                  {hideFollowerCounts ? 'Counts hidden on profile' : 'Counts visible'}
                </Text>
              </View>
              <SettingsToggle
                value={hideFollowerCounts}
                onValueChange={handleToggleFollowerCounts}
                accent={COLORS.coral}
                accessibilityLabel="Hide Follower Counts"
              />
            </View>
          </SettingsGroup>
        </Animated.View>

        {/* ── Online Status & Safety ── */}
        <Animated.View style={animStyle(2)}>
          <SettingsGroup
            header="Presence & Safety"
            description="Manage your online activity status and blocked accounts."
          >
            <View style={styles.presenceRow}>
              <View style={styles.presenceTitleRow}>
                <View style={styles.iconContainer}>
                  <MaterialCommunityIcons name="clock-outline" size={20} color={COLORS.text2} />
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
              onPress={() => (navigation as any).navigate('BlockedUsers')}
            >
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="account-cancel-outline" size={20} color={COLORS.text2} />
              </View>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>{t('privacy.blockedUsers')}</Text>
                <Text style={styles.rowValue}>Manage accounts blocked from contacting or following you</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingBottom: SPACING.page },

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

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    minHeight: 54,
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: SPACING.sm + 28 + SPACING.md,
  },

  bottomSpacer: { height: 60 },
});
