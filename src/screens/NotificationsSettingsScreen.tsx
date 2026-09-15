import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Animated, Switch,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import SettingsGroup from '../components/SettingsGroup';
import { useTranslation } from '../i18n';
import { useToast } from '../components/Toast';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'NotificationsSettings'>;

interface NotifToggle {
  key: string;
  icon: string;
  iconColor: string;
  iconBg: string;
  label: string;
  subtitle: string;
  defaultValue: boolean;
}

const NOTIF_TOGGLES: NotifToggle[] = [
  {
    key: 'order_updates',
    icon: 'package-variant',
    iconColor: COLORS.white,
    iconBg: 'transparent',
    label: 'Order updates',
    subtitle: 'Status changes, delivery updates, confirmations',
    defaultValue: true,
  },
  {
    key: 'messages',
    icon: 'message-text-outline',
    iconColor: COLORS.white,
    iconBg: 'transparent',
    label: 'Messages',
    subtitle: 'New messages from buyers and sellers',
    defaultValue: true,
  },
  {
    key: 'offers',
    icon: 'tag-outline',
    iconColor: COLORS.white,
    iconBg: 'transparent',
    label: 'Offers & discounts',
    subtitle: 'Promo codes, price drops, sale alerts',
    defaultValue: true,
  },
  {
    key: 'product_activity',
    icon: 'heart-outline',
    iconColor: COLORS.white,
    iconBg: 'transparent',
    label: 'Product activity',
    subtitle: 'Wishlist items back in stock, new listings from followed sellers',
    defaultValue: true,
  },
  {
    key: 'system',
    icon: 'cog-outline',
    iconColor: COLORS.white,
    iconBg: 'transparent',
    label: 'System updates',
    subtitle: 'App updates, security alerts, maintenance notices',
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
      toast.show({ kind: 'success', title: `${key.replace('_', ' ')} notifications ${newVal ? 'enabled' : 'disabled'}` });
    }, 300);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Notifications" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Banner */}
        <Animated.View style={animStyle(0)}>
          <View style={styles.banner}>
            <View style={styles.bannerIcon}>
              <MaterialCommunityIcons name="bell-ring" size={28} color={COLORS.coral} />
            </View>
            <View style={styles.bannerText}>
              <Text style={styles.bannerTitle}>Stay in the loop</Text>
              <Text style={styles.bannerSubtitle}>Choose which notifications you receive</Text>
            </View>
          </View>
        </Animated.View>

        {/* Notification Toggles */}
        <Animated.View style={animStyle(1)}>
          <SettingsGroup header="Notification preferences">
            {NOTIF_TOGGLES.map((notif, i) => (
              <View key={notif.key}>
                <View style={styles.toggleRow}>
                  <View style={[styles.iconContainer, { backgroundColor: notif.iconBg }]}>
                    <MaterialCommunityIcons name={notif.icon as any} size={20} color={notif.iconColor} />
                  </View>
                  <View style={styles.toggleText}>
                    <Text style={styles.toggleLabel}>{notif.label}</Text>
                    <Text style={styles.toggleSubtitle}>{notif.subtitle}</Text>
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
            header="Quiet hours"
            footer="You'll still receive order-critical notifications"
          >
            <View style={styles.quietRow}>
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="moon-waning-crescent" size={20} color={COLORS.white} />
              </View>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>Do Not Disturb</Text>
                <Text style={styles.toggleSubtitle}>Silence all non-critical notifications</Text>
              </View>
              <Switch
                value={false}
                onValueChange={() => toast.show({ kind: 'info', title: 'Quiet hours coming soon' })}
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
