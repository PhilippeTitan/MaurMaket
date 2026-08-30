import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, TextInput, ScrollView, Modal, Keyboard,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Icon } from '../components/icons/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING, RADIUS, formatPrice } from '../theme';
import { useTranslation } from '../i18n';
import EmptyState from '../components/EmptyState';
import { RowListSkeleton } from '../components/Skeleton';
import { getConversations, getNotifications, getFollowing, createConversation, getConversationsWithOffers, markNotificationRead, markAllNotificationsRead } from '../api';
import { useToast } from '../components/Toast';
import { store } from '../store';
import { routeNotification } from '../notificationRouting';
import type { Conversation, Notification } from '../types';
import type { RootStackParamList } from '../navigation';
import { LinearGradient } from 'expo-linear-gradient';
import UserAvatar from '../components/UserAvatar';
import { cacheKeys, readSnapshot, writeSnapshot } from '../offlineCache';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type InboxTab = 'all' | 'primary' | 'offers';

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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followedSellers, setFollowedSellers] = useState<any[]>([]);
  const [offerConversations, setOfferConversations] = useState<any[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searchFilter, setSearchFilter] = useState<'all' | 'today' | 'week' | 'unread'>('all');
  const [showFilterDrop, setShowFilterDrop] = useState(false);
  const searchInputRef = useRef<any>(null);

  const followedIds = new Set(followedSellers.map((s: any) => s.seller_id));

  const fetchData = useCallback(async (force = false) => {
    const cacheKey = store.user?.id ? cacheKeys.inbox(store.user.id) : null;
    const prev = _inboxCache;
    _inboxCache = null;
    if (!force && prev && Date.now() - prev.timestamp < INBOX_CACHE_TTL) {
      const d = prev.data;
      setConversations(d.conversations);
      setNotifications(d.notifications);
      setFollowedSellers(d.followedSellers);
      setOfferConversations(d.offerConversations || []);
      setLoading(false);
      return;
    }
    if (!force && cacheKey) {
      const snapshot = await readSnapshot<{ conversations: Conversation[]; notifications: Notification[]; followedSellers: any[]; offerConversations: any[] }>(cacheKey);
      if (snapshot?.value) {
        const d = snapshot.value;
        setConversations(d.conversations || []); setNotifications(d.notifications || []);
        setFollowedSellers(d.followedSellers || []); setOfferConversations(d.offerConversations || []);
        setLoading(false);
      }
    }
    try {
      const [convoResult, notifResult, followingResult, offersResult] = await Promise.allSettled([
        getConversations() as Promise<{ conversations: Conversation[] }>,
        getNotifications() as Promise<{ notifications: Notification[] }>,
        getFollowing() as Promise<{ following: any[] }>,
        getConversationsWithOffers() as Promise<{ conversations: any[] }>,
      ]);
      if (convoResult.status !== 'fulfilled') throw convoResult.reason;
      const conversations = convoResult.value.conversations || [];
      const notifications = notifResult.status === 'fulfilled' ? notifResult.value.notifications || [] : [];
      const followedSellers = followingResult.status === 'fulfilled' ? followingResult.value.following || [] : [];
      const offerConversations = offersResult.status === 'fulfilled' ? offersResult.value.conversations || [] : [];
      setConversations(conversations);
      setNotifications(notifications);
      setFollowedSellers(followedSellers);
      store.setFollowingList(followedSellers.map((s: any) => s.seller_id || s.id).filter(Boolean));
      setOfferConversations(offerConversations);
      _inboxCache = { timestamp: Date.now(), data: { conversations, notifications, followedSellers, offerConversations } };
      if (cacheKey) void writeSnapshot(cacheKey, { conversations, notifications, followedSellers, offerConversations });
    } catch {
      toast.error(t('feedback.inboxRefreshFailed'), t('feedback.connectionRetry'), () => fetchData(true));
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData(true);
    setRefreshing(false);
  }, []);


  const sortedConversations = conversations
    .slice()
    .sort((a, b) => {
      // Pinned first, then by time
      if ((a as any).is_pinned && !(b as any).is_pinned) return -1;
      if (!(a as any).is_pinned && (b as any).is_pinned) return 1;
      // Active offers before regular
      if ((a as any).has_active_offer && !(b as any).has_active_offer) return -1;
      if (!(a as any).has_active_offer && (b as any).has_active_offer) return 1;
      const ta = new Date(a.last_message_at || a.created_at || 0).getTime();
      const tb = new Date(b.last_message_at || b.created_at || 0).getTime();
      return tb - ta;
    });

  // Split into sections for the inbox
  const pinnedConversations = sortedConversations.filter(c => (c as any).is_pinned && !((c as any).has_active_offer));
  const offerConversationsList = sortedConversations.filter(c => (c as any).has_active_offer);
  const regularConversations = sortedConversations.filter(c => !(c as any).is_pinned && !((c as any).has_active_offer));

  const filteredConversations = sortedConversations
    .filter(c => {
      const otherId = (c as any).other_party_id;
      if (activeTab === 'all') return true;
      if (activeTab === 'primary') return otherId && followedIds.has(otherId);
      return true;
    })
    .filter(c => {
      if (!search.trim() && searchFilter === 'all') return true;
      const q = search.toLowerCase();
      const name = ((c as any).other_party_name || '').toLowerCase();
      const uname = ((c as any).other_party_username || '').toLowerCase();
      const msg = ((c as any).last_message || '').toLowerCase();
      const matchesSearch = !q || name.includes(q) || uname.includes(q) || msg.includes(q);
      const now = Date.now();
      const msgTime = new Date(c.last_message_at || c.created_at || 0).getTime();
      if (searchFilter === 'today') return matchesSearch && (now - msgTime) < 86400000;
      if (searchFilter === 'week') return matchesSearch && (now - msgTime) < 7 * 86400000;
      if (searchFilter === 'unread') return matchesSearch && (c.unread_count || 0) > 0;
      return matchesSearch;
    });

  const renderConversation = ({ item }: { item: Conversation }) => {
    const otherName = (item as any).other_party_username || ((item as any).other_party_name || 'Seller');
    const hasUnread = (item.unread_count || 0) > 0;
    const storeName = (item as any).other_party_store_name;
    const sellerTier = (item as any).other_party_seller_tier;
    const otherUserId = (item as any).other_party_id;

    return (
      <View style={styles.convo}>
        <TouchableOpacity
          style={styles.convoMain}
          onPress={() => nav.navigate('Chat', { conversationId: item.id, otherUserName: otherName, otherUserId, otherUserAvatar: (item as any).other_party_avatar, otherUserStoreLogoUrl: (item as any).other_party_store_logo_url, otherUserUseStoreIdentity: (item as any).other_party_use_store_identity, otherUserTier: sellerTier })}
          accessibilityLabel={`conversation with ${otherName}`}
          accessibilityRole="button"
          activeOpacity={0.7}
        >
          <View style={{ position: 'relative' }}>
             <UserAvatar seller={{ avatar_url: (item as any).other_party_avatar, full_name: otherName, username: (item as any).other_party_username, seller_tier: sellerTier } as any} size={48} animated={false} />
            {hasUnread && <View style={styles.convoUnreadBadge} />}
          </View>
          <View style={styles.convoBody}>
            <View style={styles.convoNameRow}>
              {(item as any).is_pinned && <MaterialCommunityIcons name="pin" size={10} color={COLORS.coral} style={{ marginRight: 4 }} />}
              <Text style={[styles.convoName, hasUnread && styles.convoNameBold]} numberOfLines={1}>{otherName}</Text>
              {(item as any).has_active_offer && (
                <View style={styles.offerBadge}>
                  <Text style={styles.offerBadgeText}>Offer</Text>
                </View>
              )}
              <Text style={styles.convoTime}>{timeAgo(item.last_message_at || item.created_at)}</Text>
            </View>
            {storeName ? (
              <Text style={styles.convoStore} numberOfLines={1}>{storeName}</Text>
            ) : sellerTier && sellerTier !== 'none' ? (
              <Text style={styles.convoTier} numberOfLines={1}>{sellerTier} seller</Text>
            ) : null}
            <View style={styles.convoMsgRow}>
              {(item as any).last_message_type === 'image' && <MaterialCommunityIcons name="image-outline" size={14} color={COLORS.text2} style={{ marginRight: 4 }} />}
              {(item as any).has_active_offer && <MaterialCommunityIcons name="tag-outline" size={14} color={COLORS.coral} style={{ marginRight: 4 }} />}
            {!(item as any).has_active_offer && (item as any).last_message_type === 'offer' && <MaterialCommunityIcons name="tag-outline" size={14} color={COLORS.text2} style={{ marginRight: 4 }} />}
              {((item as any).last_message_type && (item as any).last_message_type !== 'text') ? null : (
                <Text style={[styles.convoMsg, hasUnread && styles.convoMsgUnread]} numberOfLines={1}>
                  {item.last_message?.content || (item as any).last_message || 'No messages yet'}
                </Text>
              )}
            </View>
          </View>
        </TouchableOpacity>
        {otherUserId && (
          <TouchableOpacity
            style={styles.convoStoreBtn}
            onPress={() => nav.navigate('Storefront', { sellerId: otherUserId, preloadedSeller: { username: (item as any).other_party_username, full_name: otherName, avatar_url: (item as any).other_party_avatar, seller_tier: sellerTier, store_name: storeName } })}
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
    const displayName = seller.store_name || seller.username || seller.full_name?.split(' ')[0];
    const handlePress = async () => {
      try {
        const existing = conversations.find(c => c.seller_id === seller.seller_id || c.buyer_id === seller.seller_id);
        if (existing) {
          nav.navigate('Chat', { conversationId: existing.id, otherUserName: displayName, otherUserId: seller.seller_id, otherUserAvatar: seller.avatar_url, otherUserStoreLogoUrl: seller.store_logo_url, otherUserUseStoreIdentity: seller.use_store_identity, otherUserTier: seller.seller_tier });
          return;
        }
        const res = await createConversation({ sellerId: seller.seller_id }) as { conversationId: string };
        if (res.conversationId) {
          nav.navigate('Chat', { conversationId: res.conversationId, otherUserName: displayName, otherUserId: seller.seller_id, otherUserAvatar: seller.avatar_url, otherUserStoreLogoUrl: seller.store_logo_url, otherUserUseStoreIdentity: seller.use_store_identity, otherUserTier: seller.seller_tier });
        }
      } catch {
        toast.error(t('feedback.messagesUnavailable'), t('feedback.connectionRetry'), handlePress);
      }
    };
    return (
      <TouchableOpacity style={styles.sellerBubble} onPress={handlePress} accessibilityLabel={`message ${displayName}`} accessibilityRole="button">
        <View style={{ position: 'relative' }}>
          <UserAvatar seller={seller} size={64} animated={false} />
          <View style={styles.sellerOnlineDot} />
        </View>
        <Text style={styles.sellerBubbleName} numberOfLines={1}>
          {displayName}
        </Text>
      </TouchableOpacity>
    );
  };

  const topSegmentedTabs = (
    <View style={styles.topTabsWrap}>
      <TouchableOpacity
        style={[styles.topTabItem, activeTab === 'all' && styles.topTabItemActive]}
        onPress={() => setActiveTab('all')}
        activeOpacity={0.7}
        accessibilityLabel="All messages"
        accessibilityRole="button"
      >
        <Text style={[styles.topTabLabel, activeTab === 'all' && styles.topTabLabelActive]}>
          All
        </Text>
        {conversations.length > 0 && (
          <View style={[styles.topTabCount, activeTab === 'all' && styles.topTabCountActive]}>
            <Text style={[styles.topTabCountText, activeTab === 'all' && styles.topTabCountTextActive]}>
              {conversations.length}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.topTabItem, activeTab === 'primary' && styles.topTabItemActive]}
        onPress={() => setActiveTab('primary')}
        activeOpacity={0.7}
        accessibilityLabel="Primary messages"
        accessibilityRole="button"
      >
        {activeTab !== 'primary' && followedSellers.length > 0 && <View style={styles.topTabRedDot} />}
        <Text style={[styles.topTabLabel, activeTab === 'primary' && styles.topTabLabelActive]}>
          Primary
        </Text>
        {followedSellers.length > 0 && (
          <View style={[styles.topTabCount, activeTab === 'primary' && styles.topTabCountActive]}>
            <Text style={[styles.topTabCountText, activeTab === 'primary' && styles.topTabCountTextActive]}>
              {followedSellers.length}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.topTabItem, activeTab === 'offers' && styles.topTabItemActive]}
        onPress={() => setActiveTab('offers')}
        activeOpacity={0.7}
        accessibilityLabel="Offers"
        accessibilityRole="button"
      >
        <Text style={[styles.topTabLabel, activeTab === 'offers' && styles.topTabLabelActive]}>
          Offers
        </Text>
        {offerConversations.length > 0 && (
          <View style={[styles.topTabCount, activeTab === 'offers' && styles.topTabCountActive]}>
            <Text style={[styles.topTabCountText, activeTab === 'offers' && styles.topTabCountTextActive]}>
              {offerConversations.length > 9 ? '9+' : offerConversations.length}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );

  const conversationsListHeader = (
    <>
      <View style={styles.bubblesSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bubblesRow}>
          {followedSellers.map((seller: any) => (
            <SellerBubble key={seller.seller_id} seller={seller} />
          ))}
        </ScrollView>
      </View>
      {topSegmentedTabs}
    </>
  );

  return (
    <LinearGradient
      colors={['#121820', '#0D1117', '#0A0E14']}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
      <View style={[styles.topBar, { paddingTop: insets.top + SPACING.xs }]}>
        <Text style={styles.title}>{t('inbox.title')}</Text>
      </View>

      <TouchableOpacity
        style={styles.searchBar}
        onPress={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 100); }}
        activeOpacity={0.7}
        accessibilityLabel="search messages"
        accessibilityRole="button"
      >
        <MaterialCommunityIcons name="magnify" size={20} color={COLORS.text2} />
        <Text style={styles.searchBarPlaceholder}>Search messages...</Text>
      </TouchableOpacity>

      {activeTab === 'offers' ? (
        <FlatList
          data={offerConversations}
          renderItem={({ item }: { item: any }) => {
            const otherName = item.other_party_username || (item.other_party_name || 'Seller');
            const sellerTier = item.other_party_seller_tier;
            const offerStatus = item.offer_status;
            const isCountered = offerStatus === 'countered';
            const isAccepted = offerStatus === 'accepted';
            const isDeclined = offerStatus === 'declined';
            const isExpired = offerStatus === 'expired';
            const isPending = !isCountered && !isAccepted && !isDeclined && !isExpired;
            const round = item.negotiation_round || 1;
            const expiresIn = item.offer_expires_at ? Math.max(0, Math.floor((new Date(item.offer_expires_at).getTime() - Date.now()) / 3600000)) : null;
            if (isExpired) return null; // Don't show expired offers at all
            return (
              <TouchableOpacity
                style={styles.offerCard}
                onPress={() => nav.navigate('OfferDetail', { messageId: item.offer_message_id, conversationId: item.id })}
                accessibilityLabel={`offer with ${otherName}`}
                accessibilityRole="button"
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={['rgba(216,90,48,0.06)', 'rgba(216,90,48,0.01)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ ...StyleSheet.absoluteFill, borderRadius: RADIUS.media }}
                />
                <View style={styles.offerCardHeader}>
                  <View style={styles.offerCardUserRow}>
                    <UserAvatar seller={{ avatar_url: item.other_party_avatar, full_name: otherName, username: item.other_party_username, seller_tier: sellerTier } as any} size={30} animated={false} />
                    <View style={{ flex: 1, minWidth: 0, marginLeft: 8 }}>
                      <Text style={styles.offerCardUsername} numberOfLines={1}>{otherName}</Text>
                      <Text style={styles.offerCardTime}>{timeAgo(item.last_message_at || item.created_at)}</Text>
                    </View>
                  </View>
                  <View style={[
                    styles.offerStatusBadge,
                    isAccepted && styles.offerStatusBadgeAccepted,
                    isDeclined && styles.offerStatusBadgeDeclined,
                    isCountered && styles.offerStatusBadgeCountered,
                    isPending && styles.offerStatusBadgePending,
                    isExpired && styles.offerStatusBadgeDeclined,
                  ]}>
                    <Text style={[
                      styles.offerStatusText,
                      isAccepted && styles.offerStatusTextAccepted,
                      isDeclined && styles.offerStatusTextDeclined,
                      isCountered && styles.offerStatusTextCountered,
                      isPending && styles.offerStatusTextPending,
                      isExpired && styles.offerStatusTextDeclined,
                    ]}>
                      {isAccepted ? '✓ Accepted' : isDeclined ? '✕ Declined' : isCountered ? `🔄 Counter (${round}/3)` : isExpired ? '✕ Expired' : '⏳ Pending'}
                    </Text>
                  </View>
                </View>

                <View style={styles.offerCardDivider} />

                <View style={styles.offerCardBody}>
                  <View style={styles.offerProductIconWrap}>
                    <Icon name="sale-tag" size={18} color={COLORS.coral} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.offerProductName} numberOfLines={1}>{item.product_name}</Text>
                    <View style={styles.offerPriceRow}>
                      <Text style={styles.offerPriceValue}>G {formatPrice(item.offered_price)}</Text>
                      {item.list_price && item.list_price > item.offered_price ? (
                        <Text style={styles.offerListPriceValue}>G {formatPrice(item.list_price)}</Text>
                      ) : null}
                    </View>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.text2} />
                </View>

                {expiresIn !== null && isPending && (
                  <View style={styles.offerFooter}>
                    <MaterialCommunityIcons name="clock-outline" size={12} color={expiresIn < 6 ? COLORS.coral : COLORS.text2} />
                    <Text style={[styles.offerExpiresText, expiresIn < 6 && { color: COLORS.coral }]}>
                      {expiresIn === 0 ? 'Expiring soon' : `${expiresIn}h left to respond`}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
          keyExtractor={(item: any) => `${item.id}-${item.product_id}`}
          ListHeaderComponent={conversationsListHeader}
          contentContainerStyle={{ paddingBottom: insets.bottom + 90, paddingHorizontal: SPACING.md, paddingTop: SPACING.xs }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.coral} />}
          ListEmptyComponent={
            loading ? (
              <RowListSkeleton count={4} thumbSize={48} />
            ) : (
              <EmptyState icon="tag-outline" title="No active offers" size={44} />
            )
          }
        />
      ) : (
        <FlatList
          data={filteredConversations as any}
          renderItem={renderConversation as any}
          keyExtractor={(item: any) => item.id}
          ListHeaderComponent={conversationsListHeader}
          contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.coral} />}
          ListEmptyComponent={
            loading ? (
              <RowListSkeleton count={6} thumbSize={48} />
            ) : (
              <EmptyState
                icon="message-outline"
                title={activeTab === 'primary' ? 'No conversations with followed sellers' : t('inbox.noMessages')}
                size={56}
              />
            )
          }
        />
      )}

      <Modal
        visible={searchOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setSearchOpen(false); setSearch(''); Keyboard.dismiss(); }}
      >
        <View style={styles.searchModal}>
          <View style={[styles.searchModalHeader, { paddingTop: insets.top + SPACING.sm }]}>
            <Text style={styles.searchModalTitle}>Search</Text>
          </View>
          <FlatList
            data={filteredConversations as any}
            renderItem={renderConversation as any}
            keyExtractor={(item: any) => item.id}
            contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              search.trim() ? (
                <EmptyState icon="magnify" title="No results found" size={48} />
              ) : null
            }
          />
          <View style={[styles.searchModalFooter, { paddingBottom: insets.bottom > 0 ? insets.bottom + SPACING.sm : SPACING.md }]}>
            <TouchableOpacity
              onPress={() => { setSearchOpen(false); setSearch(''); Keyboard.dismiss(); }}
              accessibilityLabel="close search"
              accessibilityRole="button"
              style={styles.searchCloseBtn}
            >
              <MaterialCommunityIcons name="close" size={22} color={COLORS.text} />
            </TouchableOpacity>
            <View style={styles.searchModalInputWrap}>
              <MaterialCommunityIcons name="magnify" size={18} color={COLORS.text2} />
              <TextInput
                ref={searchInputRef}
                style={styles.searchModalInput}
                placeholder="Search messages..."
                placeholderTextColor={COLORS.text2}
                value={search}
                onChangeText={setSearch}
                autoFocus
                returnKeyType="search"
                accessibilityLabel="search messages"
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')} accessibilityLabel="clear" accessibilityRole="button">
                  <MaterialCommunityIcons name="close-circle" size={16} color={COLORS.text2} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={styles.searchFilterBtn}
              onPress={() => setShowFilterDrop(!showFilterDrop)}
              accessibilityLabel="filter"
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="tune-variant" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          {showFilterDrop && (
            <View style={styles.filterDropdown}>
              {[
                { key: 'all', label: 'All time' },
                { key: 'today', label: 'Today' },
                { key: 'week', label: 'This week' },
                { key: 'unread', label: 'Unread' },
              ].map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.filterDropItem, searchFilter === opt.key && styles.filterDropItemActive]}
                  onPress={() => { setSearchFilter(opt.key as any); setShowFilterDrop(false); }}
                  accessibilityLabel={opt.label}
                  accessibilityRole="button"
                >
                  <Text style={[styles.filterDropText, searchFilter === opt.key && styles.filterDropTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  topBar: {
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  title: { fontSize: 28, color: COLORS.text, fontWeight: '800', letterSpacing: -0.3, textAlign: 'center' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    paddingHorizontal: 16,
    height: 48,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
  },
  searchBarPlaceholder: {
    fontSize: 15,
    color: COLORS.text2,
    fontWeight: '400',
  },

  /* Top Tab Pills (WhatsApp style) */
  topTabsWrap: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    paddingTop: 6,
    gap: 8,
  },
  topTabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border + '60',
  },
  topTabItemActive: {
    backgroundColor: COLORS.coral + '15',
    borderColor: COLORS.coral + '40',
  },
  topTabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text2,
  },
  topTabLabelActive: {
    color: COLORS.coral,
    fontWeight: '700',
  },
  topTabRedDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#E53935',
  },
  topTabCount: {
    backgroundColor: COLORS.surface2,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  topTabCountActive: {
    backgroundColor: COLORS.coral + '20',
  },
  topTabCountText: {
    fontSize: 11,
    color: COLORS.text2,
    fontWeight: '700',
  },
  topTabCountTextActive: {
    color: COLORS.coral,
  },
  topTabOfferBadge: {
    backgroundColor: COLORS.coral,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  topTabOfferBadgeActive: {
    backgroundColor: COLORS.coral,
  },
  topTabOfferBadgeText: {
    fontSize: 10,
    color: COLORS.white,
    fontWeight: '700',
  },
  topTabOfferBadgeTextActive: {
    color: COLORS.white,
  },

  /* Offer Card Styles */
  offerCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.media,
    borderWidth: 1,
    borderColor: COLORS.border + '40',
    padding: 14,
    marginBottom: 10,
  },
  offerCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  offerCardUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  offerCardUsername: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  offerCardTime: {
    fontSize: 10,
    color: COLORS.text2,
    marginTop: 1,
  },
  offerStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface2,
  },
  offerStatusBadgePending: {
    backgroundColor: 'rgba(245,166,35,0.15)',
    borderWidth: 1,
    borderColor: '#F5A623',
  },
  offerStatusBadgeAccepted: {
    backgroundColor: 'rgba(29,158,117,0.15)',
    borderWidth: 1,
    borderColor: '#1D9E75',
  },
  offerStatusBadgeDeclined: {
    backgroundColor: 'rgba(226,75,74,0.15)',
    borderWidth: 1,
    borderColor: '#E24B4A',
  },
  offerStatusBadgeCountered: {
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  offerStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text2,
  },
  offerStatusTextPending: { color: '#F5A623' },
  offerStatusTextAccepted: { color: '#1D9E75' },
  offerStatusTextDeclined: { color: '#E24B4A' },
  offerStatusTextCountered: { color: '#3B82F6' },
  offerCardDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 10,
  },
  offerCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  offerProductIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(216,90,48,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerProductName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  offerPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 3,
  },
  offerPriceValue: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.coral,
  },
  offerListPriceValue: {
    fontSize: 12,
    color: COLORS.text2,
    textDecorationLine: 'line-through',
  },
  offerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  offerExpiresText: {
    fontSize: 11,
    color: COLORS.text2,
    fontWeight: '500',
  },

  /* Conversations */
  convo: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border + '30', gap: 10 },
  convoMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  convoUnreadBadge: { position: 'absolute', top: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: '#1A73E8', borderWidth: 2, borderColor: COLORS.bg },
  convoBody: { flex: 1, gap: 2 },
  convoNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  convoName: { fontSize: 15, color: COLORS.text, fontWeight: '500', flex: 1 },
  convoNameBold: { fontWeight: '700', color: COLORS.white },
  convoStore: { fontSize: 12, color: COLORS.coral, fontWeight: '600' },
  convoTier: { fontSize: 11, color: COLORS.text2, textTransform: 'capitalize' },
  convoMsgRow: { flexDirection: 'row', alignItems: 'center', marginTop: 1 },
  convoMsg: { fontSize: 13, color: COLORS.text2, flex: 1 },
  convoMsgUnread: { color: COLORS.text, fontWeight: '600' },
  convoTime: { fontSize: 11, color: COLORS.text2, marginLeft: 4 },
  offerBadge: { backgroundColor: COLORS.coral, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, marginLeft: 6 },
  offerBadgeText: { fontSize: 9, fontWeight: '700', color: COLORS.white },
  convoStoreBtn: { padding: 8, borderRadius: 20, backgroundColor: 'transparent' },

  /* Bubbles */
  bubblesSection: { paddingTop: SPACING.sm, paddingBottom: SPACING.xs },
  bubblesRow: { paddingHorizontal: SPACING.md, gap: 16 },
  sellerBubble: { alignItems: 'center', width: 68 },
  sellerBubbleName: { fontSize: 11, color: COLORS.text2, marginTop: 6, textAlign: 'center', fontWeight: '500' },
  sellerOnlineDot: { position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: '#00C853', borderWidth: 2.5, borderColor: COLORS.bg },

  /* Search modal */
  searchModal: { flex: 1, backgroundColor: COLORS.bg },
  searchModalHeader: {
    alignItems: 'center', paddingBottom: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  searchModalTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  searchModalFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: SPACING.md, paddingTop: SPACING.sm,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  searchCloseBtn: { padding: 4 },
  searchModalInputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.pill,
    paddingHorizontal: 12, height: 38,
  },
  searchModalInput: { flex: 1, color: COLORS.text, fontSize: 14, paddingVertical: 0 },
  searchFilterBtn: { padding: 6, borderRadius: 20 },
  filterDropdown: {
    position: 'absolute', bottom: 70, right: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.card,
    borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: 4, minWidth: 140,
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8,
  },
  filterDropItem: { paddingVertical: 10, paddingHorizontal: 16 },
  filterDropItemActive: { backgroundColor: COLORS.coral + '15' },
  filterDropText: { fontSize: 14, color: COLORS.text },
  filterDropTextActive: { color: COLORS.coral, fontWeight: '700' },
});
