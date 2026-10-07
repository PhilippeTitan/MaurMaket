import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, Animated, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, RADIUS, SPACING, TOUCH } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import SettingsGroup from '../components/SettingsGroup';
import { useTranslation } from '@/localization';
import { useToast } from '../components/Toast';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'DevicePermissions'>;

type PermStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable' | 'loading';
type PermKey = 'camera' | 'photos' | 'location' | 'notifications';

const ROWS: { key: PermKey; icon: string; titleKey: string; bodyKey: string }[] = [
  { key: 'camera', icon: 'camera-outline', titleKey: 'permissions.cameraTitle', bodyKey: 'permissions.cameraBody' },
  { key: 'photos', icon: 'image-multiple-outline', titleKey: 'permissions.photosTitle', bodyKey: 'permissions.photosBody' },
  { key: 'location', icon: 'map-marker-outline', titleKey: 'permissions.locationTitle', bodyKey: 'permissions.locationBody' },
  { key: 'notifications', icon: 'bell-outline', titleKey: 'permissions.notificationsTitle', bodyKey: 'permissions.notificationsBody' },
];

function normalize(status?: string): PermStatus {
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  if (status === 'undetermined') return 'undetermined';
  return 'undetermined';
}

export default function DevicePermissionsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const toast = useToast();

  const [statuses, setStatuses] = useState<Record<PermKey, PermStatus>>({
    camera: 'loading', photos: 'loading', location: 'loading', notifications: 'loading',
  });
  const [refreshing, setRefreshing] = useState(false);
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    let subscription: { remove?: () => void } | undefined;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(reduce => { if (active && !reduce) Animated.timing(entrance, { toValue: 1, duration: 280, useNativeDriver: true }).start(); else if (active) entrance.setValue(1); })
      .catch(() => { if (active) Animated.timing(entrance, { toValue: 1, duration: 280, useNativeDriver: true }).start(); });
    subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (reduce: boolean) => { if (reduce) entrance.setValue(1); });
    return () => { active = false; subscription?.remove?.(); entrance.stopAnimation(); };
  }, [entrance]);

  const readStatuses = useCallback(async () => {
    const next: Record<PermKey, PermStatus> = {
      camera: 'unavailable', photos: 'unavailable', location: 'unavailable', notifications: 'unavailable',
    };

    try {
      const Notifications = await import('expo-notifications');
      const { status } = await Notifications.getPermissionsAsync();
      next.notifications = normalize(status);
    } catch { /* keep unavailable */ }

    try {
      const ImagePicker: any = await import('expo-image-picker');
      if (typeof ImagePicker.getCameraPermissionsAsync === 'function') {
        const cam = await ImagePicker.getCameraPermissionsAsync();
        next.camera = normalize(cam?.status);
      }
      if (typeof ImagePicker.getMediaLibraryPermissionsAsync === 'function') {
        const media = await ImagePicker.getMediaLibraryPermissionsAsync();
        next.photos = normalize(media?.status);
      }
    } catch { /* keep unavailable */ }

    try {
      const Location: any = await import('expo-location');
      if (typeof Location.getForegroundPermissionsAsync === 'function') {
        const { status } = await Location.getForegroundPermissionsAsync();
        next.location = normalize(status);
      }
    } catch { /* keep unavailable */ }

    return next;
  }, []);

  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      setStatuses(await readStatuses());
    } catch {
      toast.error(t('permissions.title'), t('permissions.loadFailed'));
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, readStatuses, t, toast]);

  useEffect(() => { void refresh(); }, [refresh]);

  const openSystemSettings = useCallback(() => {
    if (Platform.OS === 'web') return;
    void Linking.openSettings();
  }, []);

  const statusLabel = (status: PermStatus): string => {
    if (status === 'granted') return t('permissions.statusGranted');
    if (status === 'denied') return t('permissions.statusDenied');
    if (status === 'unavailable') return t('permissions.statusUnavailable');
    if (status === 'undetermined') return t('permissions.statusUndetermined');
    return '';
  };

  const statusColor = (status: PermStatus): string => {
    if (status === 'granted') return COLORS.green;
    if (status === 'denied') return COLORS.coral;
    return COLORS.text3;
  };

  const animStyle = {
    opacity: entrance,
    transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('permissions.title')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={animStyle}>
          <Text style={styles.intro}>{t('permissions.intro')}</Text>
          <Text style={styles.note}>{t('permissions.osNote')}</Text>
        </Animated.View>

        <Animated.View style={animStyle}>
          <SettingsGroup header={t('permissions.title')}>
            {ROWS.map((row, index) => {
              const status = statuses[row.key];
              return (
                <View key={row.key} style={[styles.row, index < ROWS.length - 1 && styles.divider]}>
                  <View style={styles.iconContainer}>
                    <MaterialCommunityIcons name={row.icon as any} size={20} color={COLORS.text2} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>{t(row.titleKey)}</Text>
                    <Text style={styles.rowBody}>{t(row.bodyKey)}</Text>
                    {status === 'loading' ? (
                      <MaterialCommunityIcons name="loading" size={14} color={COLORS.text3} />
                    ) : (
                      <View style={styles.statusRow}>
                        <View style={[styles.statusDot, { backgroundColor: statusColor(status) }]} />
                        <Text style={[styles.statusText, { color: statusColor(status) }]}>{statusLabel(status)}</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.actionRow}
              activeOpacity={0.65}
              onPress={openSystemSettings}
              disabled={Platform.OS === 'web'}
              accessibilityRole="button"
              accessibilityLabel={t('permissions.openSettings')}
              accessibilityHint={t('permissions.openSettingsHint')}
              accessibilityState={{ disabled: Platform.OS === 'web' }}
            >
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="open-in-new" size={20} color={COLORS.coral} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.actionTitle}>{t('permissions.openSettings')}</Text>
                <Text style={styles.rowBody}>{t('permissions.openSettingsHint')}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text3} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.actionRow}
              activeOpacity={0.65}
              onPress={() => void refresh()}
              disabled={refreshing}
              accessibilityRole="button"
              accessibilityLabel={t('permissions.refresh')}
              accessibilityState={{ busy: refreshing, disabled: refreshing }}
            >
              <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="refresh" size={20} color={COLORS.text2} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{t('permissions.refresh')}</Text>
              </View>
            </TouchableOpacity>
          </SettingsGroup>
        </Animated.View>

        <Animated.View style={animStyle}>
          <SettingsGroup header={t('permissions.revokedTitle')}>
            <View style={styles.noteWrap}>
              <Text style={styles.rowBody}>{t('permissions.revokedBody')}</Text>
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
  scroll: { paddingBottom: SPACING.xxxl },
  intro: { fontSize: FONT_SIZES.md, color: COLORS.text2, lineHeight: 20, marginHorizontal: SPACING.lg, marginTop: SPACING.md },
  note: { fontSize: FONT_SIZES.sm, color: COLORS.text3, lineHeight: 18, marginHorizontal: SPACING.lg, marginTop: SPACING.xs },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    minHeight: TOUCH.min,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    minHeight: TOUCH.min,
  },
  iconContainer: { width: 28, height: 32, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  rowText: { flex: 1 },
  rowTitle: { fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.medium, color: COLORS.text },
  actionTitle: { fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.coral },
  rowBody: { fontSize: FONT_SIZES.sm, color: COLORS.text2, marginTop: 2, lineHeight: 18 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.xs },
  statusDot: { width: SPACING.sm, height: SPACING.sm, borderRadius: RADIUS.full },
  statusText: { fontSize: FONT_SIZES.sm, fontWeight: FONT_WEIGHTS.semibold },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginLeft: SPACING.sm + 28 + SPACING.md },
  noteWrap: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm },
  bottomSpacer: { height: 60 },
});
