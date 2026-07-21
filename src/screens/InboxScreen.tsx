import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert, ActivityIndicator, TextInput, Image, ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Icon } from '../components/icons/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING, RADIUS } from '../theme';
import { useTranslation } from '../i18n';
import BackButton from '../components/BackButton';
import EmptyState from '../components/EmptyState';
import { RowListSkeleton } from '../components/Skeleton';
import { getConversations, getNotifications, getFollowing, getImageUrl, createConversation } from '../api';
import { useToast } from '../components/Toast';
import type { Conversation } from '../types';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type InboxTab = 'all' | 'primary' | 'general';

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

export default function InboxScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'Inbox'>>();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<InboxTab>('all');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [followedSellers, setFollowedSellers] = useState<any[]>([]);

  const followedIds = new Set(followedSellers.map((s: any) => s.seller_id));

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
      const [convoResult, notifResult, followingResult] = await Promise.allSettled([
        getConversations() as Promise<{ conversations: Conversation[] }>,
        getNotifications() as Promise<{ notifications: any[] }>,
        getFollowing() as Promise<{ following: any[] }>,
      ]);
      if (convoResult.status !== 'fulfilled') throw convoResult.reason;
      const conversations = convoResult.value.conversations || [];
      const notifications = notifResult.status === 'fulfilled' ? notifResult.value.notifications || [] : [];
      const followedSellers = followingResult.status === 'fulfilled' ? followingResult.value.following || [] : [];
      setConversations(conversations);
      setNotifications(notifications);
      setFollowedSellers(followedSellers);
      _inboxCache = { timestamp: Date.now(), data: { conversations, notifications, followedSellers } };
    } catch {
      toast.error('Inbox could not refresh', 'Your conversations are still available when the connection returns.', () => fetchData(true));
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData(true);
    setRefreshing(false);
  }, []);

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

  const unreadNotifCount = notifications.filter((n: any) => !n.is_read).length;

  const sortedConversations = conversations
    .slice()
    .sort((a, b) => {
      const ta = new Date(a.last_message_at || a.created_at || 0).getTime();
      const tb = new Date(b.last_message_at || b.created_at || 0).getTime();
      return tb - ta;
    });

  const filteredConversations = sortedConversations
    .filter(c => {
      const otherId = (c as any).other_party_id;
      if (activeTab === 'all') return true;
      if (activeTab === 'primary') return otherId && followedIds.has(otherId);
      if (activeTab === 'general') return otherId && !followedIds.has(otherId);
      return true;
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
            <Icon name="storefront" size={18} color={COLORS.coral} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const SellerBubble = ({ seller }: { seller: any }) => {
    const initial = (seller.full_name || '?')[0];
    const avatarUrl = getImageUrl(seller.avatar_url);
    const hasActivity = seller.has_unread_activity;
    const handlePress = async () => {
      try {
        const existing = conversations.find(c => c.seller_id === seller.seller_id || c.buyer_id === seller.seller_id);
        if (existing) {
          nav.navigate('Chat', { conversationId: existing.id, otherUserName: seller.full_name, otherUserId: seller.seller_id, otherUserAvatar: seller.avatar_url });
          return;
        }
        const res = await createConversation({ sellerId: seller.seller_id }) as { conversationId: string };
        if (res.conversationId) {
          nav.navigate('Chat', { conversationId: res.conversationId, otherUserName: seller.full_name, otherUserId: seller.seller_id, otherUserAvatar: seller.avatar_url });
        }
      } catch {
        toast.error('Could not start a conversation', 'Please check your connection and try again.', handlePress);
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

  const listHeader = (
    <>
      {/* Search bar */}
      <View style={styles.searchBarWrap}>
        <View style={styles.searchBar}>
          <Icon name="search" size={18} color={COLORS.text2} />
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
              <Icon name="close-circle" size={16} color={COLORS.text2} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter row: All | Primary | General */}
      <View style={styles.filterRow}>
        <View style={styles.filterTabs}>
          <TouchableOpacity
            style={[styles.filterTab, activeTab === 'all' && styles.filterTabActive]}
            onPress={() => setActiveTab('all')}
            accessibilityLabel="all conversations"
            accessibilityRole="button"
          >
            <Text style={[styles.filterTabText, activeTab === 'all' && styles.filterTabTextActive]}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, activeTab === 'primary' && styles.filterTabActive]}
            onPress={() => setActiveTab('primary')}
            accessibilityLabel="primary"
            accessibilityRole="button"
          >
            <Text style={[styles.filterTabText, activeTab === 'primary' && styles.filterTabTextActive]}>Primary</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, activeTab === 'general' && styles.filterTabActive]}
            onPress={() => setActiveTab('general')}
            accessibilityLabel="general"
            accessibilityRole="button"
          >
            <Text style={[styles.filterTabText, activeTab === 'general' && styles.filterTabTextActive]}>General</Text>
          </TouchableOpacity>
        </View>
        {unreadNotifCount > 0 && <Text style={styles.notificationHint}>{unreadNotifCount} notification{unreadNotifCount === 1 ? '' : 's'} unread</Text>}
      </View>

      {/* Bubbles (Primary only) */}
      {activeTab === 'primary' && followedSellers.length > 0 && (
        <View style={styles.bubblesSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bubblesRow}>
            {followedSellers.map((seller: any) => (
              <SellerBubble key={seller.seller_id} seller={seller} />
            ))}
          </ScrollView>
        </View>
      )}
    </>
  );

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

      <FlatList
        data={filteredConversations as any}
        renderItem={renderConversation as any}
        keyExtractor={(item: any) => item.id}
        ListHeaderComponent={listHeader}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.coral} />}
        ListEmptyComponent={
          loading ? (
            <RowListSkeleton count={6} thumbSize={48} />
          ) : (
            <EmptyState
              icon="message-outline"
              title={activeTab === 'primary' ? 'No conversations with followed sellers' : activeTab === 'general' ? 'No general conversations' : t('inbox.noMessages')}
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
  searchBarWrap: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.pill,
    paddingHorizontal: 12, height: 38,
  },
  searchBarInput: { flex: 1, color: COLORS.text, fontSize: 14, paddingVertical: 0 },
  filterRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.xs,
  },
  filterTabs: { flexDirection: 'row', gap: SPACING.md },
  filterTab: { paddingVertical: 4 },
  filterTabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.coral },
  filterTabText: { fontSize: 14, color: COLORS.text2, fontWeight: '500' },
  filterTabTextActive: { color: COLORS.text, fontWeight: '700' },
  notificationHint: { color: COLORS.text2, fontSize: 11 },
  bubblesSection: { paddingTop: SPACING.xs, paddingBottom: 4 },
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
});
