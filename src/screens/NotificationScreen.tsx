import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator,
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
import UserAvatar from '../components/UserAvatar';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Tab = 'notifications' | 'orders';

const STATUS_COLORS: Record<string, string> = {
  pending: COLORS.blue,
  paid: COLORS.green,
  processing: COLORS.blue,
  shipped: COLORS.blue,
  delivered: COLORS.green,
  completed: COLORS.green,
  cancelled: COLORS.coral,
};

function getNotifIcon(type: string): { icon: string; color: string } {
  switch (type) {
    case 'new_message': return { icon: 'message-text-outline', color: COLORS.blue };
    case 'order_status':
    case 'payment_confirmed':
    case 'payment_failed':
    case 'order_cancelled': return { icon: 'package-variant', color: '#1D9E75' };
    case 'meetup_proposed':
    case 'meetup_confirmed':
    case 'meetup_expired': return { icon: 'map-marker-outline', color: COLORS.blue };
    case 'review_received': return { icon: 'star-outline', color: '#F5A623' };
    case 'new_follower': return { icon: 'account-plus-outline', color: COLORS.coral };
    case 'new_product_from_followed': return { icon: 'tag-outline', color: '#1D9E75' };
    case 'escrow_refunded':
    case 'payout_failed': return { icon: 'currency-usd', color: COLORS.coral };
    case 'subscription_expired':
    case 'subscription_activated': return { icon: 'crown-outline', color: '#F5A623' };
    case 'verification_approved':
    case 'verification_rejected': return { icon: 'shield-check-outline', color: '#1D9E75' };
    case 'low_stock':
    case 'product_sold_out': return { icon: 'alert-circle-outline', color: COLORS.coral };
    default: return { icon: 'bell-outline', color: COLORS.text2 };
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
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

export default function NotificationScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('notifications');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [buyOrders, setBuyOrders] = useState<Order[]>([]);
  const [sellOrders, setSellOrders] = useState<Order[]>([]);
  const [orderTab, setOrderTab] = useState<'buying' | 'selling'>('buying');

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
    } catch { toast.error('Notifications could not load', 'Check your connection and try again.', () => fetchData(true)); }
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
      try { await markNotificationRead(notif.id); } catch { toast.error('Could not update notification', 'It will remain unread until the next refresh.'); }
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
    }
    routeNotification(nav, notif.type, notif.data as Record<string, any>);
  };

  const handleMarkAllRead = async () => {
    try { await markAllNotificationsRead(); } catch { toast.error('Could not mark notifications read', 'Please try again.', handleMarkAllRead); return; }
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const ORDER_NOTIF_TYPES = new Set(['order_status', 'payment_confirmed', 'payment_failed', 'order_cancelled']);
  const activeOrders = [...buyOrders, ...sellOrders].filter(o => ['pending', 'paid', 'processing', 'shipped'].includes(o.status));
  const filteredNotifications = notifications.filter(n => !ORDER_NOTIF_TYPES.has(n.type));
  const unreadCount = filteredNotifications.filter(n => !n.is_read).length;
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
    const { icon, color } = getNotifIcon(notif.type);
    const imageData = (notif.data as any)?.image;
    return (
      <TouchableOpacity
        style={[styles.row, !notif.is_read && styles.rowUnread]}
        onPress={() => handlePress(notif)}
        activeOpacity={0.7}
        accessibilityLabel={notif.title}
        accessibilityRole="button"
      >
        <View style={[styles.iconWrap, { backgroundColor: color + '18' }]}>
          <MaterialCommunityIcons name={icon as any} size={20} color={color} />
        </View>
        <View style={styles.rowBody}>
          <Text style={[styles.rowTitle, !notif.is_read && styles.rowTitleUnread]} numberOfLines={1}>{notif.title}</Text>
          {notif.body && <Text style={styles.rowBodyText} numberOfLines={2}>{notif.body}</Text>}
          <Text style={styles.rowTime}>{timeAgo(notif.created_at)}</Text>
        </View>
        {imageData ? (
          <View style={styles.rowImageWrap}>
            <View style={[styles.rowImage, { backgroundColor: COLORS.surface2 }]} />
          </View>
        ) : !notif.is_read ? (
          <View style={[styles.rowDot, { backgroundColor: color }]} />
        ) : null}
      </TouchableOpacity>
    );
  };

  const tabs: { key: Tab; icon: string; label: string; badge: number }[] = [
    { key: 'notifications', icon: 'bell-outline', label: 'Notifications', badge: unreadCount },
    { key: 'orders', icon: 'package-variant-closed', label: 'Orders', badge: activeOrders.length },
  ];

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + SPACING.md }]}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={styles.title}>Notifications</Text>
        {activeTab === 'notifications' && unreadCount > 0 && (
          <TouchableOpacity onPress={handleMarkAllRead} style={styles.markAllBtn} accessibilityLabel="mark all read" accessibilityRole="button">
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
        {activeTab !== 'notifications' || unreadCount === 0 ? <View style={{ width: 35 }} /> : null}
      </View>

      <View style={styles.tabBar}>
        {tabs.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, isActive && styles.tabItemActive]}
              onPress={() => setActiveTab(tab.key)}
              accessibilityLabel={tab.label}
              accessibilityRole="button"
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name={tab.icon as any} size={20} color={isActive ? COLORS.coral : COLORS.text2} />
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
              {tab.badge > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{tab.badge > 9 ? '9+' : tab.badge}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {activeTab === 'notifications' ? (
        loading ? (
          <RowListSkeleton count={7} thumbSize={40} />
        ) : notifications.length === 0 ? (
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
          {store.isSeller && (
            <View style={styles.orderTabRow}>
              <TouchableOpacity
                style={[styles.orderTab, orderTab === 'buying' && styles.orderTabActive]}
                onPress={() => setOrderTab('buying')}
                accessibilityLabel="buying orders"
                accessibilityRole="button"
              >
                <Text style={[styles.orderTabText, orderTab === 'buying' && styles.orderTabTextActive]}>Buying</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.orderTab, orderTab === 'selling' && styles.orderTabActive]}
                onPress={() => setOrderTab('selling')}
                accessibilityLabel="selling orders"
                accessibilityRole="button"
              >
                <Text style={[styles.orderTabText, orderTab === 'selling' && styles.orderTabTextActive]}>Selling</Text>
              </TouchableOpacity>
            </View>
          )}
          <FlatList
            data={orderTab === 'buying' ? buyOrders : sellOrders}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: SPACING.md, paddingBottom: insets.bottom + 100 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.coral} />}
            renderItem={({ item }: { item: Order }) => {
              const sc = STATUS_COLORS[item.status] || COLORS.text2;
              return (
                <TouchableOpacity
                  style={styles.orderCard}
                  onPress={() => nav.navigate('OrderDetail', { orderId: item.id })}
                  accessibilityLabel={`order ${item.id.slice(0, 8)}`}
                  accessibilityRole="button"
                  activeOpacity={0.7}
                >
                  <View style={styles.orderCardHeader}>
                    <Text style={styles.orderId}>#{item.id.slice(0, 8)}</Text>
                    <View style={[styles.orderStatusBadge, { backgroundColor: sc + '1A' }]}>
                      <Text style={[styles.orderStatusText, { color: sc }]}>{item.status}</Text>
                    </View>
                  </View>
                  <Text style={styles.orderAmount}>{formatPrice(Number(item.total_amount))} G</Text>
                  <Text style={styles.orderDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              loading ? (
                <RowListSkeleton count={4} thumbSize={48} />
              ) : (
                <EmptyState icon="package-variant" title="No orders yet" size={44} />
              )
            }
          />
        </>
      )}
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
  markAllBtn: { padding: 8, borderRadius: 20 },
  markAllText: { color: COLORS.blue, fontSize: 12, fontWeight: '500' },

  /* Tab bar */
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  tabItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabItemActive: { borderBottomColor: COLORS.coral },
  tabLabel: { fontSize: 14, fontWeight: '500', color: COLORS.text2 },
  tabLabelActive: { color: COLORS.coral, fontWeight: '700' },
  tabBadge: {
    backgroundColor: COLORS.coral, borderRadius: 8,
    minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeText: { color: COLORS.white, fontSize: 9, fontWeight: '700' },

  /* Notifications */
  sectionHeader: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.xs },
  sectionHeaderText: { fontSize: 13, fontWeight: '700', color: COLORS.text2, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rowUnread: { backgroundColor: COLORS.surface },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '500', color: COLORS.text },
  rowTitleUnread: { fontWeight: '700' },
  rowBodyText: { fontSize: 13, color: COLORS.text2, marginTop: 2 },
  rowTime: { fontSize: 11, color: COLORS.text2, marginTop: 4 },
  rowImageWrap: { width: 44, height: 44, borderRadius: RADIUS.row, overflow: 'hidden' },
  rowImage: { width: '100%', height: '100%' },
  rowDot: { width: 8, height: 8, borderRadius: 4 },

  /* Orders */
  orderTabRow: {
    flexDirection: 'row', marginHorizontal: SPACING.md, marginTop: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.card, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
  },
  orderTab: { flex: 1, padding: 10, alignItems: 'center' },
  orderTabActive: { backgroundColor: COLORS.coral },
  orderTabText: { color: COLORS.text2, fontSize: 14, fontWeight: '500' },
  orderTabTextActive: { color: COLORS.white },
  orderCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.media, padding: 14, marginBottom: 8,
  },
  orderCardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  orderId: { fontSize: 12, color: COLORS.text2, fontFamily: 'monospace' },
  orderStatusBadge: { borderRadius: RADIUS.row, paddingHorizontal: 8, paddingVertical: 2 },
  orderStatusText: { fontSize: 12, fontWeight: '600' },
  orderAmount: { fontFamily: 'Syne', fontSize: 16, fontWeight: '700', color: COLORS.coral },
  orderDate: { fontSize: 11, color: COLORS.text2, marginTop: 2 },
});
