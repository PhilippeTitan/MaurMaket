import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, TextInput, Modal, Keyboard, Pressable,
} from 'react-native';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import { Icon } from '../components/icons/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING, RADIUS, formatPrice, LAYOUT, SHADOW } from '../theme';
import { useTranslation } from '@/localization';
import EmptyState from '../components/EmptyState';
import { RowListSkeleton } from '../components/Skeleton';
import { getConversations, getFollowing, createConversation, getConversationsWithOffers, markOfferSeen, searchSellersForChat, archiveConversation, markConversationUnread } from '../api';
import { useToast } from '../components/Toast';
import { staysInInbox, unreadState } from '../utils/conversationListPolicy.js';
import { store } from '../store';
import { LinearGradient } from 'expo-linear-gradient';
import type { Conversation } from '../types';
import type { RootStackParamList } from '../navigation';
import UserAvatar from '../components/UserAvatar';
import { cacheKeys, readSnapshot, writeSnapshot } from '../offlineCache';
import { network } from '../network';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type InboxTab = 'messages' | 'offers';

const INBOX_CACHE_TTL = 15_000;
let _inboxCache: { data: any; timestamp: number } | null = null;

export default function InboxScreen() {
  const { t } = useTranslation();

  const timeAgo = (dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('common.justNow');
    if (mins < 60) return t('common.minutesAgo', { mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t('common.hoursAgo', { hours: hrs });
    const days = Math.floor(hrs / 24);
    if (days < 7) return t('common.daysAgo', { days });
    return new Date(dateStr).toLocaleDateString('fr-HT', { day: 'numeric', month: 'short' });
  };

  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'Inbox'>>();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<InboxTab>('messages');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followedSellers, setFollowedSellers] = useState<any[]>([]);
  const [offerConversations, setOfferConversations] = useState<any[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searchFilter, setSearchFilter] = useState<'all' | 'today' | 'week' | 'unread'>('all');
  const [showFilterDrop, setShowFilterDrop] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [actionTarget, setActionTarget] = useState<Conversation | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [newChatVisible, setNewChatVisible] = useState(false);
  const [sellerSearch, setSellerSearch] = useState('');
  const [sellerResults, setSellerResults] = useState<any[]>([]);
  const [sellerSearchLoading, setSellerSearchLoading] = useState(false);
  const searchInputRef = useRef<any>(null);


  const fetchData = useCallback(async (force = false) => {
    const cacheKey = store.user?.id ? cacheKeys.inbox(store.user.id) : null;
    const prev = _inboxCache;
    _inboxCache = null;
    if (!force && prev && Date.now() - prev.timestamp < INBOX_CACHE_TTL) {
      const d = prev.data;
      setConversations(d.conversations);
      setFollowedSellers(d.followedSellers);
      setOfferConversations(d.offerConversations || []);
      setLoading(false);
      return;
    }
    if (!force && cacheKey) {
      const snapshot = await readSnapshot<{ conversations: Conversation[]; followedSellers: any[]; offerConversations: any[] }>(cacheKey);
      if (snapshot?.value) {
        const d = snapshot.value;
        setConversations(d.conversations || []);
        setFollowedSellers(d.followedSellers || []); setOfferConversations(d.offerConversations || []);
        setLoading(false);
      }
    }
    try {
      const [convoResult, followingResult, offersResult] = await Promise.allSettled([
        getConversations() as Promise<{ conversations: Conversation[] }>,
        getFollowing() as Promise<{ following: any[] }>,
        getConversationsWithOffers() as Promise<{ conversations: any[] }>,
      ]);
      if (convoResult.status !== 'fulfilled') throw convoResult.reason;
      const conversations = convoResult.value.conversations || [];
      const followedSellers = followingResult.status === 'fulfilled' ? followingResult.value.following || [] : [];
      const offerConversations = offersResult.status === 'fulfilled' ? offersResult.value.conversations || [] : [];
      setConversations(conversations);
      setFollowedSellers(followedSellers);
      store.setFollowingList(followedSellers.map((s: any) => s.seller_id || s.id).filter(Boolean));
      setOfferConversations(offerConversations);
      _inboxCache = { timestamp: Date.now(), data: { conversations, followedSellers, offerConversations } };
      if (cacheKey) void writeSnapshot(cacheKey, { conversations, followedSellers, offerConversations });
    } catch {
      // Offline: cached data is already on screen and the global banner explains why
      if (!network.isOffline) toast.error(t('feedback.inboxRefreshFailed'), t('feedback.connectionRetry'), () => fetchData(true));
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(true); }, []));

  useEffect(() => {
    if (!newChatVisible || sellerSearch.trim().length < 2) {
      setSellerResults([]);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      setSellerSearchLoading(true);
      try {
        const result = await searchSellersForChat(sellerSearch.trim());
        if (active) setSellerResults(result.sellers || []);
      } catch { if (active) setSellerResults([]); }
      finally { if (active) setSellerSearchLoading(false); }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [newChatVisible, sellerSearch]);

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

  // Split into sections for the inbox. An archived chat is filed away from the
  // Inbox — but never at the cost of a live offer, which is time-sensitive.
  // That single rule lives in conversationListPolicy.staysInInbox, shared with
  // the server's own partition so the two cannot disagree.
  const isFiledAway = (c: Conversation) => !staysInInbox({ isArchived: (c as any).is_archived, hasActiveOffer: (c as any).has_active_offer });
  const inboxConversations = sortedConversations.filter(c => !isFiledAway(c));
  const archivedConversations = sortedConversations.filter(isFiledAway);
  const visibleConversations = showArchived ? archivedConversations : inboxConversations;

  const filteredConversations = visibleConversations
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
      // "Unread" includes a chat the user flagged as a reminder, which has no
      // unread messages of its own.
      if (searchFilter === 'unread') return matchesSearch && unreadState({ unreadCount: c.unread_count, markedUnread: (c as any).marked_unread }) !== 'read';
      return matchesSearch;
    });

  const renderConversation = ({ item }: { item: Conversation }) => {
    const otherName = (item as any).other_party_use_store_identity && (item as any).other_party_store_name
      ? (item as any).other_party_store_name
      : ((item as any).other_party_username || (item as any).other_party_name || t('common.seller'));
    const attention = unreadState({ unreadCount: item.unread_count, markedUnread: (item as any).marked_unread });
    const hasUnread = attention === 'unread';
    const isMarkedUnread = attention === 'marked';
    const sellerTier = (item as any).other_party_seller_tier;
    const otherUserId = (item as any).other_party_id;

    return (
      <View style={styles.convo}>
        <TouchableOpacity
          style={styles.convoMain}
          onPress={() => nav.navigate('Chat', { conversationId: item.id, otherUserName: otherName, otherUserId, otherUserAvatar: (item as any).other_party_avatar, otherUserStoreLogoUrl: (item as any).other_party_store_logo_url, otherUserUseStoreIdentity: (item as any).other_party_use_store_identity, otherUserTier: sellerTier })}
          accessibilityLabel={t('inbox.conversationWith', { name: otherName })}
          accessibilityRole="button"
          onLongPress={() => setActionTarget(item)}
          delayLongPress={300}
          activeOpacity={0.7}
        >
          <View style={{ position: 'relative' }}>
             <UserAvatar seller={{ avatar_url: (item as any).other_party_avatar, store_logo_url: (item as any).other_party_store_logo_url, use_store_identity: (item as any).other_party_use_store_identity, full_name: otherName, username: (item as any).other_party_username, seller_tier: sellerTier } as any} size={48} animated={false} />
            {(hasUnread || isMarkedUnread) && <View style={[styles.convoUnreadBadge, isMarkedUnread && styles.convoMarkedBadge]} />}
          </View>
          <View style={styles.convoBody}>
            <View style={styles.convoNameRow}>
              {(item as any).is_pinned && <MaterialCommunityIcons name="pin" size={10} color={COLORS.coral} style={{ marginRight: 4 }} />}
              <Text style={[styles.convoName, hasUnread && styles.convoNameBold]} numberOfLines={1}>{otherName}</Text>
              {(item as any).has_active_offer && (
                <View style={styles.offerBadge}>
                  <Text style={styles.offerBadgeText}>{t('inbox.offerBadge')}</Text>
                </View>
              )}
              <Text style={styles.convoTime}>{timeAgo(item.last_message_at || item.created_at)}</Text>
            </View>
            <View style={styles.convoMsgRow}>
              {(item as any).last_message_type === 'image' && <MaterialCommunityIcons name="image-outline" size={14} color={COLORS.text2} style={{ marginRight: 4 }} />}
              {(item as any).last_message_type === 'audio' && <MaterialCommunityIcons name="microphone" size={14} color={COLORS.text2} style={{ marginRight: 4 }} />}
              {(item as any).has_active_offer && <MaterialCommunityIcons name="tag-outline" size={14} color={COLORS.coral} style={{ marginRight: 4 }} />}
            {!(item as any).has_active_offer && (item as any).last_message_type === 'offer' && <MaterialCommunityIcons name="tag-outline" size={14} color={COLORS.text2} style={{ marginRight: 4 }} />}
              {((item as any).last_message_type && (item as any).last_message_type !== 'text' && (item as any).last_message_type !== 'audio') ? null : (
                <Text style={[styles.convoMsg, hasUnread && styles.convoMsgUnread]} numberOfLines={1}>
                  {item.last_message?.content || (item as any).last_message || t('inbox.noMessages')}
                </Text>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  // Both actions are private to the caller: archive only files the chat away for
  // this user, and the unread reminder is a flag of their own, so the other
  // participant's view — and their read receipt — is never touched.
  const applyMarkUnread = async (unread: boolean) => {
    const target = actionTarget;
    setActionTarget(null);
    if (!target || actionBusy) return;
    setActionBusy(true);
    try {
      await markConversationUnread(target.id, unread);
      setConversations(prev => prev.map(c => (c.id === target.id ? ({ ...c, marked_unread: unread } as Conversation) : c)));
      _inboxCache = null;
      if (unread) toast.success(t('inbox.markedUnread'));
    } catch { toast.error(t('chat.actionFailed')); }
    finally { setActionBusy(false); }
  };

  const applyArchive = async (archived: boolean) => {
    const target = actionTarget;
    setActionTarget(null);
    if (!target || actionBusy) return;
    setActionBusy(true);
    try {
      await archiveConversation(target.id, archived);
      setConversations(prev => prev.map(c => (c.id === target.id ? ({ ...c, is_archived: archived } as Conversation) : c)));
      _inboxCache = null;
      toast.success(archived ? t('inbox.archived') : t('inbox.unarchived'));
    } catch { toast.error(t('chat.actionFailed')); }
    finally { setActionBusy(false); }
  };

  const startChatWith = async (seller: any) => {
    const sellerId = seller.seller_id || seller.id;
    const displayName = seller.use_store_identity && seller.store_name ? seller.store_name : (seller.username || seller.full_name?.split(' ')[0]);
    try {
      const existing = conversations.find(c => !c.order_id && (c.seller_id === sellerId || c.buyer_id === sellerId));
      const conversationId = existing?.id || (await createConversation({ sellerId }) as { conversationId: string }).conversationId;
      setNewChatVisible(false); setSellerSearch('');
      nav.navigate('Chat', { conversationId, otherUserName: displayName, otherUserId: sellerId, otherUserAvatar: seller.avatar_url, otherUserStoreLogoUrl: seller.store_logo_url, otherUserUseStoreIdentity: seller.use_store_identity, otherUserTier: seller.seller_tier });
    } catch { toast.error(t('feedback.messagesUnavailable'), t('feedback.connectionRetry'), () => startChatWith(seller)); }
  };

  const topSegmentedTabs = (
    <View style={styles.topTabsWrap}>
      <TouchableOpacity
        style={[styles.topTabItem, activeTab === 'messages' && styles.topTabItemActive]}
        onPress={() => setActiveTab('messages')}
        activeOpacity={0.7}
        accessibilityLabel={t('inbox.tabMessages')}
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === 'messages' }}
      >
        <Text style={[styles.topTabLabel, activeTab === 'messages' && styles.topTabLabelActive]}>
          {t('inbox.tabMessages')}
        </Text>
        {conversations.length > 0 && (
          <View style={[styles.topTabCount, activeTab === 'messages' && styles.topTabCountActive]}>
            <Text style={[styles.topTabCountText, activeTab === 'messages' && styles.topTabCountTextActive]}>
              {conversations.length}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.topTabItem, activeTab === 'offers' && styles.topTabItemActive]}
        onPress={() => setActiveTab('offers')}
        activeOpacity={0.7}
        accessibilityLabel={t('inbox.tabOffers')}
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === 'offers' }}
      >
        {activeTab !== 'offers' && offerConversations.some((o: any) => o.needs_action) && <View style={styles.topTabRedDot} />}
        <Text style={[styles.topTabLabel, activeTab === 'offers' && styles.topTabLabelActive]}>
          {t('inbox.tabOffers')}
        </Text>
        {offerConversations.filter((o: any) => o.needs_action).length > 0 && (
          <View style={[styles.topTabCount, activeTab === 'offers' && styles.topTabCountActive]}>
            <Text style={[styles.topTabCountText, activeTab === 'offers' && styles.topTabCountTextActive]}>
              {offerConversations.filter((o: any) => o.needs_action).length > 9 ? '9+' : offerConversations.filter((o: any) => o.needs_action).length}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );

  const conversationsListHeader = (
    <>
      {topSegmentedTabs}
    </>
  );

  // The messages list adds the Archived entry — or the way back out of it — on top
  // of the tabs. Only shown when there is actually something filed away.
  const messagesListHeader = (
    <>
      {conversationsListHeader}
      {showArchived ? (
        <TouchableOpacity
          style={styles.archivedHeaderRow}
          onPress={() => setShowArchived(false)}
          accessibilityRole="button"
          accessibilityLabel={t('inbox.backToInbox')}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="arrow-left" size={18} color={COLORS.coral} />
          <Text style={styles.archivedHeaderText}>{t('inbox.backToInbox')}</Text>
        </TouchableOpacity>
      ) : archivedConversations.length > 0 ? (
        <TouchableOpacity
          style={styles.archivedRow}
          onPress={() => setShowArchived(true)}
          accessibilityRole="button"
          accessibilityLabel={t('inbox.archivedCount', { count: archivedConversations.length })}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="archive-outline" size={20} color={COLORS.text2} />
          <Text style={styles.archivedRowText}>{t('inbox.archivedCount', { count: archivedConversations.length })}</Text>
          <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.text2} />
        </TouchableOpacity>
      ) : null}
    </>
  );

  const actionTargetName = actionTarget
    ? ((actionTarget as any).other_party_use_store_identity && (actionTarget as any).other_party_store_name
      ? (actionTarget as any).other_party_store_name
      : ((actionTarget as any).other_party_username || (actionTarget as any).other_party_name || t('common.seller')))
    : '';

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + SPACING.xs }]}>
        <Text style={styles.title}>{t('inbox.title')}</Text>
      </View>

      <Modal visible={newChatVisible} animationType="slide" onRequestClose={() => { setNewChatVisible(false); setSellerSearch(''); }}>
        <View style={[styles.newChatRoot, { paddingTop: insets.top + SPACING.sm, paddingBottom: insets.bottom + SPACING.sm }]}>
          <View style={styles.newChatHeader}>
            <Text style={styles.newChatTitle}>{t('chat.newChat')}</Text>
            <TouchableOpacity onPress={() => { setNewChatVisible(false); setSellerSearch(''); }} accessibilityLabel={t('common.close')} accessibilityRole="button">
              <MaterialCommunityIcons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.newChatSearch}>
            <MaterialCommunityIcons name="magnify" size={19} color={COLORS.text2} />
            <TextInput value={sellerSearch} onChangeText={setSellerSearch} placeholder={t('chat.searchSellers')} placeholderTextColor={COLORS.text2} style={styles.newChatSearchInput} autoFocus accessibilityLabel={t('chat.searchSellers')} />
            {sellerSearchLoading && <ActivityIndicator size="small" color={COLORS.coral} />}
          </View>
          <FlatList
            data={sellerSearch.trim().length >= 2 ? sellerResults : followedSellers}
            keyExtractor={(item: any) => item.seller_id || item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }: { item: any }) => {
              const id = item.seller_id || item.id;
              const name = item.use_store_identity && item.store_name
                ? item.store_name
                : (item.username || item.full_name || t('common.seller'));
              return <TouchableOpacity style={styles.newChatSellerRow} onPress={() => startChatWith(item)} accessibilityRole="button">
                <UserAvatar seller={{ ...item, avatar_url: item.avatar_url, full_name: item.full_name || name, seller_tier: item.seller_tier } as any} size={44} animated={false} />
                <View style={{ flex: 1 }}><Text style={styles.newChatSellerName} numberOfLines={1}>{name}</Text>{item.username ? <Text style={styles.newChatSellerHandle} numberOfLines={1}>@{item.username}</Text> : null}</View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.text2} />
              </TouchableOpacity>;
            }}
            ListEmptyComponent={!sellerSearchLoading ? <Text style={styles.newChatEmpty}>{sellerSearch.trim().length >= 2 ? t('chat.noMatchingSellers') : t('chat.noFollowedSellers')}</Text> : null}
            contentContainerStyle={{ paddingBottom: SPACING.lg }}
          />
        </View>
      </Modal>

      <TouchableOpacity
        style={styles.searchBar}
        onPress={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 100); }}
        activeOpacity={0.7}
        accessibilityLabel={t('inbox.searchTitle')}
        accessibilityRole="button"
      >
        <MaterialCommunityIcons name="magnify" size={20} color={COLORS.text2} />
        <Text style={styles.searchBarPlaceholder}>{t('inbox.searchPlaceholder')}</Text>
      </TouchableOpacity>

      {activeTab === 'offers' ? (
        <FlatList
          data={offerConversations}
          renderItem={({ item }: { item: any }) => {
            const otherName = item.other_party_use_store_identity && item.other_party_store_name
              ? item.other_party_store_name
              : (item.other_party_username || item.other_party_name || t('common.seller'));
            const sellerTier = item.other_party_seller_tier;
            const offerStatus = item.offer_status;
            const isCountered = offerStatus === 'countered';
            const isAccepted = offerStatus === 'accepted';
            const isRedeemed = offerStatus === 'redeemed';
            const isDeclined = offerStatus === 'declined';
            const isExpired = offerStatus === 'expired' || (!!item.is_history && offerStatus === 'pending') || (isAccepted && !!item.accepted_expires_at && new Date(item.accepted_expires_at) <= new Date());
            const isPending = !isCountered && !isAccepted && !isRedeemed && !isDeclined && !isExpired;
            const round = item.counter_count || 0;
            const expiresIn = item.offer_expires_at ? Math.max(0, Math.floor((new Date(item.offer_expires_at).getTime() - Date.now()) / 3600000)) : null;
            return (
              <TouchableOpacity
                style={[styles.offerCard, item.is_history && styles.offerCardHistory]}
                onPress={() => { setOfferConversations(prev => prev.map(o => o.offer_message_id === item.offer_message_id ? { ...o, needs_action: false } : o)); markOfferSeen(item.offer_message_id).catch(() => {}); nav.navigate('OfferDetail', { messageId: item.offer_message_id, conversationId: item.id }); }}
                accessibilityLabel={t('inbox.offerWith', { name: otherName })}
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
                    <UserAvatar seller={{ avatar_url: item.other_party_avatar, store_logo_url: item.other_party_store_logo_url, use_store_identity: item.other_party_use_store_identity, full_name: otherName, username: item.other_party_username, seller_tier: sellerTier } as any} size={30} animated={false} />
                    <View style={{ flex: 1, minWidth: 0, marginLeft: 8 }}>
                      <Text style={styles.offerCardUsername} numberOfLines={1}>{otherName}</Text>
                      <Text style={styles.offerCardTime}>{timeAgo(item.last_message_at || item.created_at)}</Text>
                    </View>
                  </View>
                  <View style={[
                    styles.offerStatusBadge,
                    isAccepted && styles.offerStatusBadgeAccepted,
                    isRedeemed && styles.offerStatusBadgeAccepted,
                    isDeclined && styles.offerStatusBadgeDeclined,
                    isCountered && styles.offerStatusBadgeCountered,
                    isPending && styles.offerStatusBadgePending,
                    isExpired && styles.offerStatusBadgeDeclined,
                  ]}>
                    <Text style={[
                      styles.offerStatusText,
                      isAccepted && styles.offerStatusTextAccepted,
                      isRedeemed && styles.offerStatusTextAccepted,
                      isDeclined && styles.offerStatusTextDeclined,
                      isCountered && styles.offerStatusTextCountered,
                      isPending && styles.offerStatusTextPending,
                      isExpired && styles.offerStatusTextDeclined,
                    ]}>
                      {isRedeemed ? t('offer.redeemed') : isExpired ? t('inbox.offerExpired') : isAccepted ? t('inbox.offerAccepted') : isDeclined ? t('inbox.offerDeclined') : isCountered ? t('inbox.offerCounter', { round }) : t('inbox.offerPending')}
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
                    <Text style={styles.offerTotalText}>{t('offer.quantityAndTotal', { quantity: String(item.quantity || 1), total: formatPrice(item.offered_price * (item.quantity || 1)) })}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.text2} />
                </View>

                {item.needs_action && <Text style={styles.needsResponse}>{t('inbox.needsYourResponse')}</Text>}

                {expiresIn !== null && isPending && (
                  <View style={styles.offerFooter}>
                    <MaterialCommunityIcons name="clock-outline" size={12} color={expiresIn < 6 ? COLORS.coral : COLORS.text2} />
                    <Text style={[styles.offerExpiresText, expiresIn < 6 && { color: COLORS.coral }]}>
                      {expiresIn === 0 ? t('inbox.expiringSoon') : t('inbox.hoursLeftToRespond', { hours: expiresIn })}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
          keyExtractor={(item: any) => item.offer_message_id}
          ListHeaderComponent={conversationsListHeader}
          contentContainerStyle={{ paddingBottom: insets.bottom + 90, paddingHorizontal: SPACING.md, paddingTop: SPACING.xs }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.coral} />}
          ListEmptyComponent={
            loading ? (
              <RowListSkeleton count={4} thumbSize={48} />
            ) : (
              <EmptyState icon="tag-outline" title={t('inbox.noActiveOffers')} hint={t('inbox.noActiveOffersHint')} size={44} />
            )
          }
        />
      ) : (
        <FlatList
          data={filteredConversations as any}
          renderItem={renderConversation as any}
          keyExtractor={(item: any) => item.id}
          ListHeaderComponent={messagesListHeader}
          extraData={showArchived}
          contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.coral} />}
          ListEmptyComponent={
            loading ? (
              <RowListSkeleton count={6} thumbSize={48} />
            ) : (
              <EmptyState
                icon={showArchived ? 'archive-outline' : 'message-outline'}
                title={showArchived ? t('inbox.noArchived') : t('inbox.noMessages')}
                size={56}
              />
            )
          }
        />
      )}

      <TouchableOpacity
        style={[
          styles.newChatFab,
          { bottom: (insets.bottom > 0 ? insets.bottom + SPACING.xs : LAYOUT.tabBarMarginBottom) + LAYOUT.tabBarHeight + SPACING.sm },
        ]}
        onPress={() => setNewChatVisible(true)}
        accessibilityRole="button"
        accessibilityLabel={t('chat.newChat')}
        activeOpacity={0.85}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <MaterialCommunityIcons name="message-plus-outline" size={24} color={COLORS.white} />
      </TouchableOpacity>

      <Modal
        visible={searchOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setSearchOpen(false); setSearch(''); Keyboard.dismiss(); }}
      >
        <View style={styles.searchModal}>
          <View style={[styles.searchModalHeader, { paddingTop: insets.top + SPACING.sm }]}>
            <Text style={styles.searchModalTitle}>{t('inbox.searchTitle')}</Text>
          </View>
          <FlatList
            data={filteredConversations as any}
            renderItem={renderConversation as any}
            keyExtractor={(item: any) => item.id}
            contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              search.trim() ? (
                <EmptyState icon="magnify" title={t('inbox.noResults')} size={48} />
              ) : null
            }
          />
          <View style={[styles.searchModalFooter, { paddingBottom: insets.bottom > 0 ? insets.bottom + SPACING.sm : SPACING.md }]}>
            <TouchableOpacity
              onPress={() => { setSearchOpen(false); setSearch(''); Keyboard.dismiss(); }}
              accessibilityLabel={t('inbox.closeSearch')}
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
                placeholder={t('inbox.searchPlaceholder')}
                placeholderTextColor={COLORS.text2}
                value={search}
                onChangeText={setSearch}
                autoFocus
                returnKeyType="search"
                accessibilityLabel={t('inbox.searchTitle')}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')} accessibilityLabel={t('inbox.clearSearch')} accessibilityRole="button">
                  <MaterialCommunityIcons name="close-circle" size={16} color={COLORS.text2} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={styles.searchFilterBtn}
              onPress={() => setShowFilterDrop(!showFilterDrop)}
              accessibilityLabel={t('inbox.filterSearch')}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="tune-variant" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          {showFilterDrop && (
            <View style={styles.filterDropdown}>
              {[
                { key: 'all', label: t('inbox.filterAllTime') },
                { key: 'today', label: t('inbox.filterToday') },
                { key: 'week', label: t('inbox.filterThisWeek') },
                { key: 'unread', label: t('inbox.filterUnread') },
              ].map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.filterDropItem, searchFilter === opt.key && styles.filterDropItemActive]}
                  onPress={() => { setSearchFilter(opt.key as any); setShowFilterDrop(false); }}
                  accessibilityLabel={opt.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: searchFilter === opt.key }}
                >
                  <Text style={[styles.filterDropText, searchFilter === opt.key && styles.filterDropTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </Modal>

      <Modal visible={!!actionTarget} transparent animationType="fade" onRequestClose={() => setActionTarget(null)}>
        <Pressable style={styles.modalShade} onPress={() => setActionTarget(null)}>
          <Pressable style={styles.actionSheet} onPress={e => e.stopPropagation()}>
            <Text style={styles.actionSheetTitle} numberOfLines={1}>{actionTargetName}</Text>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => applyMarkUnread(!(actionTarget as any)?.marked_unread)}
              disabled={actionBusy}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="email-outline" size={20} color={COLORS.text2} />
              <Text style={styles.menuRowText}>{(actionTarget as any)?.marked_unread ? t('inbox.markRead') : t('inbox.markUnread')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => applyArchive(!(actionTarget as any)?.is_archived)}
              disabled={actionBusy}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name={(actionTarget as any)?.is_archived ? 'archive-arrow-up-outline' : 'archive-outline'} size={20} color={COLORS.text2} />
              <Text style={styles.menuRowText}>{(actionTarget as any)?.is_archived ? t('inbox.unarchive') : t('inbox.archive')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  title: { fontSize: 28, color: COLORS.text, fontWeight: '800', letterSpacing: -0.3, textAlign: 'left' },
  newChatButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 10, borderRadius: RADIUS.pill, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  newChatButtonText: { color: COLORS.coral, fontSize: 12, fontWeight: '700' },
  newChatFab: {
    position: 'absolute',
    right: SPACING.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.coral,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.xl,
  },
  newChatRoot: { flex: 1, backgroundColor: COLORS.bg, paddingHorizontal: SPACING.md },
  newChatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  newChatTitle: { color: COLORS.text, fontSize: 22, fontWeight: '800' },
  newChatSearch: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.surface, borderRadius: RADIUS.pill, paddingHorizontal: 14, minHeight: 46, marginBottom: SPACING.md },
  newChatSearchInput: { flex: 1, color: COLORS.text, fontSize: 15, paddingVertical: 10 },
  newChatSellerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  newChatSellerName: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  newChatSellerHandle: { color: COLORS.text2, fontSize: 12, marginTop: 2 },
  newChatEmpty: { color: COLORS.text2, textAlign: 'center', marginTop: 34, fontSize: 14 },
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
    borderColor: COLORS.border,
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
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 10,
  },
  offerCardHistory: { padding: 10, marginBottom: 5, opacity: 0.86 },
  offerTotalText: { color: COLORS.text2, fontSize: 10, marginTop: 3 },
  needsResponse: { color: COLORS.coral, fontSize: 11, fontWeight: '700', marginTop: 5 },
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
    borderTopColor: COLORS.border,
  },
  offerExpiresText: {
    fontSize: 11,
    color: COLORS.text2,
    fontWeight: '500',
  },

  /* Conversations */
  convo: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 10 },
  convoMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  convoUnreadBadge: { position: 'absolute', top: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: '#1A73E8', borderWidth: 2, borderColor: COLORS.bg },
  convoBody: { flex: 1, gap: 2 },
  convoNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  convoName: { fontSize: 15, color: COLORS.text, fontWeight: '500', flex: 1 },
  convoNameBold: { fontWeight: '700', color: COLORS.white },
  convoMsgRow: { flexDirection: 'row', alignItems: 'center', marginTop: 1 },
  convoMsg: { fontSize: 13, color: COLORS.text2, flex: 1 },
  convoMsgUnread: { color: COLORS.text, fontWeight: '600' },
  convoTime: { fontSize: 11, color: COLORS.text2, marginLeft: 4 },
  convoMarkedBadge: { backgroundColor: COLORS.coral },

  /* Archived entry + conversation action sheet */
  archivedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: SPACING.md, marginBottom: SPACING.sm,
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: RADIUS.card, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
  },
  archivedRowText: { flex: 1, color: COLORS.text, fontSize: 14, fontWeight: '600' },
  archivedHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: SPACING.md, marginBottom: SPACING.sm, paddingVertical: 10 },
  archivedHeaderText: { color: COLORS.coral, fontSize: 14, fontWeight: '700' },
  modalShade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  actionSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.card, borderTopRightRadius: RADIUS.card,
    paddingTop: SPACING.sm, paddingBottom: SPACING.lg,
  },
  actionSheetTitle: { color: COLORS.text2, fontSize: 13, fontWeight: '700', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: SPACING.md },
  menuRowText: { color: COLORS.text, fontSize: 15 },
  offerBadge: { backgroundColor: COLORS.coral, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, marginLeft: 6 },
  offerBadgeText: { fontSize: 9, fontWeight: '700', color: COLORS.white },

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
