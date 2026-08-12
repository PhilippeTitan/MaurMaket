import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert, ActivityIndicator, TextInput, ScrollView, Modal, Keyboard,
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
import { getConversations, getNotifications, getFollowing, createConversation, getConversationsWithOffers, markNotificationRead, markAllNotificationsRead, getImageUrl } from '../api';
import { useToast } from '../components/Toast';
import { store } from '../store';
import { routeNotification } from '../notificationRouting';
import type { Conversation, Notification } from '../types';
import type { RootStackParamList } from '../navigation';
import UserAvatar from '../components/UserAvatar';

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

  const handleNotifPress = async (notif: Notification) => {
    if (!notif.is_read) {
      try { await markNotificationRead(notif.id); } catch { toast.error(t('feedback.notificationUpdateFailed')); }
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
    }
    routeNotification(nav, notif.type, notif.data as Record<string, any>);
  };

  const handleMarkAllRead = async () => {
    try { await markAllNotificationsRead(); } catch { toast.error(t('feedback.markNotificationsFailed')); return; }
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const renderConversation = ({ item }: { item: Conversation }) => {
    const otherName = (item as any).other_party_username ? `@${(item as any).other_party_username}` : ((item as any).other_party_name || 'Seller');
    const hasUnread = (item.unread_count || 0) > 0;
    const storeName = (item as any).other_party_store_name;
    const sellerTier = (item as any).other_party_seller_tier;
    const otherUserId = (item as any).other_party_id;

    return (
      <View style={styles.convo}>
        <TouchableOpacity
          style={styles.convoMain}
          onPress={() => nav.navigate('Chat', { conversationId: item.id, otherUserName: otherName, otherUserId, otherUserAvatar: (item as any).other_party_avatar, otherUserTier: sellerTier })}
          accessibilityLabel={`conversation with ${otherName}`}
          accessibilityRole="button"
          activeOpacity={0.7}
        >
          <View style={{ position: 'relative' }}>
             <UserAvatar seller={{ avatar_url: (item as any).other_party_avatar, full_name: otherName, username: (item as any).other_party_username, seller_tier: sellerTier } as any} size={44} animated={false} />
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
    const displayName = seller.store_name || (seller.username ? `@${seller.username}` : seller.full_name?.split(' ')[0]);
    const handlePress = async () => {
      try {
        const existing = conversations.find(c => c.seller_id === seller.seller_id || c.buyer_id === seller.seller_id);
        if (existing) {
          nav.navigate('Chat', { conversationId: existing.id, otherUserName: displayName, otherUserId: seller.seller_id, otherUserAvatar: seller.avatar_url, otherUserTier: seller.seller_tier });
          return;
        }
        const res = await createConversation({ sellerId: seller.seller_id }) as { conversationId: string };
        if (res.conversationId) {
          nav.navigate('Chat', { conversationId: res.conversationId, otherUserName: displayName, otherUserId: seller.seller_id, otherUserAvatar: seller.avatar_url, otherUserTier: seller.seller_tier });
        }
      } catch {
        toast.error(t('feedback.messagesUnavailable'), t('feedback.connectionRetry'), handlePress);
      }
    };
    return (
      <TouchableOpacity style={styles.sellerBubble} onPress={handlePress} accessibilityLabel={`message ${displayName}`} accessibilityRole="button">
        <UserAvatar seller={seller} size={44} animated={false} />
        <Text style={styles.sellerBubbleName} numberOfLines={1}>
          {displayName}
        </Text>
      </TouchableOpacity>
    );
  };

  const notifSections = groupByDay(notifications);
  const notifsFlat: { label: string; notif: Notification; isHeader: boolean }[] = [];
  for (const section of notifSections) {
    notifsFlat.push({ label: section.label, notif: section.data[0], isHeader: true });
    for (const n of section.data) {
      notifsFlat.push({ label: '', notif: n, isHeader: false });
    }
  }

  const TABS: { key: InboxTab | 'search'; icon: string; label: string }[] = [
    { key: 'all', icon: 'message-text-outline', label: 'All' },
    { key: 'primary', icon: 'star-outline', label: 'Primary' },
    { key: 'search', icon: 'magnify', label: 'Search' },
    { key: 'offers', icon: 'tag-outline', label: 'Offers' },
  ];

  const bottomTabBar = (
    <View style={[styles.bottomNav, { paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 12 }]}>
      {TABS.map(tab => {
        if (tab.key === 'search') {
          return (
            <TouchableOpacity
              key="search"
              style={styles.bottomNavItem}
              onPress={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 100); }}
              accessibilityLabel="search"
              accessibilityRole="button"
              activeOpacity={0.7}
            >
              <View style={styles.bottomNavIconWrap}>
                <MaterialCommunityIcons name="magnify" size={24} color={COLORS.text2} />
              </View>
              <Text style={styles.bottomNavLabel}>Search</Text>
            </TouchableOpacity>
          );
        }
        const isActive = activeTab === tab.key;
        const badge = tab.key === 'offers' ? offerConversations.length : 0;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.bottomNavItem}
            onPress={() => setActiveTab(tab.key as InboxTab)}
            accessibilityLabel={tab.label}
            accessibilityRole="button"
            activeOpacity={0.7}
          >
            <View style={styles.bottomNavIconWrap}>
              <MaterialCommunityIcons
                name={tab.icon as any}
                size={24}
                color={isActive ? COLORS.coral : COLORS.text2}
              />
              {badge > 0 && (
                <View style={styles.bottomNavBadge}>
                  <Text style={styles.bottomNavBadgeText}>{badge > 9 ? '9+' : badge}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.bottomNavLabel, isActive && styles.bottomNavLabelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderNotifItem = ({ item }: { item: { label: string; notif: Notification; isHeader: boolean } }) => {
    if (item.isHeader) {
      return (
        <View style={styles.notifSectionHeader}>
          <Text style={styles.notifSectionHeaderText}>{item.label}</Text>
        </View>
      );
    }
    const notif = item.notif;
    const { icon, color } = getNotifIcon(notif.type);
    const imageData = (notif.data as any)?.image;
    return (
      <TouchableOpacity
        style={[styles.notifRow, !notif.is_read && styles.notifRowUnread]}
        onPress={() => handleNotifPress(notif)}
        activeOpacity={0.7}
        accessibilityLabel={notif.title}
        accessibilityRole="button"
      >
        <View style={[styles.notifIconWrap, { backgroundColor: color + '18' }]}>
          <MaterialCommunityIcons name={icon as any} size={20} color={color} />
        </View>
        <View style={styles.notifBody}>
          <Text style={[styles.notifTitle, !notif.is_read && styles.notifTitleUnread]} numberOfLines={1}>{notif.title}</Text>
          {notif.body && <Text style={styles.notifBodyText} numberOfLines={2}>{notif.body}</Text>}
          <Text style={styles.notifTime}>{timeAgo(notif.created_at)}</Text>
        </View>
        {imageData ? (
          <View style={styles.notifImageWrap}>
            <View style={[styles.notifImage, { backgroundColor: COLORS.surface2 }]} />
          </View>
        ) : !notif.is_read ? (
          <View style={[styles.notifDot, { backgroundColor: color }]} />
        ) : null}
      </TouchableOpacity>
    );
  };

  const conversationsListHeader = (
    <>
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
      </View>

      {activeTab === 'offers' ? (
        <FlatList
          data={offerConversations}
          renderItem={({ item }: { item: any }) => {
            const otherName = item.other_party_username ? `@${item.other_party_username}` : (item.other_party_name || 'Seller');
            const sellerTier = item.other_party_seller_tier;
            const offerStatus = item.offer_status;
            const isCountered = offerStatus === 'countered';
            const round = item.negotiation_round || 1;
            const expiresIn = item.offer_expires_at ? Math.max(0, Math.floor((new Date(item.offer_expires_at).getTime() - Date.now()) / 3600000)) : null;
            return (
              <TouchableOpacity
                style={styles.convo}
                onPress={() => nav.navigate('OfferDetail', { messageId: item.offer_message_id, conversationId: item.id })}
                accessibilityLabel={`offer with ${otherName}`}
                accessibilityRole="button"
                activeOpacity={0.7}
              >
                <View style={styles.convoMain}>
                  <View style={{ position: 'relative' }}>
                    <UserAvatar seller={{ avatar_url: item.other_party_avatar, full_name: otherName, username: item.other_party_username, seller_tier: sellerTier } as any} size={44} animated={false} />
                  </View>
                  <View style={styles.convoBody}>
                    <View style={styles.convoNameRow}>
                      <Text style={styles.convoName} numberOfLines={1}>{otherName}</Text>
                      <Text style={styles.convoTime}>{timeAgo(item.last_message_at || item.created_at)}</Text>
                    </View>
                    <Text style={styles.convoMsg} numberOfLines={1}>
                      {isCountered ? `Counter: G ${item.offered_price} (round ${round}/3)` : `Offer: G ${item.offered_price} — ${item.product_name}`}
                    </Text>
                    {expiresIn !== null && <Text style={{ fontSize: 11, color: expiresIn < 6 ? COLORS.coral : COLORS.text2, marginTop: 2 }}>{expiresIn}h left</Text>}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
          keyExtractor={(item: any) => `${item.id}-${item.product_id}`}
          ListHeaderComponent={conversationsListHeader}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
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
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
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

      {bottomTabBar}

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

  /* Bottom nav bar */
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  bottomNavItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingVertical: 2,
  },
  bottomNavIconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomNavBadge: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: COLORS.coral,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  bottomNavBadgeText: { color: COLORS.white, fontSize: 9, fontWeight: '700' },
  bottomNavLabel: { fontSize: 10, color: COLORS.text2, marginTop: 2, fontWeight: '500' },
  bottomNavLabelActive: { color: COLORS.coral, fontWeight: '700' },

  /* Conversations */
  convo: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 10 },
  convoMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
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

  /* Bubbles */
  bubblesSection: { paddingTop: SPACING.xs, paddingBottom: 4 },
  bubblesRow: { paddingHorizontal: SPACING.md, gap: 14 },
  sellerBubble: { alignItems: 'center', width: 64 },
  sellerBubbleName: { fontSize: 11, color: COLORS.text2, marginTop: 4, textAlign: 'center' },

  /* Notifications */
  notifSectionHeader: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.xs },
  notifSectionHeaderText: { fontSize: 13, fontWeight: '700', color: COLORS.text2, textTransform: 'uppercase', letterSpacing: 0.5 },
  notifRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  notifRowUnread: { backgroundColor: COLORS.surface },
  notifIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  notifBody: { flex: 1 },
  notifTitle: { fontSize: 14, fontWeight: '500', color: COLORS.text },
  notifTitleUnread: { fontWeight: '700' },
  notifBodyText: { fontSize: 13, color: COLORS.text2, marginTop: 2 },
  notifTime: { fontSize: 11, color: COLORS.text2, marginTop: 4 },
  notifImageWrap: { width: 44, height: 44, borderRadius: RADIUS.row, overflow: 'hidden' },
  notifImage: { width: '100%', height: '100%' },
  notifDot: { width: 8, height: 8, borderRadius: 4 },

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
