import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Modal, Image, Pressable,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING, RADIUS, formatPrice } from '../theme';
import BackButton from '../components/BackButton';
import EmptyState from '../components/EmptyState';
import { RowListSkeleton } from '../components/Skeleton';
import { getNotifications, markNotificationRead, markAllNotificationsRead, getImageUrl, getOrders, getSellerOrders } from '../api';
import { routeNotification } from '../notificationRouting';
import type { Notification, Order } from '../types';
import type { RootStackParamList } from '../navigation';
import { useToast } from '../components/Toast';
import { store } from '../store';
import { useTranslation } from '../i18n';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Tab = 'notifications' | 'buying' | 'selling';

const STATUS_COLORS: Record<string, string> = {
  pending: COLORS.blue,
  paid: COLORS.green,
  processing: COLORS.blue,
  shipped: COLORS.blue,
  delivered: COLORS.green,
  completed: COLORS.green,
  cancelled: COLORS.coral,
};

const STATUS_STEPS = ['pending', 'paid', 'shipped', 'delivered', 'completed'];

function getStatusLabel(status: string): string {
  switch (status) {
    case 'pending': return 'To Pay';
    case 'paid': return 'Paid';
    case 'processing': return 'Processing';
    case 'shipped': return 'Shipped';
    case 'delivered': return 'Delivered';
    case 'completed': return 'Completed';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
}

function getNotifConfig(type: string): { icon: string; color: string; accent: string; bg: string } {
  switch (type) {
    // ── Order & Payment ──
    case 'new_order':
    case 'order_placed': return { icon: 'package-variant', color: COLORS.green, accent: COLORS.green, bg: COLORS.green + '18' };
    case 'escrow_held':
    case 'payment_confirmed':
    case 'order_status': return { icon: 'bank-outline', color: COLORS.blue, accent: COLORS.blue, bg: COLORS.blue + '18' };
    case 'payout_released':
    case 'escrow_released': return { icon: 'check-circle-outline', color: COLORS.green, accent: COLORS.green, bg: COLORS.green + '18' };
    case 'payment_failed':
    case 'order_cancelled': return { icon: 'close-circle-outline', color: COLORS.coral, accent: COLORS.coral, bg: COLORS.coral + '18' };
    case 'order_note':
    case 'note_from_seller': return { icon: 'note-text-outline', color: COLORS.text2, accent: COLORS.text2, bg: COLORS.text2 + '18' };
    case 'dispute_opened': return { icon: 'alert-circle-outline', color: COLORS.coral, accent: COLORS.coral, bg: COLORS.coral + '18' };
    // ── Meetup ──
    case 'meetup_proposed':
    case 'meetup_confirmed': return { icon: 'map-marker-outline', color: COLORS.blue, accent: COLORS.blue, bg: COLORS.blue + '18' };
    case 'meetup_expired': return { icon: 'clock-outline', color: COLORS.text2, accent: COLORS.text2, bg: COLORS.text2 + '18' };
    // ── Chat & Offers ──
    case 'new_message':
    case 'new_offer':
    case 'counter_offer': return { icon: 'message-text-outline', color: COLORS.blue, accent: COLORS.blue, bg: COLORS.blue + '18' };
    case 'offer_accepted': return { icon: 'check-circle-outline', color: COLORS.green, accent: COLORS.green, bg: COLORS.green + '18' };
    // ── Reviews ──
    case 'review_received': return { icon: 'star-outline', color: COLORS.yellow, accent: COLORS.yellow, bg: COLORS.yellow + '18' };
    // ── Social & Product ──
    case 'new_follower': return { icon: 'account-plus-outline', color: COLORS.coral, accent: COLORS.coral, bg: COLORS.coral + '18' };
    case 'new_product_from_followed': return { icon: 'tag-outline', color: COLORS.green, accent: COLORS.green, bg: COLORS.green + '18' };
    case 'low_stock':
    case 'product_sold_out': return { icon: 'alert-circle-outline', color: COLORS.coral, accent: COLORS.coral, bg: COLORS.coral + '18' };
    // ── Escrow / Payout ──
    case 'escrow_refunded':
    case 'payout_failed': return { icon: 'currency-usd', color: COLORS.coral, accent: COLORS.coral, bg: COLORS.coral + '18' };
    // ── Account ──
    case 'subscription_expired': return { icon: 'crown-outline', color: COLORS.yellow, accent: COLORS.yellow, bg: COLORS.yellow + '18' };
    case 'subscription_activated': return { icon: 'crown-outline', color: COLORS.green, accent: COLORS.green, bg: COLORS.green + '18' };
    case 'verification_approved':
    case 'verified': return { icon: 'shield-check-outline', color: COLORS.green, accent: COLORS.green, bg: COLORS.green + '18' };
    case 'verification_rejected': return { icon: 'shield-remove-outline', color: COLORS.coral, accent: COLORS.coral, bg: COLORS.coral + '18' };
    default: return { icon: 'bell-outline', color: COLORS.text2, accent: COLORS.text2, bg: COLORS.text2 + '18' };
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('fr-HT', { day: 'numeric', month: 'short' });
}

function groupByDay(notifs: Notification[]): { label: string; data: Notification[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: Record<string, Notification[]> = {};
  for (const n of notifs) {
    const d = new Date(n.created_at);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    let label: string;
    if (dayStart.getTime() === today.getTime()) label = 'Today';
    else if (dayStart.getTime() === yesterday.getTime()) label = 'Yesterday';
    else if (dayStart.getTime() < weekAgo.getTime()) {
      label = d.toLocaleDateString('fr-HT', { day: 'numeric', month: 'long', year: 'numeric' });
    } else {
      label = d.toLocaleDateString('fr-HT', { weekday: 'long', day: 'numeric', month: 'long' });
    }
    if (!groups[label]) groups[label] = [];
    groups[label].push(n);
  }
  return Object.entries(groups).map(([label, data]) => ({ label, data }));
}

const ORDER_NOTIF_TYPES = new Set(['order_status', 'payment_confirmed', 'payment_failed', 'order_cancelled']);

const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Newest first' },
  { value: 'date_asc', label: 'Oldest first' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'name_asc', label: 'Name: A-Z' },
  { value: 'name_desc', label: 'Name: Z-A' },
];

export default function NotificationScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('notifications');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [buyOrders, setBuyOrders] = useState<Order[]>([]);
  const [sellOrders, setSellOrders] = useState<Order[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'completed' | 'cancelled'>('all');
  const [sortModal, setSortModal] = useState(false);
  const [sortBy, setSortBy] = useState('date_desc');
  const viewedOrdersRef = useRef<Set<string>>(new Set());

  // Per-user key for viewed orders (prevents cross-account bleed)
  const viewedKey = `viewed_orders_${store.user?.id || 'anon'}`;

  // Load viewed orders from AsyncStorage (namespaced per user)
  useEffect(() => {
    (async () => {
      // Reset on mount to avoid stale data from previous user
      viewedOrdersRef.current = new Set();
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const raw = await AsyncStorage.getItem(viewedKey);
        if (raw) viewedOrdersRef.current = new Set(JSON.parse(raw));
      } catch {}
    })();
  }, [viewedKey]);

  const markOrderViewed = useCallback(async (orderId: string) => {
    viewedOrdersRef.current.add(orderId);
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await AsyncStorage.setItem(viewedKey, JSON.stringify([...viewedOrdersRef.current]));
    } catch {}
  }, [viewedKey]);

  const fetchData = useCallback(async (force = false) => {
    try {
      const [notifResult, buyOrdersResult, sellOrdersResult] = await Promise.allSettled([
        getNotifications() as Promise<{ notifications: Notification[] }>,
        getOrders() as Promise<{ buyerOrders: Order[] }>,
        store.isSeller ? getSellerOrders() as Promise<{ orders: Order[] }> : Promise.resolve({ orders: [] }),
      ]);
      const notifs = notifResult.status === 'fulfilled' ? notifResult.value.notifications || [] : [];
      const buy = buyOrdersResult.status === 'fulfilled' ? buyOrdersResult.value.buyerOrders || [] : [];
      const sell = sellOrdersResult.status === 'fulfilled' ? sellOrdersResult.value.orders || [] : [];
      setNotifications(notifs);
      setBuyOrders(buy);
      setSellOrders(sell);
    } catch { toast.error(t('feedback.notificationsLoadFailed'), t('feedback.connectionRetry'), () => fetchData(true)); }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(true); }, []));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData(true);
    setRefreshing(false);
  }, []);

  const handlePress = async (notif: Notification) => {
    if (!notif.is_read) {
      try { await markNotificationRead(notif.id); } catch { toast.error(t('feedback.notificationUpdateFailed'), t('feedback.connectionRetry')); }
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
    }
    routeNotification(nav, notif.type, notif.data as Record<string, any>);
  };

  const handleMarkAllRead = async () => {
    try { await markAllNotificationsRead(); } catch { toast.error(t('feedback.markNotificationsFailed'), t('common.tryAgain'), handleMarkAllRead); return; }
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const filteredNotifications = notifications.filter(n => !ORDER_NOTIF_TYPES.has(n.type));
  const unreadCount = filteredNotifications.filter(n => !n.is_read).length;
  const allOrders = [...buyOrders, ...sellOrders];
  const activeOrders = allOrders.filter(o => ['pending', 'paid', 'processing', 'shipped', 'delivered'].includes(o.status));
  const allHistoryOrders = allOrders.filter(o => ['completed', 'cancelled'].includes(o.status));

  const markAllOrdersViewed = useCallback(async () => {
    allOrders.forEach(o => viewedOrdersRef.current.add(o.id));
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await AsyncStorage.setItem(viewedKey, JSON.stringify([...viewedOrdersRef.current]));
    } catch {}
  }, [allOrders, viewedKey]);
  const historyOrders = (() => {
    let filtered = allOrders.filter(o => {
      if (historyFilter === 'completed') return o.status === 'completed';
      if (historyFilter === 'cancelled') return o.status === 'cancelled';
      return ['completed', 'cancelled'].includes(o.status);
    });
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date_asc': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'date_desc': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'price_asc': return Number(a.total_amount) - Number(b.total_amount);
        case 'price_desc': return Number(b.total_amount) - Number(a.total_amount);
        case 'name_asc': return (a.first_product_name || '').localeCompare(b.first_product_name || '');
        case 'name_desc': return (b.first_product_name || '').localeCompare(a.first_product_name || '');
        default: return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
    return filtered;
  })();

  const sections = groupByDay(filteredNotifications);
  const sectionsFlat: { label: string; notif: Notification; isHeader: boolean }[] = [];
  for (const section of sections) {
    sectionsFlat.push({ label: section.label, notif: section.data[0], isHeader: true });
    for (const n of section.data) {
      sectionsFlat.push({ label: '', notif: n, isHeader: false });
    }
  }

  const renderNotifItem = ({ item }: { item: { label: string; notif: Notification; isHeader: boolean } }) => {
    if (item.isHeader) {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>{item.label}</Text>
        </View>
      );
    }
    const notif = item.notif;
    const config = getNotifConfig(notif.type);
    const data = (notif.data || {}) as Record<string, any>;

    // Extract price from body or data
    const priceMatch = notif.body?.match(/G\s?([\d,]+)/);
    const price = priceMatch ? priceMatch[1] : null;
    const productName = data.productName || notif.body?.match(/"(.+?)"/)?.[1] || null;

    // Action buttons based on type
    const getActions = () => {
      switch (notif.type) {
        case 'new_order':
          return [
            { label: 'Ship now', color: COLORS.green, primary: true, onPress: () => data.orderId && nav.navigate('OrderDetail', { orderId: data.orderId }) }];
        case 'payment_failed':
          return [
            { label: 'Retry payment', color: COLORS.coral, primary: true, onPress: () => data.orderId && nav.navigate('OrderDetail', { orderId: data.orderId }) }];
        case 'dispute_opened':
          return [
            { label: 'Respond', color: COLORS.coral, primary: true, onPress: () => data.orderId && nav.navigate('OrderDetail', { orderId: data.orderId }) },
            { label: 'View order', color: COLORS.text2, primary: false, onPress: () => data.orderId && nav.navigate('OrderDetail', { orderId: data.orderId }) }];
        case 'meetup_proposed':
          return [
            { label: 'Confirm', color: COLORS.blue, primary: true, onPress: () => data.orderId && nav.navigate('Meetup', { orderId: data.orderId }) },
            { label: 'Propose new spot', color: COLORS.text2, primary: false, onPress: () => data.orderId && nav.navigate('Meetup', { orderId: data.orderId }) }];
        case 'new_offer':
        case 'counter_offer':
          return [
            { label: 'Accept', color: COLORS.green, primary: true, onPress: () => data.conversationId && nav.navigate('Chat', { conversationId: data.conversationId, otherUserName: data.senderName || 'Chat', otherUserId: data.senderId }) },
            { label: 'Counter', color: COLORS.text2, primary: false, onPress: () => data.conversationId && nav.navigate('Chat', { conversationId: data.conversationId, otherUserName: data.senderName || 'Chat', otherUserId: data.senderId }) }];
        case 'offer_accepted':
          return [
            { label: 'Checkout', color: COLORS.green, primary: true, onPress: () => nav.navigate('Cart') }];
        case 'subscription_expired':
          return [
            { label: 'Renew now', color: COLORS.yellow, primary: true, onPress: () => nav.navigate('BusinessSubscription') }];
        case 'verification_rejected':
          return [
            { label: 'Resubmit ID', color: COLORS.text2, primary: false, onPress: () => nav.navigate('Verification') }];
        case 'low_stock':
        case 'product_sold_out':
          return [
            { label: 'Edit listing', color: COLORS.coral, primary: true, onPress: () => data.productId && nav.navigate('EditListing', { productId: data.productId }) }];
        default:
          return [];
      }
    };

    const actions = getActions();
    const isUnread = !notif.is_read;

    return (
      <TouchableOpacity
        style={[styles.notifCard, isUnread && styles.notifCardUnread]}
        onPress={() => handlePress(notif)}
        activeOpacity={0.7}
        accessibilityLabel={notif.title}
        accessibilityRole="button"
      >
        {/* Unread accent bar */}
        {isUnread && <View style={[styles.notifAccent, { backgroundColor: config.accent }]} />}

        {/* Icon */}
        <View style={[styles.notifIcon, { backgroundColor: config.bg }]}>
          <MaterialCommunityIcons name={config.icon as any} size={18} color={config.color} />
        </View>

        {/* Body */}
        <View style={styles.notifBody}>
          <View style={styles.notifRow1}>
            <Text style={[styles.notifTitle, isUnread && styles.notifTitleUnread]} numberOfLines={1}>{notif.title}</Text>
            <Text style={styles.notifTime}>{timeAgo(notif.created_at)}</Text>
          </View>
          {notif.body && <Text style={styles.notifDesc} numberOfLines={2}>{notif.body}</Text>}
          {price && (
            <View style={styles.notifPriceRow}>
              <Text style={[styles.notifPrice, { color: config.color }]}>G {price}</Text>
            </View>
          )}
          {notif.type === 'escrow_held' && (
            <View style={styles.notifBarTrack}>
              <View style={[styles.notifBarFill, { width: '33%', backgroundColor: config.color }]} />
            </View>
          )}
          {actions.length > 0 && (
            <View style={styles.notifBtnRow}>
              {actions.map((a, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.notifBtn, a.primary ? { backgroundColor: a.color } : styles.notifBtnGhost]}
                  onPress={a.onPress}
                  accessibilityRole="button"
                  accessibilityLabel={a.label}
                >
                  <Text style={[styles.notifBtnText, a.primary && { color: a.primary ? '#fff' : COLORS.text }]}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Unread dot */}
        {isUnread && <View style={[styles.notifDot, { backgroundColor: config.accent }]} />}
      </TouchableOpacity>
    );
  };

  const renderOrderCard = (item: Order, role: 'buying' | 'selling') => {
    const sc = STATUS_COLORS[item.status] || COLORS.text2;
    const currentStep = STATUS_STEPS.indexOf(item.status);
    const isCancelled = item.status === 'cancelled';
    const isHistory = ['completed', 'cancelled'].includes(item.status);
    const productImageUrl = item.product_image ? getImageUrl(item.product_image) : null;
    const itemName = item.first_product_name || 'Order';
    const itemCount = item.item_count || 1;
    const isMeetup = item.delivery_method === 'meetup';
    const otherName = role === 'buying'
      ? (item as any).seller_name || 'Seller'
      : (item as any).buyer_name || 'Buyer';
    const isUnread = !viewedOrdersRef.current.has(item.id);

    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.orderCard, isHistory && styles.orderCardHistory]}
        onPress={() => { markOrderViewed(item.id); nav.navigate('OrderDetail', { orderId: item.id }); }}
        accessibilityLabel={`order ${item.id.slice(0, 8)}`}
        accessibilityRole="button"
        activeOpacity={0.7}
      >
        <View style={styles.orderCardTop}>
          <View>
            {productImageUrl ? (
              <Image source={{ uri: productImageUrl }} style={styles.orderImage} />
            ) : (
              <View style={[styles.orderImage, styles.orderImagePlaceholder]}>
                <MaterialCommunityIcons name="package-variant" size={24} color={COLORS.text2} />
              </View>
            )}
            {isUnread && (
              <View style={styles.orderDot} />
            )}
          </View>
          <View style={styles.orderDetails}>
            <Text style={styles.orderProductName} numberOfLines={1}>{itemName}</Text>
            {itemCount > 1 && (
              <Text style={styles.orderItemCount}>+{itemCount - 1} more item{itemCount > 2 ? 's' : ''}</Text>
            )}
            <View style={styles.orderMeta}>
              <MaterialCommunityIcons
                name={isMeetup ? 'map-marker-outline' : 'truck-delivery-outline'}
                size={13}
                color={COLORS.text2}
              />
              <Text style={styles.orderMetaText}>{otherName}</Text>
            </View>
          </View>
          <View style={styles.orderPriceCol}>
            <Text style={styles.orderAmount}>{formatPrice(Number(item.total_amount))} G</Text>
            <Text style={styles.orderDate}>{timeAgo(item.created_at)}</Text>
          </View>
        </View>
        <View style={styles.orderCardBottom}>
          {isCancelled ? (
            <View style={[styles.orderStatusPill, { backgroundColor: COLORS.coral + '18' }]}>
              <MaterialCommunityIcons name="close-circle-outline" size={13} color={COLORS.coral} />
              <Text style={[styles.orderStatusPillText, { color: COLORS.coral }]}>Cancelled</Text>
            </View>
          ) : isHistory ? (
            <View style={[styles.orderStatusPill, { backgroundColor: COLORS.green + '18' }]}>
              <MaterialCommunityIcons name="check-circle-outline" size={13} color={COLORS.green} />
              <Text style={[styles.orderStatusPillText, { color: COLORS.green }]}>Completed</Text>
            </View>
          ) : (
            <View style={styles.orderStepper}>
              {STATUS_STEPS.map((step, i) => {
                const isActive = i <= currentStep;
                const isCurrent = i === currentStep;
                return (
                  <React.Fragment key={step}>
                    <View style={[
                      styles.stepDot,
                      isActive && { backgroundColor: sc },
                      isCurrent && styles.stepDotCurrent,
                    ]} />
                    {i < STATUS_STEPS.length - 1 && (
                      <View style={[
                        styles.stepLine,
                        i < currentStep && { backgroundColor: sc },
                      ]} />
                    )}
                  </React.Fragment>
                );
              })}
            </View>
          )}
          <Text style={styles.orderId}>#{item.id.slice(0, 8)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const bottomTabs: { key: Tab; icon: string; label: string; badge: number }[] = [
    { key: 'notifications', icon: 'bell-outline', label: 'Notifications', badge: unreadCount },
    { key: 'buying', icon: 'shopping-outline', label: 'Buying', badge: activeOrders.filter(o => (o as any).my_role === 'buyer').length },
    { key: 'selling', icon: 'store-outline', label: 'Selling', badge: activeOrders.filter(o => (o as any).my_role === 'seller').length },
  ];

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + SPACING.md }]}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={styles.title}>
          {activeTab === 'notifications' ? 'Notifications' : activeTab === 'buying' ? 'Buying' : 'Selling'}
        </Text>
        <TouchableOpacity onPress={() => setShowHistory(true)} style={styles.historyBtn} accessibilityLabel="order history" accessibilityRole="button">
          <MaterialCommunityIcons name="clock-outline" size={26} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      {/* Mark all read row */}
      {activeTab === 'notifications' && unreadCount > 0 && (
        <View style={styles.markAllRow}>
          <TouchableOpacity onPress={handleMarkAllRead} style={styles.markAllBtn} accessibilityLabel="mark all read" accessibilityRole="button">
            <MaterialCommunityIcons name="check-all" size={14} color={COLORS.blue} />
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        </View>
      )}
      {(activeTab === 'buying' || activeTab === 'selling') && (
        <View style={styles.markAllRow}>
          <TouchableOpacity onPress={markAllOrdersViewed} style={styles.markAllBtn} accessibilityLabel="mark all read" accessibilityRole="button">
            <MaterialCommunityIcons name="check-all" size={14} color={COLORS.blue} />
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Content */}
      {activeTab === 'notifications' ? (
        loading ? (
          <RowListSkeleton count={7} thumbSize={40} />
        ) : filteredNotifications.length === 0 ? (
          <EmptyState icon="bell-outline" title="No notifications yet" size={56} />
        ) : (
          <FlatList
            data={sectionsFlat}
            renderItem={renderNotifItem}
            keyExtractor={(item, i) => item.isHeader ? `header-${item.label}` : item.notif.id || `${i}`}
            contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.coral} />}
          />
        )
      ) : (
        <>
          <FlatList
            data={activeOrders.filter(o => activeTab === 'buying' ? (o as any).my_role === 'buyer' : (o as any).my_role === 'seller')}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: SPACING.md, paddingBottom: insets.bottom + 80 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.coral} />}
            renderItem={({ item }) => renderOrderCard(item, activeTab)}
            ListEmptyComponent={
              loading ? (
                <RowListSkeleton count={4} thumbSize={48} />
              ) : (
                <EmptyState
                  icon={activeTab === 'buying' ? 'shopping-outline' : 'store-outline'}
                  title={activeTab === 'buying' ? 'No orders to fulfill' : 'No orders from buyers'}
                  size={44}
                />
              )
            }
          />
        </>
      )}

      {/* Bottom nav */}
      <View style={[styles.bottomNav, { paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 12 }]}>
        {bottomTabs.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.bottomNavItem}
              onPress={() => setActiveTab(tab.key)}
              accessibilityLabel={tab.label}
              accessibilityRole="button"
              activeOpacity={0.7}
            >
              <View style={styles.bottomNavIconWrap}>
                <MaterialCommunityIcons name={tab.icon as any} size={24} color={isActive ? COLORS.coral : COLORS.text2} />
                {tab.badge > 0 && (
                  <View style={styles.bottomNavBadge}>
                    <Text style={styles.bottomNavBadgeText}>{tab.badge > 9 ? '9+' : tab.badge}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.bottomNavLabel, isActive && styles.bottomNavLabelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* History modal */}
      <Modal visible={showHistory} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowHistory(false)}>
        <View style={styles.container}>
          <View style={[styles.topBar, { paddingTop: insets.top + SPACING.md }]}>
            <BackButton onPress={() => setShowHistory(false)} />
            <Text style={styles.title}>Order History</Text>
            <TouchableOpacity
              onPress={() => setSortModal(true)}
              style={styles.historyFilterBtn}
              accessibilityLabel="sort and filter"
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="tune-variant" size={30} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          {historyOrders.length === 0 ? (
            <EmptyState icon="clock-outline" title="No order history yet" size={56} />
          ) : (
            <FlatList
              data={historyOrders}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: SPACING.md, paddingBottom: insets.bottom + 40 }}
              renderItem={({ item }) => renderOrderCard(item, (item as any).my_role === 'buyer' ? 'buying' : 'selling')}
            />
          )}
        </View>
      </Modal>

      {/* Sort / Filter modal */}
      <Modal visible={sortModal} transparent animationType="fade" onRequestClose={() => setSortModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setSortModal(false)}>
          <Pressable style={styles.modalContent} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sort by</Text>
              <TouchableOpacity onPress={() => setSortModal(false)} accessibilityRole="button" accessibilityLabel="close">
                <MaterialCommunityIcons name="close" size={18} color={COLORS.text2} />
              </TouchableOpacity>
            </View>
            {SORT_OPTIONS.map(option => (
              <TouchableOpacity
                key={option.value}
                style={[styles.modalItem, sortBy === option.value && styles.modalItemActive]}
                onPress={() => { setSortBy(option.value); setSortModal(false); }}
                accessibilityRole="button"
              >
                <MaterialCommunityIcons
                  name={sortBy === option.value ? 'radiobox-marked' : 'radiobox-blank'}
                  size={18}
                  color={sortBy === option.value ? COLORS.coral : COLORS.text2}
                />
                <Text style={[styles.modalItemText, sortBy === option.value && styles.modalItemTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
            <View style={styles.modalDivider} />
            <Text style={[styles.modalTitle, { marginBottom: 6 }]}>Status</Text>
            {(['all', 'completed', 'cancelled'] as const).map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.modalItem, historyFilter === f && styles.modalItemActive]}
                onPress={() => { setHistoryFilter(f); setSortModal(false); }}
                accessibilityRole="button"
              >
                <MaterialCommunityIcons
                  name={historyFilter === f ? 'radiobox-marked' : 'radiobox-blank'}
                  size={18}
                  color={historyFilter === f ? COLORS.coral : COLORS.text2}
                />
                <Text style={[styles.modalItemText, historyFilter === f && styles.modalItemTextActive]}>
                  {f === 'all' ? 'All' : f === 'completed' ? 'Completed' : 'Cancelled'}
                </Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    padding: SPACING.md, paddingBottom: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  title: { flex: 1, textAlign: 'center', fontSize: 18, color: COLORS.text, fontWeight: '700' },
  markAllRow: {
    flexDirection: 'row', justifyContent: 'flex-end',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  markAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, backgroundColor: COLORS.blue + '15' },
  markAllText: { color: COLORS.blue, fontSize: 12, fontWeight: '600' },
  historyBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  historyFilterBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  /* Sort modal (Explore style) */
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalContent: {
    width: 240, backgroundColor: COLORS.surface, borderRadius: RADIUS.card, padding: 10, gap: 2, overflow: 'hidden',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, marginLeft: 4 },
  modalTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  modalItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: 8, borderRadius: 6,
  },
  modalItemActive: { backgroundColor: COLORS.surface2 },
  modalItemText: { fontSize: 12, color: COLORS.text2, fontWeight: '500' },
  modalItemTextActive: { color: COLORS.text, fontWeight: '700' },
  modalDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 6 },

  /* Bottom nav */
  bottomNav: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border,
    paddingTop: 8,
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 8,
  },
  bottomNavItem: { alignItems: 'center', justifyContent: 'center', flex: 1, paddingVertical: 2 },
  bottomNavIconWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  bottomNavBadge: {
    position: 'absolute', top: -4, right: -10,
    backgroundColor: COLORS.coral, borderRadius: 8,
    minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  bottomNavBadgeText: { color: COLORS.white, fontSize: 9, fontWeight: '700' },
  bottomNavLabel: { fontSize: 10, color: COLORS.text2, marginTop: 2, fontWeight: '500' },
  bottomNavLabelActive: { color: COLORS.coral, fontWeight: '700' },

  /* Notifications — redesigned cards */
  sectionHeader: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.xs },
  sectionHeaderText: { fontSize: 13, fontWeight: '700', color: COLORS.text2, textTransform: 'uppercase', letterSpacing: 0.5 },
  notifCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 11,
    paddingVertical: 13, paddingLeft: 14, paddingRight: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    position: 'relative', overflow: 'hidden',
  },
  notifCardUnread: { backgroundColor: COLORS.surface },
  notifAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  notifIcon: {
    width: 38, height: 38, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', flex: 'none' as any,
  },
  notifBody: { flex: 1, minWidth: 0 },
  notifRow1: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  notifTitle: { fontSize: 13.5, fontWeight: '500', color: COLORS.text, flex: 1 },
  notifTitleUnread: { fontWeight: '700' },
  notifTime: { fontSize: 10.5, color: COLORS.text2, flex: 'none' as any, fontWeight: '500' },
  notifDesc: { fontSize: 12.5, color: COLORS.text2, lineHeight: 18, margin: 0 },
  notifPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 },
  notifPrice: { fontFamily: 'Syne', fontWeight: '800', fontSize: 14 },
  notifBarTrack: { height: 5, borderRadius: 3, backgroundColor: COLORS.surface2, overflow: 'hidden', marginTop: 6 },
  notifBarFill: { height: '100%' as any, borderRadius: 3 },
  notifBtnRow: { flexDirection: 'row', gap: 8, marginTop: 9 },
  notifBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9 },
  notifBtnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.border },
  notifBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.text2 },
  notifDot: { width: 6, height: 6, borderRadius: 3, flex: 'none' as any, marginTop: 5 },

  /* Orders */
  orderCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.card, padding: 14, marginBottom: 10,
  },
  orderCardHistory: { opacity: 0.7 },
  orderCardTop: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  orderImage: {
    width: 52, height: 52, borderRadius: RADIUS.row, backgroundColor: COLORS.surface2,
  },
  orderImagePlaceholder: {
    alignItems: 'center', justifyContent: 'center',
  },
  orderDot: {
    position: 'absolute', top: -2, right: -2,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: COLORS.coral,
    borderWidth: 2, borderColor: COLORS.surface,
  },
  orderDetails: {
    flex: 1, gap: 2,
  },
  orderProductName: {
    fontSize: 15, fontWeight: '600', color: COLORS.text, lineHeight: 20,
  },
  orderItemCount: {
    fontSize: 12, color: COLORS.text2,
  },
  orderMeta: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2,
  },
  orderMetaText: {
    fontSize: 12, color: COLORS.text2,
  },
  orderPriceCol: {
    alignItems: 'flex-end', gap: 2,
  },
  orderAmount: {
    fontFamily: 'Syne', fontSize: 16, fontWeight: '700', color: COLORS.coral,
  },
  orderDate: {
    fontSize: 11, color: COLORS.text2,
  },
  orderCardBottom: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  orderStatusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.row,
  },
  orderStatusPillText: {
    fontSize: 12, fontWeight: '600',
  },
  orderStepper: {
    flexDirection: 'row', alignItems: 'center', flex: 1,
  },
  stepDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border,
  },
  stepDotCurrent: {
    width: 10, height: 10, borderRadius: 5,
    borderWidth: 2, borderColor: COLORS.surface,
  },
  stepLine: {
    flex: 1, height: 2, backgroundColor: COLORS.border, marginHorizontal: 2,
  },
  orderId: {
    fontSize: 11, color: COLORS.text2, fontFamily: 'monospace',
  },
});
