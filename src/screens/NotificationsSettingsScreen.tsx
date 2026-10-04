import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Linking,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS, TOUCH } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import SettingsGroup from '../components/SettingsGroup';
import SettingsToggle from '../components/SettingsToggle';
import { useTranslation } from '@/localization';
import { useToast } from '../components/Toast';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import { getNotificationPreferences, updateNotificationPreferences } from '../api';
import type { NotificationPreferences } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'NotificationsSettings'>;

type DeliveryMode = 'push_now' | 'daily_summary' | 'in_app';

const DEFAULT_PREFS: NotificationPreferences = {
  categories: {
    security_account: 'push_now',
    orders_payments: 'push_now',
    meetups: 'push_now',
    disputes: 'push_now',
    inventory_alerts: 'push_now',
    follows: 'push_now',
    offers: 'push_now',
    reviews: 'daily_summary',
    seller_updates: 'daily_summary',
    marketing_promos: 'off',
  },
  quiet_hours: {
    enabled: false,
    start: '22:00',
    end: '08:00',
    days: 'all',
  },
  snooze_until: null,
  daily_summary_time: '09:00',
  hide_sensitive_previews: true,
  muted_seller_ids: [],
};

export default function NotificationsSettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const toast = useToast();

  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState<boolean>(true);

  // Check device push permissions
  useEffect(() => {
    (async () => {
      try {
        const Notifications = require('expo-notifications');
        const { status } = await Notifications.getPermissionsAsync();
        setHasPermission(status === 'granted');
      } catch {
        // Not on native device / expo-notifications unavailable
        setHasPermission(true);
      }
    })();
  }, []);

  // Load preferences from backend
  const loadPreferences = useCallback(async () => {
    try {
      const res = (await getNotificationPreferences()) as { preferences?: Partial<NotificationPreferences> };
      if (res?.preferences) {
        const p = res.preferences;
        setPrefs(prev => ({
          ...prev,
          ...p,
          categories: { ...prev.categories, ...(p.categories || {}) },
          quiet_hours: { ...prev.quiet_hours, ...(p.quiet_hours || {}) },
        }));
      }
    } catch {
      // Fallback to defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const saveUpdates = async (newPrefs: NotificationPreferences) => {
    setPrefs(newPrefs);
    try {
      await updateNotificationPreferences(newPrefs);
    } catch {
      toast.error(t('feedback.notificationUpdateFailed'));
    }
  };

  // Snooze duration handler
  const handleSetSnooze = (duration: 'off' | '1h' | 'tonight' | 'tomorrow') => {
    let untilDate: Date | null = null;
    const now = new Date();

    if (duration === '1h') {
      untilDate = new Date(now.getTime() + 60 * 60 * 1000);
    } else if (duration === 'tonight') {
      // Tonight until 8:00 AM tomorrow
      const tomorrow8am = new Date(now);
      tomorrow8am.setDate(tomorrow8am.getDate() + 1);
      tomorrow8am.setHours(8, 0, 0, 0);
      untilDate = tomorrow8am;
    } else if (duration === 'tomorrow') {
      untilDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }

    const updated: NotificationPreferences = {
      ...prefs,
      snooze_until: untilDate ? untilDate.toISOString() : null,
    };
    saveUpdates(updated);
    toast.show({
      kind: 'info',
      title: untilDate ? t('notifSettings.pausedUntil', { time: untilDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }) : t('notifSettings.pauseOff'),
    });
  };

  // Category mode handler
  const handleCategoryMode = (catKey: keyof NotificationPreferences['categories'], mode: DeliveryMode) => {
    const updated: NotificationPreferences = {
      ...prefs,
      categories: {
        ...prefs.categories,
        [catKey]: mode,
      },
    };
    saveUpdates(updated);
  };

  // Toggle sensitive preview
  const handleToggleSensitive = () => {
    const updated: NotificationPreferences = {
      ...prefs,
      hide_sensitive_previews: !prefs.hide_sensitive_previews,
    };
    saveUpdates(updated);
  };

  // Toggle quiet hours
  const handleToggleQuietHours = () => {
    const updated: NotificationPreferences = {
      ...prefs,
      quiet_hours: {
        ...prefs.quiet_hours,
        enabled: !prefs.quiet_hours.enabled,
      },
    };
    saveUpdates(updated);
  };

  // Repeat days selection
  const handleQuietDays = (days: 'all' | 'weekdays' | 'weekends') => {
    const updated: NotificationPreferences = {
      ...prefs,
      quiet_hours: {
        ...prefs.quiet_hours,
        days,
      },
    };
    saveUpdates(updated);
  };

  // Marketing opt-in toggle
  const handleTogglePromos = () => {
    const isCurrentlyOn = prefs.categories.marketing_promos === 'push_now';
    const updated: NotificationPreferences = {
      ...prefs,
      categories: {
        ...prefs.categories,
        marketing_promos: isCurrentlyOn ? 'off' : 'push_now',
      },
    };
    saveUpdates(updated);
  };

  const isSnoozed = prefs.snooze_until && new Date(prefs.snooze_until).getTime() > Date.now();
  const snoozeFormattedTime = isSnoozed
    ? new Date(prefs.snooze_until!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('settings.notifications')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Device Permission Banner */}
        {!hasPermission && (
          <View style={styles.permissionCard}>
            <View style={styles.permissionIconRow}>
              <MaterialCommunityIcons name="bell-cancel-outline" size={24} color={COLORS.coral} />
              <View style={styles.permissionTextCol}>
                <Text style={styles.permissionTitle}>{t('notifSettings.permissionDisabledTitle')}</Text>
                <Text style={styles.permissionDesc}>{t('notifSettings.permissionDisabledDesc')}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.openSettingsBtn}
              onPress={() => Linking.openSettings()}
              accessibilityRole="button"
            >
              <Text style={styles.openSettingsBtnText}>{t('notifSettings.openSettings')}</Text>
              <MaterialCommunityIcons name="arrow-right" size={16} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        )}

        {/* Temporary Pause / Snooze */}
        <SettingsGroup header={t('notifSettings.pauseTitle')} footer={t('notifSettings.pauseDesc')}>
          <View style={styles.groupContent}>
            {isSnoozed ? (
              <View style={styles.activeSnoozeBanner}>
                <View style={styles.snoozeBadge}>
                  <MaterialCommunityIcons name="pause-circle-outline" size={18} color={COLORS.coral} />
                  <Text style={styles.snoozeBadgeText}>
                    {t('notifSettings.pausedUntil', { time: snoozeFormattedTime || '' })}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.resumeBtn}
                  onPress={() => handleSetSnooze('off')}
                  accessibilityRole="button"
                >
                  <Text style={styles.resumeBtnText}>Resume</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={styles.segmentedRow}>
              {(['off', '1h', 'tonight', 'tomorrow'] as const).map(opt => {
                const isSelected = (!isSnoozed && opt === 'off') || (isSnoozed && false);
                const label =
                  opt === 'off'
                    ? t('notifSettings.pauseOff')
                    : opt === '1h'
                    ? t('notifSettings.pause1h')
                    : opt === 'tonight'
                    ? t('notifSettings.pauseTonight')
                    : t('notifSettings.pauseTomorrow');

                return (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.segmentBtn, isSelected && styles.segmentBtnActive]}
                    onPress={() => handleSetSnooze(opt)}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.segmentBtnText, isSelected && styles.segmentBtnTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </SettingsGroup>

        {/* Quiet Hours Schedule */}
        <SettingsGroup header={t('notifSettings.quietHours')} footer={t('notifSettings.quietHoursDesc')}>
          <View style={styles.toggleRow}>
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons name="moon-waning-crescent" size={20} color={COLORS.text2} />
            </View>
            <View style={styles.toggleText}>
              <Text style={styles.toggleLabel}>{t('notifSettings.quietHoursSchedule')}</Text>
              <Text style={styles.toggleSubtitle}>10:00 PM – 8:00 AM</Text>
            </View>
            <SettingsToggle
              value={prefs.quiet_hours.enabled}
              onValueChange={handleToggleQuietHours}
              accent={COLORS.coral}
              accessibilityLabel={t('notifSettings.quietHoursSchedule')}
            />
          </View>

          {prefs.quiet_hours.enabled && (
            <View style={styles.quietSubSection}>
              <View style={styles.daysRow}>
                {(['all', 'weekdays', 'weekends'] as const).map(d => {
                  const isActive = prefs.quiet_hours.days === d;
                  const label =
                    d === 'all'
                      ? t('notifSettings.everyDay')
                      : d === 'weekdays'
                      ? t('notifSettings.weekdays')
                      : t('notifSettings.weekends');

                  return (
                    <TouchableOpacity
                      key={d}
                      style={[styles.dayPill, isActive && styles.dayPillActive]}
                      onPress={() => handleQuietDays(d)}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.dayPillText, isActive && styles.dayPillTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </SettingsGroup>

        {/* Lock Screen Privacy */}
        <SettingsGroup header={t('notifSettings.sensitivePreview')} footer={t('notifSettings.sensitivePreviewDesc')}>
          <View style={styles.toggleRow}>
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons name="shield-lock-outline" size={20} color={COLORS.text2} />
            </View>
            <View style={styles.toggleText}>
              <Text style={styles.toggleLabel}>{t('notifSettings.sensitivePreview')}</Text>
            </View>
            <SettingsToggle
              value={prefs.hide_sensitive_previews}
              onValueChange={handleToggleSensitive}
              accent={COLORS.coral}
              accessibilityLabel={t('notifSettings.sensitivePreview')}
            />
          </View>
        </SettingsGroup>

        {/* Essential Alerts (Always Immediate) */}
        <SettingsGroup header={t('notifSettings.essentialSection')} footer={t('notifSettings.essentialDesc')}>
          <View style={styles.essentialRow}>
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons name="shield-check" size={20} color={COLORS.green} />
            </View>
            <View style={styles.toggleText}>
              <Text style={styles.toggleLabel}>Security, Orders & Meetups</Text>
              <Text style={styles.toggleSubtitle}>Always immediate push alerts</Text>
            </View>
            <View style={styles.lockedBadge}>
              <Text style={styles.lockedBadgeText}>Essential</Text>
            </View>
          </View>
        </SettingsGroup>

        {/* Configurable Category Preferences */}
        <SettingsGroup header="Activity Categories">
          {/* Follows */}
          <CategoryDeliveryRow
            title="Follows"
            subtitle="When new buyers or sellers follow you"
            mode={prefs.categories.follows || 'push_now'}
            onSelectMode={m => handleCategoryMode('follows', m)}
            t={t}
          />
          <View style={styles.divider} />

          {/* Offers */}
          <CategoryDeliveryRow
            title="Offers & Counters"
            subtitle="Private price negotiations in chat"
            mode={prefs.categories.offers || 'push_now'}
            onSelectMode={m => handleCategoryMode('offers', m)}
            t={t}
          />
          <View style={styles.divider} />

          {/* Reviews */}
          <CategoryDeliveryRow
            title="Reviews Received"
            subtitle="Customer feedback on completed orders"
            mode={prefs.categories.reviews || 'daily_summary'}
            onSelectMode={m => handleCategoryMode('reviews', m)}
            t={t}
          />
          <View style={styles.divider} />

          {/* Seller Updates */}
          <CategoryDeliveryRow
            title="Followed Seller Updates"
            subtitle="New listings from sellers you follow"
            mode={prefs.categories.seller_updates || 'daily_summary'}
            onSelectMode={m => handleCategoryMode('seller_updates', m)}
            t={t}
          />
        </SettingsGroup>

        {/* Promotional / Marketing Opt-in */}
        <SettingsGroup
          header={t('notifSettings.promosOptIn')}
          footer={t('notifSettings.promosOptInDesc')}
        >
          <View style={styles.toggleRow}>
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons name="bullhorn-outline" size={20} color={COLORS.text2} />
            </View>
            <View style={styles.toggleText}>
              <Text style={styles.toggleLabel}>{t('notifSettings.promosOptIn')}</Text>
            </View>
            <SettingsToggle
              value={prefs.categories.marketing_promos === 'push_now'}
              onValueChange={handleTogglePromos}
              accent={COLORS.coral}
              accessibilityLabel={t('notifSettings.promosOptIn')}
            />
          </View>
        </SettingsGroup>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

function CategoryDeliveryRow({
  title,
  subtitle,
  mode,
  onSelectMode,
  t,
}: {
  title: string;
  subtitle: string;
  mode: DeliveryMode;
  onSelectMode: (mode: DeliveryMode) => void;
  t: (key: string) => string;
}) {
  return (
    <View style={styles.categoryRow}>
      <View style={styles.catHeaderCol}>
        <Text style={styles.catTitle}>{title}</Text>
        <Text style={styles.catSubtitle}>{subtitle}</Text>
      </View>
      <View style={styles.modeSegment}>
        {(['push_now', 'daily_summary', 'in_app'] as const).map(m => {
          const isActive = mode === m;
          const label =
            m === 'push_now'
              ? t('notifSettings.modeImmediate')
              : m === 'daily_summary'
              ? t('notifSettings.modeSummary')
              : t('notifSettings.modeInApp');

          return (
            <TouchableOpacity
              key={m}
              style={[styles.modeBtn, isActive && styles.modeBtnActive]}
              onPress={() => onSelectMode(m)}
              accessibilityRole="button"
            >
              <Text style={[styles.modeBtnText, isActive && styles.modeBtnTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingBottom: SPACING.page },

  /* Device permission banner */
  permissionCard: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.coral + '40',
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    gap: 12,
  },
  permissionIconRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  permissionTextCol: { flex: 1 },
  permissionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  permissionDesc: { fontSize: 12, color: COLORS.text2, lineHeight: 17, marginTop: 2 },
  openSettingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.coral,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  openSettingsBtnText: { fontSize: 12.5, fontWeight: '700', color: COLORS.white },

  /* Pause / Snooze */
  groupContent: { padding: SPACING.sm },
  activeSnoozeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.coral + '15',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  snoozeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  snoozeBadgeText: { fontSize: 12.5, fontWeight: '700', color: COLORS.coral },
  resumeBtn: { paddingVertical: 4, paddingHorizontal: 10 },
  resumeBtnText: { fontSize: 12.5, fontWeight: '700', color: COLORS.coral },

  segmentedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  segmentBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: COLORS.surface2,
  },
  segmentBtnActive: { backgroundColor: COLORS.coral },
  segmentBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.text2 },
  segmentBtnTextActive: { color: COLORS.white, fontWeight: '700' },

  /* Toggle rows */
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    minHeight: 54,
  },
  essentialRow: {
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
  toggleLabel: { fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.medium, color: COLORS.text },
  toggleSubtitle: { fontSize: 12, color: COLORS.text2, marginTop: 2 },
  lockedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: COLORS.green + '18',
  },
  lockedBadgeText: { fontSize: 11, fontWeight: '700', color: COLORS.green },

  /* Quiet hours sub-section */
  quietSubSection: {
    paddingHorizontal: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  daysRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dayPill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: COLORS.surface2,
  },
  dayPillActive: { backgroundColor: COLORS.coral },
  dayPillText: { fontSize: 11, fontWeight: '600', color: COLORS.text2 },
  dayPillTextActive: { color: COLORS.white, fontWeight: '700' },

  /* Category delivery row */
  categoryRow: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.md,
    gap: 8,
  },
  catHeaderCol: { gap: 2 },
  catTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  catSubtitle: { fontSize: 12, color: COLORS.text2 },
  modeSegment: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: COLORS.coral,
  },
  modeBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.text2,
  },
  modeBtnTextActive: {
    color: COLORS.white,
    fontWeight: '700',
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.sm,
  },

  bottomSpacer: { height: 60 },
});
