import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Image,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING, RADIUS } from '../theme';
import BackButton from '../components/BackButton';
import EmptyState from '../components/EmptyState';
import { RowListSkeleton } from '../components/Skeleton';
import { getNotifications, markNotificationRead, markAllNotificationsRead, getImageUrl } from '../api';
import { routeNotification } from '../notificationRouting';
import type { Notification } from '../types';
import type { RootStackParamList } from '../navigation';
import { useToast } from '../components/Toast';

type Nav = NativeStackNavigationProp<RootStackParamList>;

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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (force = false) => {
    try {
      const res = await getNotifications() as { notifications: Notification[] };
      setNotifications(res.notifications || []);
    } catch { toast.error('Notifications could not load', 'Check your connection and try again.', () => fetchData(true)); }
    setLoading(false);
  }, []);

  React.useEffect(() => { fetchData(); }, []);

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

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const sections = groupByDay(notifications);

  const renderItem = ({ item }: { item: Notification }) => {
    const { icon, color } = getNotifIcon(item.type);
    const imageData = (item.data as any)?.image;
    return (
      <TouchableOpacity
        style={[styles.row, !item.is_read && styles.rowUnread]}
        onPress={() => handlePress(item)}
        activeOpacity={0.7}
        accessibilityLabel={item.title}
        accessibilityRole="button"
      >
        <View style={[styles.iconWrap, { backgroundColor: color + '18' }]}>
          <MaterialCommunityIcons name={icon as any} size={20} color={color} />
        </View>
        <View style={styles.rowBody}>
          <Text style={[styles.rowTitle, !item.is_read && styles.rowTitleUnread]} numberOfLines={1}>{item.title}</Text>
          {item.body && <Text style={styles.rowBody} numberOfLines={2}>{item.body}</Text>}
          <Text style={styles.rowTime}>{timeAgo(item.created_at)}</Text>
        </View>
        {imageData ? (
          <Image source={{ uri: getImageUrl(imageData) || undefined }} style={styles.rowImage} />
        ) : !item.is_read ? (
          <View style={[styles.rowDot, { backgroundColor: color }]} />
        ) : null}
      </TouchableOpacity>
    );
  };

  const sectionsFlat: { label: string; notif: Notification; isHeader: boolean }[] = [];
  for (const section of sections) {
    sectionsFlat.push({ label: section.label, notif: section.data[0], isHeader: true });
    for (const n of section.data) {
      sectionsFlat.push({ label: '', notif: n, isHeader: false });
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + SPACING.md }]}>
        <BackButton onPress={() => nav.goBack()} />
        <Text style={styles.title}>Notifications</Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={handleMarkAllRead} style={styles.markAllBtn} accessibilityLabel="mark all read" accessibilityRole="button">
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
        {unreadCount === 0 && <View style={{ width: 35 }} />}
      </View>

      {loading ? (
        <RowListSkeleton count={7} thumbSize={40} />
      ) : notifications.length === 0 ? (
        <EmptyState icon="bell-outline" title="No notifications yet" size={56} />
      ) : (
        <FlatList
          data={sectionsFlat}
          renderItem={({ item }) => {
            if (item.isHeader) {
              return (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionHeaderText}>{item.label}</Text>
                </View>
              );
            }
            return renderItem({ item: item.notif });
          }}
          keyExtractor={(item, i) => item.isHeader ? `header-${item.label}` : item.notif.id || `${i}`}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.coral} />}
        />
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
  sectionHeader: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.xs },
  sectionHeaderText: { fontSize: 13, fontWeight: '700', color: COLORS.text2, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rowUnread: { backgroundColor: COLORS.surface },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, fontSize: 13, color: COLORS.text2 },
  rowTitle: { fontSize: 14, fontWeight: '500', color: COLORS.text },
  rowTitleUnread: { fontWeight: '700' },
  rowTime: { fontSize: 11, color: COLORS.text2, marginTop: 4 },
  rowImage: { width: 44, height: 44, borderRadius: RADIUS.row },
  rowDot: { width: 8, height: 8, borderRadius: 4 },
});
