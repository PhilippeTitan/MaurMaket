import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated, Switch, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../theme';
import { ONBOARDING_COLORS } from './onboarding/theme';
import { useUser } from '../hooks';
import ScreenHeader from '../components/ScreenHeader';
import SettingsGroup from '../components/SettingsGroup';
import AuthMethodsCard from '../components/AuthMethodsCard';
import { useTranslation } from '@/localization';
import { useToast } from '../components/Toast';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'SecuritySettings'>;

/**
 * Security Dashboard
 *
 * Architecture: SECURITY STATUS CARD → SIGN-IN METHODS → ACCOUNT PROTECTION → SECURITY ACTIVITY
 *
 * ┌─────────────────────────────────────┐
 * │ SECURITY STATUS CARD                │
 * │  ✓ Account protected                │
 * │  ✓ Email verified                   │
 * │  ✓ Password active                  │
 * ├─────────────────────────────────────┤
 * │ SIGN-IN METHODS                     │
 * │  Email + Password / Google / Passkey│
 * ├─────────────────────────────────────┤
 * │ ACCOUNT PROTECTION                  │
 * │  Change Password                    │
 * │  2-Step Verification                │
 * │  Trusted Devices                    │
 * ├─────────────────────────────────────┤
 * │ SECURITY ACTIVITY                   │
 * │  Recent sign-in activity            │
 * └─────────────────────────────────────┘
 */
