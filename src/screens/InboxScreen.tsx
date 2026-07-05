import React, { useEffect, useState, useCallback } from 'react';
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
import type { Conversation, Notification, User } from '../types';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type InboxTab = 'messages' | 'notifications';

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

export default function InboxScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'Inbox'>>();
  const [activeTab, setActiveTab] = useState<InboxTab>('messages');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [followedSellers, setFollowedSellers] = useState<User[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [convos, notifs, followingRes] = await Promise.all([
        getConversations() as Promise<{ conversations: Conversation[] }>,
        getNotifications() as Promise<{ notifications: Notification[] }>,
        getFollowing() as Promise<{ following: User[] }>,
      ]);
      setConversations(convos.conversations || []);
      setNotifications(notifs.notifications || []);
      setFollowedSellers(followingRes.following || []);
    } catch { Alert.alert(t('common.error'), 'Could not load data.'); }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, []);

  const handleNotificationPress = async (notif: Notification) => {
    if (!notif.is_read) {
      try { await markNotificationRead(notif.id); } catch { /* silent */ }
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
    }
    const data = notif.data as any;
    if (data?.orderId) {
      nav.navigate('OrderDetail', { orderId: data.orderId });
    } else if (data?.conversationId) {
      nav.navigate('Chat', { conversationId: data.conversationId, otherUserName: 'Chat' });
    }
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

    return (
      <TouchableOpacity
        style={styles.convo}
        onPress={() => nav.navigate('Chat', { conversationId: item.id, otherUserName: otherName, otherUserId: (item as any).other_party_id, otherUserAvatar: (item as any).other_party_avatar })}
        accessibilityLabel={`conversation with ${otherName}`}
        accessibilityRole="button"
      >
        <View style={[styles.convoAvatar, { backgroundColor: COLORS.coral }]}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.convoAvatarImg} />
          ) : (
            <Text style={styles.convoAvatarText}>{initial}</Text>
          )}
        </View>
        <View style={styles.convoBody}>
          <Text style={[styles.convoName, hasUnread && styles.convoNameBold]}>{otherName}</Text>
          <Text style={[styles.convoMsg, hasUnread && styles.convoMsgUnread]} numberOfLines={1}>
            {item.last_message?.content || (item as any).last_message || 'No messages yet'}
          </Text>
        </View>
        <View style={styles.convoRight}>
          <Text style={styles.convoTime}>{timeAgo(item.last_message_at || item.created_at)}</Text>
          {hasUnread && <View style={styles.unreadDot} />}
        </View>
      </TouchableOpacity>
    );
  };

  const renderNotification = ({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[styles.notifItem, !item.is_read && styles.notifItemUnread]}
      onPress={() => handleNotificationPress(item)}
      accessibilityLabel={item.title}
      accessibilityRole="button"
    >
      <View style={[styles.notifDot, !item.is_read && styles.notifDotUnread]} />
      <View style={styles.notifInfo}>
        <Text style={styles.notifTitle}>{item.title}</Text>
        {item.body && <Text style={styles.notifBody} numberOfLines={2}>{item.body}</Text>}
        <Text style={styles.notifTime}>{timeAgo(item.created_at)}</Text>
      </View>
    </TouchableOpacity>
  );

  const SellerBubble = ({ seller }: { seller: User }) => {
    const initial = (seller.full_name || '?')[0];
    const avatarUrl = getImageUrl(seller.avatar_url);
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
        <View style={[styles.sellerBubbleRing, { borderColor: COLORS.coral }]}>
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

  const isMessages = activeTab === 'messages';

  const headerForMessages = isMessages ? (
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
            accessibilityRole="text"
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
            {followedSellers.map(seller => (
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
        {(route.params?.returnTab || nav.canGoBack()) && <View style={styles.topBarSpacer} />}
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'messages' && styles.tabActive]}
          onPress={() => setActiveTab('messages')}
          accessibilityLabel="messages"
          accessibilityRole="button"
        >
          <Text style={[styles.tabText, activeTab === 'messages' && styles.tabTextActive]}>Messages</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'notifications' && styles.tabActive]}
          onPress={() => setActiveTab('notifications')}
          accessibilityLabel="notifications"
          accessibilityRole="button"
        >
          <Text style={[styles.tabText, activeTab === 'notifications' && styles.tabTextActive]}>Notifications</Text>
          {unreadNotifCount > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        {activeTab === 'notifications' && unreadNotifCount > 0 && (
          <TouchableOpacity onPress={handleMarkAllRead} style={styles.markAllBtn} accessibilityLabel="mark all read" accessibilityRole="button">
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        key={activeTab}
        data={(isMessages ? filteredConversations : notifications) as any}
        renderItem={(isMessages ? renderConversation : renderNotification) as any}
        keyExtractor={(item: any) => item.id}
        ListHeaderComponent={headerForMessages}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.coral} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={COLORS.coral} style={{ marginTop: 60 }} />
          ) : (
            <EmptyState
              icon={isMessages ? 'message-outline' : 'bell-outline'}
              title={isMessages ? t('inbox.noMessages') : 'No notifications yet'}
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
  topBarSpacer: { width: 35 },
  title: { flex: 1, textAlign: 'center', fontSize: 18, color: COLORS.text, fontWeight: '700' },
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
  convo: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 10 },
  convoAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  convoAvatarImg: { width: 44, height: 44, borderRadius: 22 },
  convoAvatarText: { fontSize: 16, color: COLORS.white, fontWeight: '700' },
  convoBody: { flex: 1 },
  convoName: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  convoNameBold: { fontWeight: '700' },
  convoMsg: { fontSize: 12, color: COLORS.text2, marginTop: 1 },
  convoMsgUnread: { color: COLORS.text, fontWeight: '500' },
  convoRight: { alignItems: 'flex-end', gap: 4 },
  convoTime: { fontSize: 10, color: COLORS.text2 },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#00C853' },
  notifItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  notifItemUnread: { backgroundColor: COLORS.surface },
  notifDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border, marginTop: 5 },
  notifDotUnread: { backgroundColor: '#00C853' },
  notifInfo: { flex: 1 },
  notifTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  notifBody: { fontSize: 12, color: COLORS.text2, marginTop: 2 },
  notifTime: { fontSize: 11, color: COLORS.text2, marginTop: 4 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 100, gap: 8 },
  emptyText: { fontSize: 14, color: COLORS.text2 },
});
