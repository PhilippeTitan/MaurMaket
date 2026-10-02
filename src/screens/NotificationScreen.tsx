import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Pressable,
  Animated,
  PanResponder,
  AccessibilityInfo,
  ScrollView,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS, TOUCH } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import EmptyState from '../components/EmptyState';
import { RowListSkeleton } from '../components/Skeleton';
import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
  undoDismissNotification,
  clearReadNotifications,
  muteSellerUpdates,
  getImageUrl,
} from '../api';
import { routeNotification } from '../notificationRouting';
import type { Notification } from '../types';
import type { RootStackParamList } from '../navigation';
import { useToast } from '../components/Toast';
import { store } from '../store';
import { useTranslation } from '@/localization';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type FilterTab = 'all' | 'action_needed' | 'social' | 'marketplace';

// Inbox activity is stored and surfaced by Inbox. Filter stale cached rows
// created by older builds so they cannot reappear while the device is offline.
function isInboxActivity(item: Notification): boolean {
  const type = String(item.type || '').toLowerCase();
  const dataType = String((item.data as any)?.type || '').toLowerCase();
  const title = String(item.title || '').trim().toLowerCase();
  return [
    'new_message', 'new_offer', 'counter_offer', 'offer_accepted', 'offer_declined', 'offer_expired',
    'message', 'message_received', 'direct_message',
  ].includes(type)
    || ['new_message', 'new_offer', 'counter_offer', 'offer_accepted', 'offer_declined', 'offer_expired'].includes(dataType)
    || title === 'new message'
    || title === 'listing shared';
}

function getNotifConfig(type: string): { icon: string; color: string; accent: string; bg: string } {
  switch (type) {
    // ── Order & Payment ──
    case 'new_order':
    case 'order_placed':
      return { icon: 'package-variant', color: COLORS.green, accent: COLORS.green, bg: COLORS.green + '18' };
    case 'escrow_held':
    case 'payment_confirmed':
    case 'order_status':
      return { icon: 'bank-outline', color: COLORS.blue, accent: COLORS.blue, bg: COLORS.blue + '18' };
    case 'payout_released':
    case 'escrow_released':
      return { icon: 'check-circle-outline', color: COLORS.green, accent: COLORS.green, bg: COLORS.green + '18' };
    case 'payment_failed':
    case 'order_cancelled':
      return { icon: 'close-circle-outline', color: COLORS.coral, accent: COLORS.coral, bg: COLORS.coral + '18' };
    case 'order_note':
    case 'note_from_seller':
      return { icon: 'note-text-outline', color: COLORS.text2, accent: COLORS.text2, bg: COLORS.text2 + '18' };
    case 'dispute_opened':
      return { icon: 'alert-circle-outline', color: COLORS.coral, accent: COLORS.coral, bg: COLORS.coral + '18' };
    // ── Meetup & Fulfillment ──
    case 'fulfillment_proposed':
    case 'fulfillment_countered':
    case 'meetup_proposed':
      return { icon: 'map-marker-radius-outline', color: COLORS.coral, accent: COLORS.coral, bg: COLORS.coral + '18' };
    case 'fulfillment_accepted':
    case 'meetup_confirmed':
      return { icon: 'map-marker-check-outline', color: COLORS.green, accent: COLORS.green, bg: COLORS.green + '18' };
    case 'fulfillment_rejected':
    case 'fulfillment_expired':
    case 'fulfillment_proposal_expired':
    case 'meetup_expired':
      return { icon: 'clock-alert-outline', color: COLORS.text2, accent: COLORS.text2, bg: COLORS.text2 + '18' };
    // ── Reviews ──
    case 'review_received':
      return { icon: 'star-outline', color: COLORS.yellow, accent: COLORS.yellow, bg: COLORS.yellow + '18' };
    // ── Social & Product ──
    case 'new_follower':
      return { icon: 'account-plus-outline', color: COLORS.coral, accent: COLORS.coral, bg: COLORS.coral + '18' };
    case 'new_product_from_followed':
    case 'product_saved':
      return { icon: 'tag-outline', color: COLORS.green, accent: COLORS.green, bg: COLORS.green + '18' };
    case 'low_stock':
    case 'product_sold_out':
      return { icon: 'alert-circle-outline', color: COLORS.coral, accent: COLORS.coral, bg: COLORS.coral + '18' };
    // ── Escrow / Payout ──
    case 'escrow_refunded':
    case 'payout_failed':
      return { icon: 'currency-usd', color: COLORS.coral, accent: COLORS.coral, bg: COLORS.coral + '18' };
    // ── Account / Subscription ──
    case 'subscription_expired':
    case 'natcash_access_expiry':
      return { icon: 'crown-outline', color: COLORS.coral, accent: COLORS.coral, bg: COLORS.coral + '18' };
    case 'subscription_activated':
    case 'natcash_access_renewed':
      return { icon: 'crown-outline', color: COLORS.green, accent: COLORS.green, bg: COLORS.green + '18' };
    case 'verification_approved':
      return { icon: 'shield-check-outline', color: COLORS.green, accent: COLORS.green, bg: COLORS.green + '18' };
    case 'verification_rejected':
      return { icon: 'shield-remove-outline', color: COLORS.coral, accent: COLORS.coral, bg: COLORS.coral + '18' };
    default:
      return { icon: 'bell-outline', color: COLORS.text2, accent: COLORS.text2, bg: COLORS.text2 + '18' };
  }
}

