import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert, ActivityIndicator, TextInput, Image, ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING, RADIUS } from '../theme';
import { useTranslation } from '../i18n';
import BackButton from '../components/BackButton';
import EmptyState from '../components/EmptyState';
import { getConversations, getNotifications, markNotificationRead, markAllNotificationsRead, getFollowing, getImageUrl, createConversation } from '../api';
import { routeNotification } from '../notificationRouting';
import type { Conversation, Notification, User } from '../types';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type InboxTab = 'primary' | 'general';

const INBOX_CACHE_TTL = 15_000;
let _inboxCache: { data: any; timestamp: number } | null = null;

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

export default function InboxScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'Inbox'>>();
  const [activeTab, setActiveTab] = useState<InboxTab>('primary');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [followedSellers, setFollowedSellers] = useState<any[]>([]);

  const fetchData = useCallback(async (force = false) => {
    if (!force && _inboxCache && Date.now() - _inboxCache.timestamp < INBOX_CACHE_TTL) {
      const d = _inboxCache.data;
      setConversations(d.conversations);
      setNotifications(d.notifications);
      setFollowedSellers(d.followedSellers);
      setLoading(false);
      return;
    }
    try {
      const [convos, notifs, followingRes] = await Promise.all([
        getConversations() as Promise<{ conversations: Conversation[] }>,
        getNotifications() as Promise<{ notifications: Notification[] }>,
        getFollowing() as Promise<{ following: any[] }>,
      ]);
      const conversations = convos.conversations || [];
      const notifications = notifs.notifications || [];
      const followedSellers = followingRes.following || [];
      setConversations(conversations);
      setNotifications(notifications);
      setFollowedSellers(followedSellers);
      _inboxCache = { timestamp: Date.now(), data: { conversations, notifications, followedSellers } };
    } catch { Alert.alert(t('common.error'), 'Could not load data.'); }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData(true);
    setRefreshing(false);
  }, []);

  const handleNotificationPress = async (notif: Notification) => {
    if (!notif.is_read) {
      try { await markNotificationRead(notif.id); } catch { /* silent */ }
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
    }
    routeNotification(nav, notif.type, notif.data as Record<string, any>);
  };

  const handleMarkAllRead = async () => {
    try { await markAllNotificationsRead(); } catch { /* silent */ }
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const handleBack = () => {
    if (route.params?.returnTab) {
      nav.navigate('Main', { screen: route.params.returnTab });
      return;
    }
    if (nav.canGoBack()) {
      nav.goBack();
      return;
    }
    nav.navigate('Main', { screen: 'FeedTab' });
  };

  const unreadNotifCount = notifications.filter(n => !n.is_read).length;

  const filteredConversations = conversations
    .slice()
    .sort((a, b) => {
      const ta = new Date(b.last_message_at || b.created_at || 0).getTime();
      const tb = new Date(a.last_message_at || a.created_at || 0).getTime();
      return ta - tb;
    })
    .filter(c => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const name = ((c as any).other_party_name || '').toLowerCase();
      const msg = ((c as any).last_message || '').toLowerCase();
      return name.includes(q) || msg.includes(q);
    });

  const renderConversation = ({ item }: { item: Conversation }) => {
    const otherName = (item as any).other_party_name || 'Seller';
    const initial = otherName[0] || '?';
    const hasUnread = (item.unread_count || 0) > 0;
    const avatarUrl = getImageUrl((item as any).other_party_avatar);
    const storeName = (item as any).other_party_store_name;
    const sellerTier = (item as any).other_party_seller_tier;
    const otherUserId = (item as any).other_party_id;

    return (
      <View style={styles.convo}>
        <TouchableOpacity
          style={styles.convoMain}
          onPress={() => nav.navigate('Chat', { conversationId: item.id, otherUserName: otherName, otherUserId, otherUserAvatar: (item as any).other_party_avatar })}
          accessibilityLabel={`conversation with ${otherName}`}
          accessibilityRole="button"
          activeOpacity={0.7}
        >
          <View style={[styles.convoAvatar, { backgroundColor: COLORS.coral }]}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.convoAvatarImg} />
            ) : (
              <Text style={styles.convoAvatarText}>{initial}</Text>
            )}
            {hasUnread && <View style={styles.convoUnreadBadge} />}
          </View>
          <View style={styles.convoBody}>
            <View style={styles.convoNameRow}>
              <Text style={[styles.convoName, hasUnread && styles.convoNameBold]} numberOfLines={1}>{otherName}</Text>
              <Text style={styles.convoTime}>{timeAgo(item.last_message_at || item.created_at)}</Text>
            </View>
            {storeName ? (
              <Text style={styles.convoStore} numberOfLines={1}>{storeName}</Text>
            ) : sellerTier && sellerTier !== 'none' ? (
              <Text style={styles.convoTier} numberOfLines={1}>{sellerTier} seller</Text>
            ) : null}
            <Text style={[styles.convoMsg, hasUnread && styles.convoMsgUnread]} numberOfLines={1}>
              {item.last_message?.content || (item as any).last_message || 'No messages yet'}
            </Text>
          </View>
        </TouchableOpacity>
        {otherUserId && (
          <TouchableOpacity
            style={styles.convoStoreBtn}
            onPress={() => nav.navigate('Storefront', { sellerId: otherUserId })}
            accessibilityLabel={`visit ${otherName}'s store`}
            accessibilityRole="button"
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="storefront-outline" size={18} color={COLORS.coral} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderNotification = ({ item }: { item: Notification }) => {
    const { icon, color } = getNotifIcon(item.type);
    return (
      <TouchableOpacity
        style={[styles.notifItem, !item.is_read && styles.notifItemUnread]}
        onPress={() => handleNotificationPress(item)}
        accessibilityLabel={item.title}
        accessibilityRole="button"
      >
        <View style={[styles.notifIconWrap, { backgroundColor: color + '18' }]}>
          <MaterialCommunityIcons name={icon as any} size={18} color={color} />
        </View>
        <View style={styles.notifInfo}>
          <Text style={[styles.notifTitle, !item.is_read && styles.notifTitleUnread]} numberOfLines={1}>{item.title}</Text>
          {item.body && <Text style={styles.notifBody} numberOfLines={2}>{item.body}</Text>}
          <Text style={styles.notifTime}>{timeAgo(item.created_at)}</Text>
        </View>
        {!item.is_read && <View style={[styles.notifDot, { backgroundColor: color }]} />}
      </TouchableOpacity>
    );
  };

  const SellerBubble = ({ seller }: { seller: any }) => {
    const initial = (seller.full_name || '?')[0];
    const avatarUrl = getImageUrl(seller.avatar_url);
    const hasActivity = seller.has_unread_activity;
    const handlePress = async () => {
      try {
        const existing = conversations.find(c => c.seller_id === seller.id || c.buyer_id === seller.id);
        if (existing) {
          nav.navigate('Chat', { conversationId: existing.id, otherUserName: seller.full_name, otherUserId: seller.id, otherUserAvatar: seller.avatar_url });
          return;
        }
        const res = await createConversation({ sellerId: seller.id }) as { conversationId: string };
        if (res.conversationId) {
          nav.navigate('Chat', { conversationId: res.conversationId, otherUserName: seller.full_name, otherUserId: seller.id, otherUserAvatar: seller.avatar_url });
        }
      } catch {
        Alert.alert('Error', 'Could not start conversation.');
      }
    };
    return (
      <TouchableOpacity style={styles.sellerBubble} onPress={handlePress} accessibilityLabel={`message ${seller.full_name}`} accessibilityRole="button">
        <View style={[styles.sellerBubbleRing, { borderColor: hasActivity ? COLORS.coral : COLORS.border }]}>
          <View style={[styles.sellerBubbleAvatar, { backgroundColor: COLORS.coral }]}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.sellerBubbleImg} />
            ) : (
              <Text style={styles.sellerBubbleText}>{initial}</Text>
            )}
          </View>
        </View>
        <Text style={styles.sellerBubbleName} numberOfLines={1}>
          {seller.store_name || seller.full_name?.split(' ')[0]}
        </Text>
      </TouchableOpacity>
    );
  };

  const isPrimary = activeTab === 'primary';

  const headerForPrimary = isPrimary ? (
    <>
      <View style={styles.searchBarWrap}>
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={18} color={COLORS.text2} />
          <TextInput
            style={styles.searchBarInput}
            placeholder="Search messages..."
            placeholderTextColor={COLORS.text2}
            value={search}
            onChangeText={setSearch}
            accessibilityLabel="search messages"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} accessibilityLabel="clear search" accessibilityRole="button">
              <MaterialCommunityIcons name="close-circle" size={16} color={COLORS.text2} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      {followedSellers.length > 0 && (
        <View style={styles.bubblesSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bubblesRow}>
            {followedSellers.map((seller: any) => (
              <SellerBubble key={seller.id} seller={seller} />
            ))}
          </ScrollView>
        </View>
      )}
    </>
  ) : null;

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + SPACING.md }]}>
        {(route.params?.returnTab || nav.canGoBack()) && (
          <BackButton onPress={handleBack} />
        )}
        <Text style={[styles.title, !(route.params?.returnTab || nav.canGoBack()) && { marginLeft: 35 }]}>{t('inbox.title')}</Text>
        <TouchableOpacity
          style={styles.bellBtn}
          onPress={() => nav.navigate('Notification')}
          accessibilityLabel="view all notifications"
          accessibilityRole="button"
        >
          <MaterialCommunityIcons name="bell-outline" size={22} color={COLORS.text} />
          {unreadNotifCount > 0 && <View style={styles.bellBadge}><Text style={styles.bellBadgeText}>{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</Text></View>}
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'primary' && styles.tabActive]}
          onPress={() => setActiveTab('primary')}
          accessibilityLabel="primary"
          accessibilityRole="button"
        >
          <Text style={[styles.tabText, activeTab === 'primary' && styles.tabTextActive]}>Primary</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'general' && styles.tabActive]}
          onPress={() => setActiveTab('general')}
          accessibilityLabel="general"
          accessibilityRole="button"
        >
          <Text style={[styles.tabText, activeTab === 'general' && styles.tabTextActive]}>General</Text>
          {unreadNotifCount > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        {activeTab === 'general' && unreadNotifCount > 0 && (
          <TouchableOpacity onPress={handleMarkAllRead} style={styles.markAllBtn} accessibilityLabel="mark all read" accessibilityRole="button">
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        key={activeTab}
        data={(isPrimary ? filteredConversations : notifications) as any}
        renderItem={(isPrimary ? renderConversation : renderNotification) as any}
        keyExtractor={(item: any) => item.id}
        ListHeaderComponent={headerForPrimary}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.coral} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={COLORS.coral} style={{ marginTop: 60 }} />
          ) : (
            <EmptyState
              icon={isPrimary ? 'message-outline' : 'bell-outline'}
              title={isPrimary ? t('inbox.noMessages') : 'No notifications yet'}
              size={56}
            />
          )
        }
      />
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
  bellBtn: { position: 'relative', padding: 8, borderRadius: 20 },
  bellBadge: { position: 'absolute', top: 2, right: 2, backgroundColor: COLORS.coral, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  bellBadgeText: { color: COLORS.white, fontSize: 9, fontWeight: '700' },
  tabBar: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border,
    paddingHorizontal: SPACING.md,
  },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.coral },
  tabText: { fontSize: 13, color: COLORS.text2, fontWeight: '500' },
  tabTextActive: { color: COLORS.text, fontWeight: '700' },
  tabBadge: { backgroundColor: COLORS.coral, borderRadius: RADIUS.row, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  tabBadgeText: { color: COLORS.white, fontSize: 10, fontWeight: '700' },
  markAllBtn: { position: 'absolute', right: SPACING.md, top: 12 },
  markAllText: { color: COLORS.blue, fontSize: 12, fontWeight: '500' },
  searchBarWrap: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.pill,
    paddingHorizontal: 12, height: 38,
  },
  searchBarInput: { flex: 1, color: COLORS.text, fontSize: 14, paddingVertical: 0 },
  bubblesSection: { paddingTop: SPACING.sm, paddingBottom: 4 },
  bubblesRow: { paddingHorizontal: SPACING.md, gap: 14 },
  sellerBubble: { alignItems: 'center', width: 64 },
  sellerBubbleRing: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  sellerBubbleAvatar: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sellerBubbleImg: { width: 54, height: 54, borderRadius: 27 },
  sellerBubbleText: { fontSize: 20, color: COLORS.white, fontWeight: '700' },
  sellerBubbleName: { fontSize: 11, color: COLORS.text2, marginTop: 4, textAlign: 'center' },
  convo: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 10 },
  convoMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  convoAvatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  convoAvatarImg: { width: 56, height: 56, borderRadius: 28 },
  convoAvatarText: { fontSize: 20, color: COLORS.white, fontWeight: '700' },
  convoUnreadBadge: { position: 'absolute', top: 0, right: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: '#00C853', borderWidth: 2, borderColor: COLORS.bg },
  convoBody: { flex: 1 },
  convoNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  convoName: { fontSize: 15, color: COLORS.text, fontWeight: '500', flex: 1 },
  convoNameBold: { fontWeight: '700' },
  convoStore: { fontSize: 12, color: COLORS.coral, marginTop: 1 },
  convoTier: { fontSize: 11, color: COLORS.text2, marginTop: 1, textTransform: 'capitalize' },
  convoMsg: { fontSize: 13, color: COLORS.text2, marginTop: 2 },
  convoMsgUnread: { color: COLORS.text, fontWeight: '500' },
  convoTime: { fontSize: 11, color: COLORS.text2 },
  convoStoreBtn: { padding: 8, borderRadius: 20, backgroundColor: COLORS.surface },
  notifItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  notifItemUnread: { backgroundColor: COLORS.surface },
  notifIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  notifInfo: { flex: 1 },
  notifTitle: { fontSize: 14, fontWeight: '500', color: COLORS.text },
  notifTitleUnread: { fontWeight: '700' },
  notifBody: { fontSize: 12, color: COLORS.text2, marginTop: 2 },
  notifTime: { fontSize: 11, color: COLORS.text2, marginTop: 4 },
  notifDot: { width: 8, height: 8, borderRadius: 4 },
});
