import React, { useState, useCallback } from 'react';
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

  const filteredNotifications = notifications.filter(n => !ORDER_NOTIF_TYPES.has(n.type));
  const unreadCount = filteredNotifications.filter(n => !n.is_read).length;
  const allOrders = [...buyOrders, ...sellOrders];
  const activeOrders = allOrders.filter(o => ['pending', 'paid', 'processing', 'shipped'].includes(o.status));
  const allHistoryOrders = allOrders.filter(o => ['completed', 'cancelled'].includes(o.status));
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
    const { icon, color } = getNotifIcon(notif.type);
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
        {!notif.is_read ? <View style={[styles.rowDot, { backgroundColor: color }]} /> : null}
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

    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.orderCard, isHistory && styles.orderCardHistory]}
        onPress={() => nav.navigate('OrderDetail', { orderId: item.id })}
        accessibilityLabel={`order ${item.id.slice(0, 8)}`}
        accessibilityRole="button"
        activeOpacity={0.7}
      >
        <View style={styles.orderCardTop}>
          {productImageUrl ? (
            <Image source={{ uri: productImageUrl }} style={styles.orderImage} />
          ) : (
            <View style={[styles.orderImage, styles.orderImagePlaceholder]}>
              <MaterialCommunityIcons name="package-variant" size={24} color={COLORS.text2} />
            </View>
          )}
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
        {activeTab === 'notifications' && unreadCount > 0 && (
          <TouchableOpacity onPress={handleMarkAllRead} style={styles.markAllBtn} accessibilityLabel="mark all read" accessibilityRole="button">
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
        {activeTab !== 'notifications' || unreadCount === 0 ? (
          <TouchableOpacity onPress={() => setShowHistory(true)} style={styles.historyBtn} accessibilityLabel="order history" accessibilityRole="button">
            <MaterialCommunityIcons name="clock-outline" size={26} color={COLORS.text} />
            {allHistoryOrders.length > 0 && (
              <View style={styles.historyBadge}>
                <Text style={styles.historyBadgeText}>{allHistoryOrders.length > 9 ? '9+' : allHistoryOrders.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        ) : null}
      </View>

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
  markAllBtn: { padding: 8, borderRadius: 20 },
  markAllText: { color: COLORS.blue, fontSize: 12, fontWeight: '500' },
  historyBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  historyBadge: {
    position: 'absolute', top: 2, right: 2,
    backgroundColor: COLORS.coral, borderRadius: 8,
    minWidth: 14, height: 14, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  historyBadgeText: { color: COLORS.white, fontSize: 8, fontWeight: '700' },
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
  rowDot: { width: 8, height: 8, borderRadius: 4 },

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
