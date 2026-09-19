import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Animated, Switch,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import SettingsGroup from '../components/SettingsGroup';
import { useTranslation } from '@/localization';
import { useToast } from '../components/Toast';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'NotificationsSettings'>;

interface NotifToggle {
  key: string;
  icon: string;
  iconColor: string;
  iconBg: string;
  labelKey: string;
  subtitleKey: string;
  defaultValue: boolean;
}

// Toggle names shown in toasts, per data key
const TOGGLE_NAMES: Record<string, string> = {
  order_updates: 'notifSettings.orderUpdates',
  messages: 'notifSettings.messages',
  offers: 'notifSettings.offers',
  product_activity: 'notifSettings.productActivity',
  system: 'notifSettings.systemUpdates',
};

const NOTIF_TOGGLES: NotifToggle[] = [
  {
    key: 'order_updates',
    icon: 'package-variant',
    iconColor: COLORS.white,
    iconBg: 'transparent',
    labelKey: 'notifSettings.orderUpdates',
    subtitleKey: 'notifSettings.orderUpdatesDesc',
    defaultValue: true,
  },
  {
    key: 'messages',
    icon: 'message-text-outline',
    iconColor: COLORS.white,
    iconBg: 'transparent',
    labelKey: 'notifSettings.messages',
    subtitleKey: 'notifSettings.messagesDesc',
    defaultValue: true,
  },
  {
    key: 'offers',
    icon: 'tag-outline',
    iconColor: COLORS.white,
    iconBg: 'transparent',
    labelKey: 'notifSettings.offers',
    subtitleKey: 'notifSettings.offersDesc',
    defaultValue: true,
  },
  {
    key: 'product_activity',
    icon: 'heart-outline',
    iconColor: COLORS.white,
    iconBg: 'transparent',
    labelKey: 'notifSettings.productActivity',
    subtitleKey: 'notifSettings.productActivityDesc',
    defaultValue: true,
  },
  {
    key: 'system',
    icon: 'cog-outline',
    iconColor: COLORS.white,
    iconBg: 'transparent',
    labelKey: 'notifSettings.systemUpdates',
    subtitleKey: 'notifSettings.systemUpdatesDesc',
    defaultValue: false,
  },
];

export default function NotificationsSettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [toggles, setToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(NOTIF_TOGGLES.map(n => [n.key, n.defaultValue]))
  );
  const [saving, setSaving] = useState<string | null>(null);

  // Staggered entrance
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

  const handleToggle = async (key: string) => {
    const newVal = !toggles[key];
    setToggles(prev => ({ ...prev, [key]: newVal }));
    setSaving(key);

    // TODO: Persist to server (user notification_preferences JSONB column)
    setTimeout(() => {
      setSaving(null);
      const nameKey = TOGGLE_NAMES[key];
      const name = nameKey ? t(nameKey) : key;
      toast.show({ kind: 'success', title: t(newVal ? 'notifSettings.enabledToast' : 'notifSettings.disabledToast', { name }) });
    }, 300);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('settings.notifications')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Banner */}
        <Animated.View style={animStyle(0)}>
          <View style={styles.banner}>
            <View style={styles.bannerIcon}>
              <MaterialCommunityIcons name="bell-ring" size={28} color={COLORS.coral} />
            </View>
            <View style={styles.bannerText}>
              <Text style={styles.bannerTitle}>{t('notifSettings.stayInLoop')}</Text>
              <Text style={styles.bannerSubtitle}>{t('notifSettings.stayInLoopDesc')}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Notification Toggles */}
        <Animated.View style={animStyle(1)}>
          <SettingsGroup header={t('settings.notificationPrefs')}>
            {NOTIF_TOGGLES.map((notif, i) => (
              <View key={notif.key}>
                <View style={styles.toggleRow}>
                  <View style={[styles.iconContainer, { backgroundColor: notif.iconBg }]}>
                    <MaterialCommunityIcons name={notif.icon as any} size={20} color={notif.iconColor} />
                  </View>
                  <View style={styles.toggleText}>
                    <Text style={styles.toggleLabel}>{t(notif.labelKey)}</Text>
                    <Text style={styles.toggleSubtitle}>{t(notif.subtitleKey)}</Text>
                  </View>
                  <Switch
                    value={toggles[notif.key]}
                    onValueChange={() => handleToggle(notif.key)}
                    trackColor={{ false: COLORS.border, true: notif.iconColor + '40' }}
                    thumbColor={toggles[notif.key] ? notif.iconColor : COLORS.text3}
                    disabled={saving === notif.key}
                  />
                </View>
                {i < NOTIF_TOGGLES.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </SettingsGroup>
        </Animated.View>

        {/* Quiet Hours Info */}
        <Animated.View style={animStyle(2)}>
          <SettingsGroup
            header={t('notifSettings.quietHours')}
            footer={t('notifSettings.quietHoursFooter')}
          >
            <View style={styles.quietRow}>
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="moon-waning-crescent" size={20} color={COLORS.white} />
              </View>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>{t('notifSettings.doNotDisturb')}</Text>
                <Text style={styles.toggleSubtitle}>{t('notifSettings.doNotDisturbDesc')}</Text>
              </View>
              <Switch
                value={false}
                onValueChange={() => toast.show({ kind: 'info', title: t('notifSettings.quietHoursSoon') })}
                trackColor={{ false: COLORS.border, true: COLORS.purple + '40' }}
                thumbColor={COLORS.text3}
              />
            </View>
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

  // Banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    marginBottom: SPACING.lg,
    padding: SPACING.lg,
    backgroundColor: COLORS.coralMuted,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.coral + '20',
  },
  bannerIcon: { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: COLORS.coral + '20', alignItems: 'center', justifyContent: 'center' },
  bannerText: { flex: 1 },
  bannerTitle: { fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.coral },
  bannerSubtitle: { fontSize: FONT_SIZES.sm, color: COLORS.text2, marginTop: 2 },

  // Toggle rows
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

  // Quiet hours
  quietRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: SPACING.lg + 36 + SPACING.md,
  },

  bottomSpacer: { height: 60 },
});