function timeAgo(dateStr: string, t: (key: string, params?: Record<string, any>) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('common.justNow');
  if (mins < 60) return t('common.minutesAgo', { mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('common.hoursAgo', { hours: hrs });
  const days = Math.floor(hrs / 24);
  if (days === 1) return t('notif.section.yesterday');
  if (days < 7) return t('common.daysAgo', { days });
  return new Date(dateStr).toLocaleDateString('fr-HT', { day: 'numeric', month: 'short' });
}

function formatDeadline(deadlineStr: string | null | undefined, t: (key: string, params?: Record<string, any>) => string): string | null {
  if (!deadlineStr) return null;
  const diff = new Date(deadlineStr).getTime() - Date.now();
  if (diff <= 0) return t('notif.expired');
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return t('notif.expiresInMins', { mins });
  const hrs = Math.floor(mins / 60);
  return t('notif.expiresInHours', { hours: hrs });
}

interface SectionItem {
  isHeader: boolean;
  sectionLabel?: string;
  item?: Notification;
}

export default function NotificationScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const toast = useToast();

  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [actionNeededCount, setActionNeededCount] = useState(0);
  const [isOffline, setIsOffline] = useState(false);

  // Group detail sheet
  const [selectedGroup, setSelectedGroup] = useState<Notification | null>(null);
  const [mutedSellers, setMutedSellers] = useState<Set<string>>(new Set());

  // Clear confirmation modal
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Undo dismiss banner
  const [dismissedItem, setDismissedItem] = useState<{ id: string; notif: Notification } | null>(null);
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Reduce motion check
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  const cacheKey = `cached_notifs_${store.user?.id || 'anon'}`;

  const saveCache = useCallback(async (data: Notification[]) => {
    try {
      await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
    } catch {}
  }, [cacheKey]);

  const loadCached = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(cacheKey);
      if (raw) {
        const data = (JSON.parse(raw) as Notification[]).filter(item => !isInboxActivity(item));
        setNotifications(data);
        saveCache(data);
      }
    } catch {}
  }, [cacheKey, saveCache]);

  const fetchData = useCallback(async (filter: FilterTab = activeFilter, isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const [notifRes, countRes] = await Promise.all([
        getNotifications(filter) as Promise<{ notifications: Notification[] }>,
        getUnreadCount() as Promise<{ count: number; actionNeededCount: number }>,
      ]);

      const items = (notifRes.notifications || []).filter((item: Notification) => !isInboxActivity(item));
      setNotifications(items);
      setUnreadCount(countRes.count || 0);
      setActionNeededCount(countRes.actionNeededCount || 0);
      setIsOffline(false);
      saveCache(items);
    } catch {
      setIsOffline(true);
      await loadCached();
    } finally {
      setLoading(false);
    }
  }, [activeFilter, loadCached, saveCache]);

  useFocusEffect(
    useCallback(() => {
      fetchData(activeFilter, true);
    }, [activeFilter, fetchData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData(activeFilter, true);
    setRefreshing(false);
  }, [activeFilter, fetchData]);

  const handleFilterChange = (tab: FilterTab) => {
    setActiveFilter(tab);
    fetchData(tab);
  };

  const handlePress = async (notif: Notification) => {
    if (notif.is_group) {
      // Open group detail modal and mark child events read
      setSelectedGroup(notif);
      if (!notif.is_read) {
        try {
          await markNotificationRead(notif.id);
        } catch {}
        setNotifications(prev => prev.map(n => (n.id === notif.id ? { ...n, is_read: true } : n)));
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
      return;
    }

    if (!notif.is_read) {
      try {
        await markNotificationRead(notif.id);
      } catch {}
      setNotifications(prev => prev.map(n => (n.id === notif.id ? { ...n, is_read: true } : n)));
      setUnreadCount(prev => Math.max(0, prev - 1));
    }

    routeNotification(nav, notif.type, notif.data as Record<string, any>);
  };

  const handleCTA = (notif: Notification) => {
    if (!notif.is_read) {
      markNotificationRead(notif.id).catch(() => {});
      setNotifications(prev => prev.map(n => (n.id === notif.id ? { ...n, is_read: true } : n)));
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    routeNotification(nav, notif.type, notif.data as Record<string, any>);
  };

  const handleDismiss = async (notif: Notification) => {
    const targetId = notif.id;
    // Optimistically remove from visible list
    setNotifications(prev => prev.filter(n => n.id !== targetId));

    // Show Undo banner
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    setDismissedItem({ id: targetId, notif });
    undoTimeoutRef.current = setTimeout(() => {
      setDismissedItem(null);
    }, 5000);

    try {
      await dismissNotification(targetId);
      if (!notif.is_read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch {
      toast.error(t('feedback.notificationUpdateFailed'));
    }
  };

  const handleUndoDismiss = async () => {
    if (!dismissedItem) return;
    const { id, notif } = dismissedItem;
    setDismissedItem(null);
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);

    // Optimistically restore
    setNotifications(prev => [notif, ...prev]);

    try {
      await undoDismissNotification(id);
      fetchData(activeFilter, true);
    } catch {
      toast.error(t('feedback.notificationUpdateFailed'));
    }
  };

  const handleClearRead = async () => {
    setShowClearConfirm(false);
    try {
      await clearReadNotifications();
      setNotifications(prev => prev.filter(n => !n.is_read || (n.action_required && !n.action_resolved)));
      toast.show({ kind: 'success', title: t('notif.dismissed') });
    } catch {
      toast.error(t('feedback.notificationUpdateFailed'));
    }
  };

  const handleToggleMuteSeller = async (sellerId: string) => {
    const isMuted = mutedSellers.has(sellerId);
    const nextMuted = !isMuted;
    try {
      await muteSellerUpdates(sellerId, nextMuted);
      setMutedSellers(prev => {
        const next = new Set(prev);
        if (nextMuted) next.add(sellerId);
        else next.delete(sellerId);
        return next;
      });
      toast.show({
        kind: 'info',
        title: t(nextMuted ? 'notif.group.mutedToast' : 'notif.group.unmutedToast'),
      });
    } catch {
      toast.error(t('feedback.notificationUpdateFailed'));
    }
  };

  // Build section list (time grouping for normal tabs, active tasks list for action_needed)
  const buildSectionData = (): SectionItem[] => {
    if (activeFilter === 'action_needed') {
      const result: SectionItem[] = [];
      if (notifications.length > 0) {
        result.push({ isHeader: true, sectionLabel: t('notif.section.activeTasks') });
        for (const n of notifications) {
          result.push({ isHeader: false, item: n });
        }
      }
      return result;
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);

    const todayItems: Notification[] = [];
    const yesterdayItems: Notification[] = [];
    const earlierItems: Notification[] = [];

    for (const n of notifications) {
      const d = new Date(n.created_at);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      if (dayStart.getTime() === today.getTime()) {
        todayItems.push(n);
      } else if (dayStart.getTime() === yesterday.getTime()) {
        yesterdayItems.push(n);
      } else {
        earlierItems.push(n);
      }
    }

    const result: SectionItem[] = [];
    if (todayItems.length > 0) {
      result.push({ isHeader: true, sectionLabel: t('notif.section.today') });
      todayItems.forEach(n => result.push({ isHeader: false, item: n }));
    }
    if (yesterdayItems.length > 0) {
      result.push({ isHeader: true, sectionLabel: t('notif.section.yesterday') });
      yesterdayItems.forEach(n => result.push({ isHeader: false, item: n }));
    }
    if (earlierItems.length > 0) {
      result.push({ isHeader: true, sectionLabel: t('notif.section.earlier') });
      earlierItems.forEach(n => result.push({ isHeader: false, item: n }));
    }
    return result;
  };

  const getCTAInfo = (notif: Notification): { label: string; icon: string } | null => {
    if (!notif.action_required || notif.action_resolved) return null;
    switch (notif.type) {
      case 'fulfillment_proposed':
      case 'meetup_proposed':
        return { label: t('notif.action.confirm'), icon: 'check-circle-outline' };
      case 'fulfillment_countered':
        return { label: t('notif.action.respond'), icon: 'message-text-outline' };
      case 'payment_failed':
        return { label: t('notif.action.retryPayment'), icon: 'credit-card-refresh-outline' };
      case 'dispute_opened':
        return { label: t('notif.action.respond'), icon: 'alert-circle-outline' };
      case 'low_stock':
      case 'product_sold_out':
        return { label: t('notif.action.editListing'), icon: 'pencil-outline' };
      case 'subscription_expired':
      case 'natcash_access_expiry':
        return { label: t('notif.action.renewNow'), icon: 'crown-outline' };
      case 'verification_rejected':
        return { label: t('notif.action.resubmitId'), icon: 'shield-refresh-outline' };
      default:
        return { label: t('notif.action.respond'), icon: 'arrow-right' };
    }
  };

  const renderItem = ({ item }: { item: SectionItem }) => {
    if (item.isHeader) {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>{item.sectionLabel}</Text>
        </View>
      );
    }

    const notif = item.item!;
    const isUnread = !notif.is_read;
    const isActionNeeded = notif.action_required && !notif.action_resolved;
    const config = getNotifConfig(notif.type);
    const deadlineText = formatDeadline(notif.action_deadline, t);
    const cta = getCTAInfo(notif);
    const data = notif.data || {};

    const avatarUrl = data.avatarUrl || data.image || (data.followerId ? null : null);
    const productImageUrl = data.productId && data.productImage ? getImageUrl(data.productImage) : null;

    return (
      <View style={styles.cardWrapper}>
        <TouchableOpacity
          style={[
            styles.notifCard,
            isUnread && styles.notifCardUnread,
            isActionNeeded && styles.notifCardAction,
          ]}
          onPress={() => handlePress(notif)}
          activeOpacity={0.7}
          accessibilityLabel={notif.title}
          accessibilityRole="button"
        >
          {/* Subtle unread accent bar */}
          {isUnread && (
            <View style={[styles.notifAccent, { backgroundColor: isActionNeeded ? COLORS.coral : config.accent }]} />
          )}

          {/* Visual: Avatar, product thumbnail, or clean restrained icon */}
          <View style={styles.leadingContainer}>
            {avatarUrl ? (
              <ExpoImage source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" />
            ) : productImageUrl ? (
              <ExpoImage source={{ uri: productImageUrl }} style={styles.productThumb} contentFit="cover" />
            ) : (
              <View style={[styles.notifIcon, { backgroundColor: config.bg }]}>
                <MaterialCommunityIcons name={config.icon as any} size={20} color={config.color} />
              </View>
            )}

            {/* If grouped, show count bubble */}
            {notif.is_group && (notif.group_count || 1) > 1 && (
              <View style={styles.groupBadge}>
                <Text style={styles.groupBadgeText}>{notif.group_count}</Text>
              </View>
            )}
          </View>

          {/* Content */}
          <View style={styles.notifBody}>
            <View style={styles.notifRow1}>
              <Text
                style={[
                  styles.notifTitle,
                  isUnread && styles.notifTitleUnread,
                  isActionNeeded && styles.notifTitleAction,
                ]}
                numberOfLines={1}
              >
                {notif.title}
              </Text>
              <Text style={styles.notifTime}>{timeAgo(notif.created_at, t)}</Text>
            </View>

            {notif.body ? (
              <Text style={styles.notifDesc} numberOfLines={2}>
                {notif.body}
              </Text>
            ) : null}

            {/* Badges row: Action Needed / Expired / Group */}
            {(isActionNeeded || deadlineText || notif.is_group) && (
              <View style={styles.badgeRow}>
                {isActionNeeded && (
                  <View style={styles.actionPill}>
                    <MaterialCommunityIcons name="alert-decagram-outline" size={12} color={COLORS.coral} />
                    <Text style={styles.actionPillText}>{t('notif.actionNeededBadge')}</Text>
                  </View>
                )}
                {deadlineText && (
                  <View style={styles.deadlinePill}>
                    <MaterialCommunityIcons name="clock-outline" size={12} color={COLORS.text2} />
                    <Text style={styles.deadlinePillText}>{deadlineText}</Text>
                  </View>
                )}
                {notif.is_group && (
                  <View style={styles.groupPill}>
                    <MaterialCommunityIcons name="layers-outline" size={12} color={COLORS.text2} />
                    <Text style={styles.groupPillText}>{t('notif.group.viewDetails')}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Contextual CTA for Action Needed */}
            {cta && (
              <View style={styles.ctaRow}>
                <TouchableOpacity
                  style={styles.ctaButton}
                  onPress={() => handleCTA(notif)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={cta.label}
                >
                  <MaterialCommunityIcons name={cta.icon as any} size={15} color={COLORS.white} />
                  <Text style={styles.ctaButtonText}>{cta.label}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Dismiss button affordance */}
          <TouchableOpacity
            style={styles.dismissBtn}
            onPress={() => handleDismiss(notif)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Dismiss notification"
            accessibilityRole="button"
          >
            <MaterialCommunityIcons name="close" size={16} color={COLORS.text2} />
          </TouchableOpacity>
        </TouchableOpacity>
      </View>
    );
  };

  const sectionData = buildSectionData();
  const hasReadItems = notifications.some(n => n.is_read && (!n.action_required || n.action_resolved));

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <ScreenHeader
        title={t('notif.tab.notifications')}
        onBack={() => nav.goBack()}
        right={
          <View style={styles.headerActions}>
            {hasReadItems && (
              <TouchableOpacity
                onPress={() => setShowClearConfirm(true)}
                style={styles.headerBtn}
                accessibilityRole="button"
                accessibilityLabel="Clear read notifications"
              >
                <MaterialCommunityIcons name="broom" size={20} color={COLORS.text2} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => nav.navigate('NotificationsSettings')}
              style={styles.headerBtn}
              accessibilityRole="button"
              accessibilityLabel="Notification settings"
            >
              <MaterialCommunityIcons name="cog-outline" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>
        }
      />

      {/* Offline banner */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <MaterialCommunityIcons name="cloud-off-outline" size={14} color={COLORS.text2} />
          <Text style={styles.offlineBannerText}>Showing cached activity · Pull to refresh</Text>
        </View>
      )}

      {/* Filter Tabs Bar */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {/* All */}
          <TouchableOpacity
            style={[styles.filterPill, activeFilter === 'all' && styles.filterPillActive]}
            onPress={() => handleFilterChange('all')}
            accessibilityRole="button"
            accessibilityLabel={t('notif.filter.all')}
          >
            <Text style={[styles.filterPillText, activeFilter === 'all' && styles.filterPillTextActive]}>
              {t('notif.filter.all')}
            </Text>
          </TouchableOpacity>

          {/* Action Needed */}
          <TouchableOpacity
            style={[styles.filterPill, activeFilter === 'action_needed' && styles.filterPillActive]}
            onPress={() => handleFilterChange('action_needed')}
            accessibilityRole="button"
            accessibilityLabel={t('notif.filter.actionNeeded')}
          >
            <Text
              style={[
                styles.filterPillText,
                activeFilter === 'action_needed' && styles.filterPillTextActive,
              ]}
            >
              {t('notif.filter.actionNeeded')}
            </Text>
            {actionNeededCount > 0 && (
              <View style={styles.actionCountBadge}>
                <Text style={styles.actionCountBadgeText}>{actionNeededCount > 9 ? '9+' : actionNeededCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Social */}
          <TouchableOpacity
            style={[styles.filterPill, activeFilter === 'social' && styles.filterPillActive]}
            onPress={() => handleFilterChange('social')}
            accessibilityRole="button"
            accessibilityLabel={t('notif.filter.social')}
          >
            <Text style={[styles.filterPillText, activeFilter === 'social' && styles.filterPillTextActive]}>
              {t('notif.filter.social')}
            </Text>
          </TouchableOpacity>

          {/* Marketplace */}
          <TouchableOpacity
            style={[styles.filterPill, activeFilter === 'marketplace' && styles.filterPillActive]}
            onPress={() => handleFilterChange('marketplace')}
            accessibilityRole="button"
            accessibilityLabel={t('notif.filter.marketplace')}
          >
            <Text style={[styles.filterPillText, activeFilter === 'marketplace' && styles.filterPillTextActive]}>
              {t('notif.filter.marketplace')}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Main Activity Feed */}
      {loading ? (
        <RowListSkeleton count={7} thumbSize={42} />
      ) : sectionData.length === 0 ? (
        <EmptyState
          icon={
            activeFilter === 'action_needed'
              ? 'check-circle-outline'
              : activeFilter === 'social'
              ? 'account-heart-outline'
              : 'bell-outline'
          }
          title={
            activeFilter === 'action_needed'
              ? t('notif.emptyActionTitle')
              : activeFilter === 'social'
              ? t('notif.emptySocialTitle')
              : activeFilter === 'marketplace'
              ? t('notif.emptyMarketplaceTitle')
              : t('notif.emptyCaughtUpTitle')
          }
          hint={
            activeFilter === 'action_needed'
              ? t('notif.emptyActionSubtitle')
              : activeFilter === 'social'
              ? t('notif.emptySocialSubtitle')
              : activeFilter === 'marketplace'
              ? t('notif.emptyMarketplaceSubtitle')
              : t('notif.emptyCaughtUpSubtitle')
          }
          size={52}
        />
      ) : (
        <FlatList
          data={sectionData}
          renderItem={renderItem}
          keyExtractor={(item, index) =>
            item.isHeader ? `header-${item.sectionLabel}-${index}` : item.item!.id || `${index}`
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.coral} />
          }
        />
      )}

      {/* Undo Dismiss Snackbar */}
      {dismissedItem && (
        <View style={[styles.undoBar, { bottom: insets.bottom + 16 }]}>
          <Text style={styles.undoText}>{t('notif.dismissed')}</Text>
          <TouchableOpacity onPress={handleUndoDismiss} style={styles.undoBtn} accessibilityRole="button">
            <Text style={styles.undoBtnText}>{t('notif.undo')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Group Details Sheet Modal */}
      <Modal
        visible={!!selectedGroup}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedGroup(null)}
      >
        <View style={styles.sheetContainer}>
          <ScreenHeader
            title={selectedGroup?.title || t('notif.group.viewDetails')}
            onBack={() => setSelectedGroup(null)}
          />
          <ScrollView contentContainerStyle={styles.sheetScroll}>
            {selectedGroup?.group_items && selectedGroup.group_items.length > 0 ? (
              selectedGroup.group_items.map((item, idx) => {
                const itemData = item.data || {};
                const sellerId = itemData.sellerId;
                const isSellerMuted = sellerId ? mutedSellers.has(String(sellerId)) : false;

                return (
                  <View key={item.id || idx} style={styles.groupDetailRow}>
                    <View style={styles.groupRowAvatar}>
                      <MaterialCommunityIcons name="account-outline" size={24} color={COLORS.text2} />
                    </View>
                    <View style={styles.groupRowContent}>
                      <Text style={styles.groupRowTitle}>{item.title}</Text>
                      {item.body ? <Text style={styles.groupRowBody}>{item.body}</Text> : null}
                      <Text style={styles.groupRowTime}>{timeAgo(item.created_at, t)}</Text>
                    </View>
                    {sellerId && (
                      <TouchableOpacity
                        style={styles.muteBtn}
                        onPress={() => handleToggleMuteSeller(String(sellerId))}
                        accessibilityRole="button"
                      >
                        <MaterialCommunityIcons
                          name={isSellerMuted ? 'bell-ring-outline' : 'bell-off-outline'}
                          size={16}
                          color={isSellerMuted ? COLORS.coral : COLORS.text2}
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            ) : (
              <EmptyState icon="bell-outline" title={t('notif.emptyNotifications')} size={44} />
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Confirmation Modal for Clear All Read */}
      <Modal
        visible={showClearConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowClearConfirm(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowClearConfirm(false)}>
          <Pressable style={styles.modalBox} onPress={e => e.stopPropagation()}>
            <Text style={styles.modalHeading}>{t('notif.clearConfirmTitle')}</Text>
            <Text style={styles.modalBody}>{t('notif.clearConfirmMessage')}</Text>
            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowClearConfirm(false)}
                accessibilityRole="button"
              >
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleClearRead}
                accessibilityRole="button"
              >
                <Text style={styles.modalConfirmText}>{t('notif.clearConfirmBtn')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBtn: { width: TOUCH.min, height: TOUCH.min, alignItems: 'center', justifyContent: 'center' },

  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    backgroundColor: COLORS.surface2,
  },
  offlineBannerText: { fontSize: 12, color: COLORS.text2, fontWeight: '500' },

  /* Filter bar */
  filterBar: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.bg,
  },
  filterScroll: {
    paddingHorizontal: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterPillActive: {
    backgroundColor: COLORS.coral,
    borderColor: COLORS.coral,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text2,
  },
  filterPillTextActive: {
    color: COLORS.white,
  },
  actionCountBadge: {
    backgroundColor: COLORS.white,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  actionCountBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.coral,
  },

  /* Section header */
  sectionHeader: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text2,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  /* Notification card */
  cardWrapper: {
    position: 'relative',
    overflow: 'hidden',
  },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.bg,
    position: 'relative',
  },
  notifCardUnread: {
    backgroundColor: COLORS.surface,
  },
  notifCardAction: {
    backgroundColor: COLORS.coral + '08',
  },
  notifAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3.5,
  },

  leadingContainer: {
    position: 'relative',
    marginTop: 2,
  },
  notifIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface2,
  },
  productThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: COLORS.surface2,
  },
  groupBadge: {
    position: 'absolute',
    bottom: -3,
    right: -4,
    backgroundColor: COLORS.coral,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: COLORS.surface,
  },
  groupBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.white,
  },

  notifBody: {
    flex: 1,
    minWidth: 0,
  },
  notifRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 3,
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
    flex: 1,
  },
  notifTitleUnread: {
    fontWeight: '700',
  },
  notifTitleAction: {
    fontWeight: '700',
    color: COLORS.text,
  },
  notifTime: {
    fontSize: 11,
    color: COLORS.text2,
    fontWeight: '500',
  },
  notifDesc: {
    fontSize: 13,
    color: COLORS.text2,
    lineHeight: 18,
    marginTop: 1,
  },

  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.coral + '18',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.row,
  },
  actionPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.coral,
  },
  deadlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surface2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.row,
  },
  deadlinePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.text2,
  },
  groupPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surface2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.row,
  },
  groupPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.text2,
  },

  ctaRow: {
    marginTop: 10,
    flexDirection: 'row',
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.coral,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  ctaButtonText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.white,
  },

  dismissBtn: {
    padding: 6,
    marginLeft: 4,
  },

  /* Undo Snackbar */
  undoBar: {
    position: 'absolute',
    left: SPACING.lg,
    right: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.card,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  undoText: { fontSize: 13, color: COLORS.text, fontWeight: '500' },
  undoBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  undoBtnText: { fontSize: 13, color: COLORS.coral, fontWeight: '700' },

  /* Group Sheet */
  sheetContainer: { flex: 1, backgroundColor: COLORS.bg },
  sheetScroll: { padding: SPACING.lg },
  groupDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  groupRowAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupRowContent: { flex: 1 },
  groupRowTitle: { fontSize: 13.5, fontWeight: '600', color: COLORS.text },
  groupRowBody: { fontSize: 12, color: COLORS.text2, marginTop: 1 },
  groupRowTime: { fontSize: 10.5, color: COLORS.text2, marginTop: 2 },
  muteBtn: { padding: 8 },

  /* Clear confirmation modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalBox: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    padding: SPACING.lg,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalHeading: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  modalBody: { fontSize: 13, color: COLORS.text2, lineHeight: 18 },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  modalCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  modalCancelText: { fontSize: 13, fontWeight: '600', color: COLORS.text2 },
  modalConfirmBtn: {
    backgroundColor: COLORS.coral,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  modalConfirmText: { fontSize: 13, fontWeight: '700', color: COLORS.white },
});