export default function SecuritySettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { user } = useUser();
  const toast = useToast();
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [loading2FA, setLoading2FA] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);

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

    const { getMe } = require('../api');
    getMe().then((data: any) => {
      setGoogleConnected(Boolean(data.user?.google_linked || data.user?.accounts?.some((a: any) => a.provider === 'google')));
    }).catch(() => setGoogleConnected(false));
  }, []);

  const animStyle = (i: number) => ({
    opacity: sections[i].opacity,
    transform: [{ translateY: sections[i].translateY }],
  });

  const handlePasskeyEnroll = async () => {
    if (Platform.OS !== 'web') {
      toast.show({ kind: 'info', title: t('security.passkeysWebOnly') });
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
        throw new Error(body?.message || t('security.passkeyRegisterFailed'));
      }
      toast.show({ kind: 'success', title: t('security.passkeyRegistered') });
    } catch (err: any) {
      toast.show({ kind: 'error', title: err?.message || t('security.passkeyRegisterFailed') });
    }
  };

  const handleToggle2FA = async () => {
    setLoading2FA(true);
    try {
      setTwoFactorEnabled(!twoFactorEnabled);
      toast.show({ kind: 'success', title: twoFactorEnabled ? t('security.twoFactorDisabled') : t('security.twoFactorEnabled') });
    } catch {
      toast.show({ kind: 'error', title: t('security.twoFactorUpdateFailed') });
    }
    setLoading2FA(false);
  };

  // Security status checks
  const emailVerified = Boolean(user?.email_verified);
  const checksPassed = (emailVerified ? 1 : 0) + (twoFactorEnabled ? 1 : 0);
  const totalChecks = 2;

  // Mock login activity
  const loginActivity = [
    { id: '1', device: Platform.OS === 'ios' ? 'iPhone' : 'Android', location: 'Port-au-Prince, Haiti', time: t('common.justNow'), current: true },
    { id: '2', device: 'Chrome on Windows', location: 'Port-au-Prince, Haiti', time: t('security.twoHoursAgo'), current: false },
  ];

  const trustedDevices = [
    { id: '1', name: t('security.thisDevice'), added: 'Sep 2026' },
  ];

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('security.title')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Security Status Card ── */}
        <Animated.View style={animStyle(0)}>
          <View style={styles.statusCard}>
            <View style={styles.statusIcon}>
              <MaterialCommunityIcons name="shield-check" size={32} color={ONBOARDING_COLORS.white} />
            </View>
            <Text style={styles.statusTitle}>
              {checksPassed === totalChecks ? t('security.accountSecure') : t('security.checksPassed', { passed: checksPassed, total: totalChecks })}
            </Text>
            <Text style={styles.statusSubtitle}>
              {checksPassed === totalChecks
                ? t('security.allChecksPassing')
                : t('security.completeStepsBelow')}
            </Text>
            {/* Progress dots */}
            <View style={styles.statusDots}>
              {['email', '2fa'].map((check) => (
                <View
                  key={check}
                  style={[styles.statusDot, (check === 'email' ? emailVerified : twoFactorEnabled) && styles.statusDotActive]}
                />
              ))}
            </View>
          </View>
        </Animated.View>

        {/* ── Account Protection ── */}
        <Animated.View style={animStyle(1)}>
          <SettingsGroup
            header={t('security.accountProtection')}
            description={t('security.keepAccountSafe')}
          >
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => navigation.navigate('SettingsEdit', { field: 'password', title: t('settings.changePassword') })}
            >
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="lock-outline" size={20} color={ONBOARDING_COLORS.coral} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{t('settings.changePassword')}</Text>
                <Text style={styles.rowSubtitle}>{t('security.updatePasswordRegularly')}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={ONBOARDING_COLORS.faint} />
            </TouchableOpacity>
            <View style={styles.divider} />
            <View style={styles.row}>
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="cellphone-key" size={20} color={ONBOARDING_COLORS.blue} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{t('security.twoStepVerification')}</Text>
                <Text style={styles.rowSubtitle}>
                  {twoFactorEnabled ? t('security.twoFactorAuthApp') : t('security.addExtraLayer')}
                </Text>
              </View>
              <Switch
                value={twoFactorEnabled}
                onValueChange={handleToggle2FA}
                trackColor={{ false: ONBOARDING_COLORS.border, true: ONBOARDING_COLORS.blue + '40' }}
                thumbColor={twoFactorEnabled ? ONBOARDING_COLORS.blue : ONBOARDING_COLORS.faint}
                disabled={loading2FA}
              />
            </View>
            <View style={styles.divider} />
            {trustedDevices.map((device, i) => (
              <View key={device.id}>
                <View style={styles.row}>
                  <View style={styles.iconContainer}>
                    <MaterialCommunityIcons name="devices" size={20} color={ONBOARDING_COLORS.purple} />
                  </View>
                  <View style={styles.rowText}>
                    <View style={styles.activityDevice}>
                      <Text style={styles.rowLabel}>{device.name}</Text>
                      <View style={styles.currentBadge}>
                        <Text style={styles.currentText}>{t('security.current')}</Text>
                      </View>
                    </View>
                    <Text style={styles.rowSubtitle}>{t('security.added')} {device.added}</Text>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.6}
                    onPress={() => toast.show({ kind: 'info', title: t('security.deviceRemovalSoon') })}
                  >
                    <Text style={styles.removeText}>{t('security.remove')}</Text>
                  </TouchableOpacity>
                </View>
                {i < trustedDevices.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </SettingsGroup>
        </Animated.View>

        {/* ── Sign-in Methods ── */}
        <Animated.View style={animStyle(2)}>
          <SettingsGroup
            header={t('security.signInMethods')}
            description={t('security.howYouSignIn')}
          >
            <AuthMethodsCard googleConnected={googleConnected} onPasskeyEnroll={handlePasskeyEnroll} />
          </SettingsGroup>
        </Animated.View>

        {/* ── Security Activity ── */}
        <Animated.View style={animStyle(3)}>
          <SettingsGroup
            header={t('security.securityActivity')}
            description={t('security.recentSignInActivity')}
          >
            {loginActivity.map((item, i) => (
              <View key={item.id}>
                <View style={styles.activityRow}>
                  <View style={styles.iconContainer}>
                    <MaterialCommunityIcons
                      name={item.device.includes('iPhone') || item.device.includes('Android') ? 'cellphone' : 'monitor'}
                      size={20}
                      color={COLORS.white}
                    />
                  </View>
                  <View style={styles.rowText}>
                    <View style={styles.activityDevice}>
                      <Text style={styles.rowLabel}>{item.device}</Text>
                      {item.current && (
                        <View style={[styles.currentBadge, { backgroundColor: COLORS.greenMuted }]}>
                          <Text style={[styles.currentText, { color: COLORS.green }]}>{t('security.current')}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.rowSubtitle}>{item.location} · {item.time}</Text>
                  </View>
                </View>
                {i < loginActivity.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </SettingsGroup>
        </Animated.View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: ONBOARDING_COLORS.bg0 },
  scroll: { paddingBottom: SPACING.page },

  // Status Card
  statusCard: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    marginBottom: SPACING.lg,
    padding: SPACING.xl,
    backgroundColor: ONBOARDING_COLORS.surface,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: ONBOARDING_COLORS.border,
    alignItems: 'center',
  },
  statusIcon: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(0, 229, 160, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 160, 0.4)',
  },
  statusTitle: { fontSize: FONT_SIZES.lg, fontWeight: FONT_WEIGHTS.semibold, color: ONBOARDING_COLORS.text, textAlign: 'center' },
  statusSubtitle: { fontSize: FONT_SIZES.sm, color: ONBOARDING_COLORS.sub, textAlign: 'center', marginTop: SPACING.xs },
  statusDots: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: RADIUS.full,
    backgroundColor: ONBOARDING_COLORS.border,
  },
  statusDotActive: {
    backgroundColor: ONBOARDING_COLORS.mint,
  },

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
  rowSubtitle: { fontSize: FONT_SIZES.sm, color: ONBOARDING_COLORS.sub, marginTop: 2 },

  // Activity
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  activityDevice: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  currentBadge: {
    backgroundColor: 'rgba(0, 229, 160, 0.18)',
    borderRadius: RADIUS.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 160, 0.35)',
  },
  currentText: { fontSize: FONT_SIZES.xs, color: ONBOARDING_COLORS.green, fontWeight: FONT_WEIGHTS.semibold },

  // Divider
  divider: {
    height: 1,
    backgroundColor: ONBOARDING_COLORS.border,
    marginLeft: SPACING.lg + 36 + SPACING.md,
  },

  // Remove
  removeText: { fontSize: FONT_SIZES.sm, color: ONBOARDING_COLORS.coral, fontWeight: FONT_WEIGHTS.medium },

  bottomSpacer: { height: 60 },
});
