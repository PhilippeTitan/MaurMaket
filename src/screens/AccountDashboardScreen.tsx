import React, { useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated, Image, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../theme';
import { ONBOARDING_COLORS } from './onboarding/theme';
import { store } from '../store';
import { useUser } from '../hooks';
import ScreenHeader from '../components/ScreenHeader';
import SettingsGroup from '../components/SettingsGroup';
import { useTranslation } from '@/localization';
import { useToast } from '../components/Toast';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'AccountDashboard'>;

/**
 * Account Dashboard
 *
 * Architecture: PERSONAL INFO → CONTACT INFO → PREFERENCES
 *
 * ┌─────────────────────────────────────┐
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
    Array.from({ length: 3 }, () => ({
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

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('account.title')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* The identity card lives on Settings and the Me tab now — this page is
            the account fields themselves (Philippe, 2026-10-08). */}

        {/* ── Personal Information ── */}
        <Animated.View style={animStyle(0)}>
          <SettingsGroup
            header={t('account.personalInfo')}
            description={t('account.personalInfoDesc')}
          >
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => navigation.navigate('SettingsEdit', { field: 'name', title: t('field.name') })}
            >
              {/* Row icons use the app's neutral list-icon colour, the same one
                  SettingsRow paints in its minimal appearance. */}
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="account-outline" size={20} color={COLORS.text2} />
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
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="text-box-outline" size={20} color={COLORS.text2} />
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
        <Animated.View style={animStyle(1)}>
          <SettingsGroup
            header={t('account.contactInfo')}
            description={t('account.contactInfoDesc')}
          >
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => navigation.navigate('SettingsEdit', { field: 'email', title: t('settings.email') })}
            >
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="email-outline" size={20} color={COLORS.text2} />
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
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="phone-outline" size={20} color={COLORS.text2} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{t('field.phone')}</Text>
                {/* A contact/delivery number — the "MonCash" badge was removed
                    (Session 422/423): MonCash payments never use a stored
                    number, so the badge promised a purpose the app lacks. */}
                <Text style={styles.rowValue} numberOfLines={1}>
                  {user?.phone ? `+509 ${user.phone}` : t('account.addPhone')}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={ONBOARDING_COLORS.faint} />
            </TouchableOpacity>
          </SettingsGroup>
        </Animated.View>

        {/* ── Preferences ── */}
        <Animated.View style={animStyle(2)}>
          <SettingsGroup
            header={t('account.preferencesHeader')}
            description={t('account.preferencesDesc')}
          >
            {/* @username edits in exactly one place — the identity row on Edit
                Profile (Philippe, 2026-10-08). It is not a preference. */}
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => navigation.navigate('LanguageSettings')}
            >
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="translate" size={20} color={COLORS.text2} />
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
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="map-marker-outline" size={20} color={COLORS.text2} />
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
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    minHeight: 54,
    backgroundColor: 'transparent',
  },
  iconContainer: {
    width: 28,
    height: 32,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.medium, color: ONBOARDING_COLORS.text },
  rowValue: { fontSize: FONT_SIZES.sm, color: ONBOARDING_COLORS.sub, marginTop: 2 },
  valueRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },

  // Divider
  divider: {
    height: 1,
    backgroundColor: ONBOARDING_COLORS.border,
    marginLeft: SPACING.sm + 28 + SPACING.md,
  },

  bottomSpacer: { height: 60 },
});
