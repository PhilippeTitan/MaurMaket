const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '..', 'src', 'screens', 'StorefrontScreen.tsx');

const content = `import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl,
  Alert, Modal, TextInput, Pressable, Platform,
} from 'react-native';
import { Icon } from '../components/icons/Icon';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, getDisplayName, getSellerAvatar, formatPrice } from '../theme';
import {
  getSellerProfile, getSellerReviews, toggleFollow, getFollowerCount,
  createConversation, getConversations, blockUser, replyToReview, editReviewReply,
} from '../api';
import { store } from '../store';
import { useTranslation } from '@/localization';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EmptyState from '../components/EmptyState';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation';
import type { Product, Review, SellerProfile } from '../types';
import { useToast } from '../components/Toast';
import UserAvatar from '../components/UserAvatar';
import BackButton from '../components/BackButton';
import MasonryGrid from '../components/MasonryGrid';
import ReportModal from '../components/ReportModal';
import { Image as ExpoImage } from 'expo-image';

type Props = NativeStackScreenProps<RootStackParamList, 'Storefront'>;
type Tab = 'listings' | 'reviews';

const STOREFRONT_CACHE_TTL = 60_000;
let _storefrontCache: Record<string, { data: any; timestamp: number }> = {};

export default function StorefrontScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const GRID_GAP = 3;

  const { sellerId, preloadedSeller } = route.params;
  const [seller, setSeller] = useState<SellerProfile | null>(
    preloadedSeller ? ({
      id: sellerId,
      username: preloadedSeller.username || '',
      full_name: preloadedSeller.full_name || '',
      store_name: preloadedSeller.store_name,
      avatar_url: preloadedSeller.avatar_url,
      store_logo_url: preloadedSeller.store_logo_url,
      seller_tier: preloadedSeller.seller_tier || 'casual',
      bio: preloadedSeller.bio,
      use_store_identity: preloadedSeller.use_store_identity ?? false,
      location_city: preloadedSeller.location_city,
      show_real_name: preloadedSeller.show_real_name ?? false,
      created_at: preloadedSeller.created_at,
    } as any) : null
  );
  const [products, setProducts] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewStats, setReviewStats] = useState<any>(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [messageLoading, setMessageLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('listings');
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const [storeTick, setStoreTick] = useState(0);
  const listRef = useRef<FlatList>(null);

  // Overflow menu state (3 dots)
  const [overflowMenuVisible, setOverflowMenuVisible] = useState(false);

  // Reporting state
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportTarget, setReportTarget] = useState<{
    targetType: 'user' | 'review' | 'reply';
    targetId: string;
    targetName?: string;
  }>({ targetType: 'user', targetId: sellerId });

  // Seller reply state
  const [replyModalVisible, setReplyModalVisible] = useState(false);
  const [replyingReview, setReplyingReview] = useState<Review | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replySaving, setReplySaving] = useState(false);

  useEffect(() => {
    const unsub = store.onChange(() => setStoreTick(t => t + 1));
    return unsub;
  }, []);

  const isOwnProfile = store.user?.id === sellerId;

  const fetchSellerData = useCallback(async (force = false) => {
    if (!force && _storefrontCache[sellerId] && Date.now() - _storefrontCache[sellerId].timestamp < STOREFRONT_CACHE_TTL) {
      const d = _storefrontCache[sellerId].data;
      setSeller(d.seller);
      setProducts(d.products);
      setReviews(d.reviews);
      setReviewStats(d.reviewStats);
      setFollowerCount(d.followerCount);
      setFollowingCount(d.followingCount);
      setLoading(false);
      return;
    }
    try {
      const [sellerRes, prodRes, revRes, followingRes] = await Promise.all([
        getSellerProfile(sellerId) as Promise<{ seller: SellerProfile }>,
        import('../api').then(m => m.getProducts({ seller: sellerId, limit: '50' })) as Promise<{ products: Product[] }>,
        getSellerReviews(sellerId) as Promise<{ reviews: Review[]; stats?: any }>,
        store.isLoggedIn ? import('../api').then(m => m.getFollowing()) as Promise<{ following?: Array<{ seller_id?: string; id?: string }> }> : Promise.resolve({ following: [] }),
      ]);
      const fetchedSeller = sellerRes.seller;
      const allProds = prodRes.products || [];
      // Visitor sees available products only
      const visibleProducts = allProds.filter(p => p.is_available !== false);
      const fetchedReviews = (revRes.reviews || []).map((r: any) => ({
        ...r,
        reviewer: r.reviewer || {
          full_name: r.reviewer_name,
          avatar_url: r.reviewer_avatar,
          username: r.reviewer_username,
        },
      }));
      const stats = revRes.stats || null;
      const followIds = (followingRes.following || []).map(f => f.seller_id || f.id).filter(Boolean) as string[];
      store.setFollowingList(followIds);
      setSeller(fetchedSeller);
      setProducts(visibleProducts);
      setReviews(fetchedReviews);
      setReviewStats(stats);

      const countRes = await getFollowerCount(sellerId) as { count: number };
      const fcount = fetchedSeller.hide_follower_counts ? 0 : (countRes.count ?? fetchedSeller.followers_count ?? 0);
      setFollowerCount(fcount);
      let fcing = 0;
      try {
        const fRes = await import('../api').then(m => m.getFollowing()) as { following?: unknown[] };
        fcing = fRes?.following?.length || 0;
      } catch {}
      setFollowingCount(fcing);
      _storefrontCache[sellerId] = {
        timestamp: Date.now(),
        data: {
          seller: fetchedSeller,
          products: visibleProducts,
          reviews: fetchedReviews,
          reviewStats: stats,
          followerCount: fcount,
          followingCount: fcing,
        },
      };
    } catch {
      toast.error('Seller profile could not load', 'Check your connection and try again.', () => fetchSellerData(true));
    }
    setLoading(false);
  }, [sellerId]);

  useFocusEffect(useCallback(() => { fetchSellerData(); }, [fetchSellerData]));

  const handleFollow = async () => {
    if (followLoading) return;
    const wasFollowing = store.isFollowing(sellerId);
    const previousCount = followerCount;
    setFollowLoading(true);
    store.toggleFollowing(sellerId, !wasFollowing);
    setFollowerCount(prev => Math.max(0, prev + (wasFollowing ? -1 : 1)));
    try {
      const res = await toggleFollow(sellerId) as { following: boolean };
      store.toggleFollowing(sellerId, res.following);
      setFollowerCount(Math.max(0, previousCount + (res.following ? 1 : 0) - (wasFollowing ? 1 : 0)));
    } catch {
      store.toggleFollowing(sellerId, wasFollowing);
      setFollowerCount(previousCount);
      toast.error('Could not update follow', 'Your follow status was not changed.', handleFollow);
    }
    setFollowLoading(false);
  };

  const handleMessage = async () => {
    if (!store.user) return;
    if (messageLoading) return;
    setMessageLoading(true);
    try {
      const convosRes = await getConversations() as { conversations: Array<{ id: string; seller_id?: string; buyer_id?: string }> };
      const existing = (convosRes.conversations || []).find(c => c.seller_id === sellerId || c.buyer_id === sellerId);
      if (existing) {
        navigation.navigate('Chat', {
          conversationId: existing.id,
          otherUserName: getDisplayName(seller) || 'Seller',
          otherUserId: sellerId,
          otherUserAvatar: getSellerAvatar(seller),
          otherUserStoreLogoUrl: seller?.store_logo_url,
          otherUserUseStoreIdentity: seller?.use_store_identity,
          otherUserTier: seller?.seller_tier,
        });
      } else {
        const productContext = products[0];
        const res = await createConversation({ sellerId, productId: productContext?.id }) as { conversationId: string };
        navigation.navigate('Chat', {
          conversationId: res.conversationId,
          otherUserName: getDisplayName(seller) || 'Seller',
          otherUserId: sellerId,
          otherUserAvatar: getSellerAvatar(seller),
          otherUserStoreLogoUrl: seller?.store_logo_url,
          otherUserUseStoreIdentity: seller?.use_store_identity,
          otherUserTier: seller?.seller_tier,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed';
      toast.error('Could not open messages', msg, handleMessage);
    }
    setMessageLoading(false);
  };

  const handleBlockUser = () => {
    setOverflowMenuVisible(false);
    Alert.alert(
      'Block this user?',
      \`Are you sure you want to block @\${seller?.username || 'user'}? You will no longer receive messages or see each other's activity.\`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await blockUser(sellerId);
              toast.show({ kind: 'info', title: 'User blocked' });
              navigation.goBack();
            } catch {
              toast.error('Could not block user', 'Please try again later.');
            }
          },
        },
      ]
    );
  };

  const handleReportUser = () => {
    setOverflowMenuVisible(false);
    setReportTarget({
      targetType: 'user',
      targetId: sellerId,
      targetName: displayName,
    });
    setReportModalVisible(true);
  };

  const handleReportReview = (review: Review) => {
    setReportTarget({
      targetType: 'review',
      targetId: review.id,
      targetName: \`Review by \${review.reviewer?.username || 'Buyer'}\`,
    });
    setReportModalVisible(true);
  };

  const handleReportReply = (review: Review) => {
    setReportTarget({
      targetType: 'reply',
      targetId: review.id,
      targetName: \`Reply by \${displayName}\`,
    });
    setReportModalVisible(true);
  };

  const openReplyModal = (review: Review) => {
    setReplyingReview(review);
    setReplyText(review.seller_response || '');
    setReplyModalVisible(true);
  };

  const handleSaveReply = async () => {
    if (!replyingReview || !replyText.trim()) return;
    setReplySaving(true);
    try {
      if (replyingReview.seller_response) {
        await editReviewReply(replyingReview.id, replyText.trim());
      } else {
        await replyToReview(replyingReview.id, replyText.trim());
      }
      toast.show({ kind: 'success', title: 'Reply saved' });
      setReplyModalVisible(false);
      setReplyingReview(null);
      setReplyText('');
      void fetchSellerData(true);
    } catch (e: any) {
      toast.error('Could not save reply', e?.message || 'Please try again.');
    } finally {
      setReplySaving(false);
    }
  };

  const avgRating = reviewStats?.avg_rating
    ? Number(reviewStats.avg_rating).toFixed(1)
    : reviews.length > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
      : '0';

  const memberSince = (seller as any)?.created_at
    ? new Date((seller as any).created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '';

  const tier = seller?.seller_tier || 'casual';
  const isBusinessMode = tier === 'business' && seller?.use_store_identity;
  const displayName = isBusinessMode ? seller?.store_name || getDisplayName(seller) : getDisplayName(seller);
  const locationCity = seller?.show_public_city !== false ? ((seller as any)?.location_city || '') : '';
  const isBuyerProfile = seller?.role !== 'seller' && products.length === 0;

  const ratingBuckets = [5, 4, 3, 2, 1].map(s => {
    const count = reviewStats?.breakdown?.[s] ?? reviews.filter(r => r.rating === s).length;
    const total = reviewStats?.review_count || reviews.length;
    return {
      star: s,
      count,
      pct: total > 0 ? (count / total) * 100 : 0,
    };
  });

  const pinnedProduct = (seller as any)?.pinned_product || null;
  // If pinned product is present, exclude it from main masonry grid to prevent duplicate display
  const gridProducts = pinnedProduct ? products.filter(p => p.id !== pinnedProduct.id) : products;

  if (loading && !seller) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top + SPACING.md }]}>
        <View style={styles.skeletonTopBar} />
        <View style={styles.skeletonRow}>
          <View style={styles.skeletonAvatar} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={styles.skeletonLine80} />
            <View style={styles.skeletonLine50} />
            <View style={styles.skeletonLine50} />
          </View>
        </View>
        <View style={styles.skeletonLine20} />
        <View style={styles.skeletonLine14} />
        <View style={styles.skeletonRow2} />
        <View style={styles.skeletonRow2} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        key={activeTab}
        data={activeTab === 'reviews' ? reviews as any : []}
        numColumns={1}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
        keyExtractor={item => item.id}
        ListHeaderComponent={
          <View>
            {/* ── Hero / Profile header ── */}
            <View style={styles.hero}>
              {/* Top bar — floats over hero */}
              <View style={[styles.topBar, { paddingTop: insets.top + SPACING.sm }]}>
                <BackButton
                  onPress={() => navigation.goBack()}
                  style={styles.backBtn}
                />

                <View style={styles.topBarNameWrap}>
                  <Text style={styles.topBarName} numberOfLines={1}>{seller?.username || 'seller'}</Text>
                  {(tier === 'verified' || tier === 'business') && (
                    <Icon name="verified" size={18} color={tier === 'business' ? COLORS.coral : COLORS.blue} />
                  )}
                </View>

                {!isOwnProfile ? (
                  <TouchableOpacity
                    style={styles.overflowBtn}
                    onPress={() => setOverflowMenuVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel="more options"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialCommunityIcons name="dots-horizontal" size={24} color={COLORS.text} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.overflowPlaceholder} />
                )}
              </View>

              {/* Avatar + Stats row */}
              <View style={[styles.avatarRow, { paddingTop: insets.top + 54 }]}>
                <UserAvatar seller={seller} size={76} animated={true} />

                <View style={styles.statsRow}>
                  {!isBuyerProfile && (
                    <View style={styles.stat}>
                      <Text style={styles.statNum}>{products.length}</Text>
                      <Text style={styles.statLabel}>{t('storefront.products')}</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.stat}
                    disabled={seller?.hide_follower_lists}
                    onPress={() => !seller?.hide_follower_lists && navigation.navigate('FollowList', { userId: sellerId, kind: 'followers', title: t('storefront.followers') })}
                  >
                    <Text style={styles.statNum}>{seller?.hide_follower_counts ? '—' : followerCount}</Text>
                    <Text style={styles.statLabel}>{t('storefront.followers')}</Text>
                  </TouchableOpacity>
                  {!isBuyerProfile && (
                    <View style={styles.stat}>
                      <Text style={styles.statNum}>{avgRating}</Text>
                      <Text style={styles.statLabel}>{t('storefront.rating')}</Text>
                    </View>
                  )}
                  {!isBuyerProfile && (
                    <View style={styles.stat}>
                      <Text style={styles.statNum}>{(seller as any)?.sales_count ?? 0}</Text>
                      <Text style={styles.statLabel}>Sales</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Name + bio */}
              <View style={styles.nameBioBlock}>
                <Text style={styles.displayName}>{displayName}</Text>
                {seller?.show_real_name && seller?.full_name && !isBusinessMode && (
                  <View style={styles.realNameRow}>
                    <Icon name="verified" size={11} color={COLORS.green} />
                    <Text style={styles.realNameText}>{seller.full_name}</Text>
                  </View>
                )}
                {seller?.bio ? (
                  <Text style={styles.bio}>{seller.bio}</Text>
                ) : null}
                {memberSince ? <Text style={styles.memberSince}>Member since {memberSince}</Text> : null}
              </View>

              {/* Trust chips */}
              <View style={styles.trustChipsRow}>
                {tier === 'verified' && (
                  <View style={[styles.trustChip, { backgroundColor: COLORS.blue + '18', borderColor: COLORS.blue + '40' }]}>
                    <Icon name="verified" size={12} color={COLORS.blue} />
                    <Text style={[styles.trustChipText, { color: COLORS.blue }]}>Verified Seller</Text>
                  </View>
                )}
                {tier === 'business' && (
                  <View style={[styles.trustChip, { backgroundColor: COLORS.coral + '18', borderColor: COLORS.coral + '40' }]}>
                    <Icon name="verified" size={12} color={COLORS.coral} />
                    <Text style={[styles.trustChipText, { color: COLORS.coral }]}>Business</Text>
                  </View>
                )}
                {locationCity ? (
                  <View style={[styles.trustChip, { backgroundColor: COLORS.green + '18', borderColor: COLORS.green + '40' }]}>
                    <MaterialCommunityIcons name="map-marker-outline" size={12} color={COLORS.green} />
                    <Text style={[styles.trustChipText, { color: COLORS.green }]}>{locationCity}</Text>
                  </View>
                ) : null}
              </View>

              {/* Trust line for business */}
              {isBusinessMode && seller?.username && (
                <View style={styles.trustLine}>
                  <Icon name="verified" size={11} color={COLORS.green} />
                  <Text style={styles.trustLineText}>Operated by <Text style={{ color: COLORS.text, fontWeight: '700' }}>{seller.username}</Text> · Verified identity on file</Text>
                </View>
              )}

              {/* Expandable About Store section */}
              {(seller?.store_description || seller?.store_category || seller?.store_service_area) ? (
                <View style={styles.aboutCard}>
                  <TouchableOpacity
                    style={styles.aboutHeader}
                    onPress={() => setAboutExpanded(prev => !prev)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="toggle store details"
                  >
                    <View style={styles.aboutHeaderLeft}>
                      <MaterialCommunityIcons name="storefront-outline" size={16} color={COLORS.coral} />
                      <Text style={styles.aboutTitle}>About Store</Text>
                      {seller.store_category ? (
                        <View style={styles.categoryBadge}>
                          <Text style={styles.categoryBadgeText}>{seller.store_category}</Text>
                        </View>
                      ) : null}
                    </View>
                    <MaterialCommunityIcons
                      name={aboutExpanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={COLORS.text2}
                    />
                  </TouchableOpacity>

                  {aboutExpanded && (
                    <View style={styles.aboutBody}>
                      {seller.store_description ? (
                        <Text style={styles.aboutDescription}>{seller.store_description}</Text>
                      ) : null}
                      {seller.store_service_area ? (
                        <View style={styles.serviceAreaRow}>
                          <MaterialCommunityIcons name="map-marker-radius-outline" size={14} color={COLORS.text2} />
                          <Text style={styles.serviceAreaText}>Service Area: <Text style={{ color: COLORS.text }}>{seller.store_service_area}</Text></Text>
                        </View>
                      ) : null}
                    </View>
                  )}
                </View>
              ) : null}

              {/* Follow + Message buttons */}
              {store.isLoggedIn && !isOwnProfile && (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.followBtn, store.isFollowing(sellerId) && styles.followBtnActive, followLoading && styles.actionDisabled]}
                    onPress={handleFollow}
                    disabled={followLoading}
                    activeOpacity={0.7}
                    accessibilityLabel={store.isFollowing(sellerId) ? 'unfollow seller' : 'follow seller'}
                    accessibilityRole="button"
                  >
                    {followLoading ? (
                      <ActivityIndicator size="small" color={COLORS.white} />
                    ) : (
                      <>
                        <MaterialCommunityIcons name={store.isFollowing(sellerId) ? 'heart' : 'heart-outline'} size={17} color={store.isFollowing(sellerId) ? COLORS.white : COLORS.coral} />
                        <Text style={[styles.followBtnText, store.isFollowing(sellerId) && styles.followBtnTextActive]}>
                          {store.isFollowing(sellerId) ? t('storefront.following') : t('storefront.follow')}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.msgBtn, messageLoading && styles.actionDisabled]}
                    onPress={handleMessage}
                    disabled={messageLoading}
                    activeOpacity={0.7}
                    accessibilityLabel="message seller"
                    accessibilityRole="button"
                  >
                    {messageLoading ? (
                      <ActivityIndicator size="small" color={COLORS.blue} />
                    ) : (
                      <>
                        <Icon name="message" size={17} color={COLORS.blue} />
                        <Text style={styles.msgBtnText}>{t('storefront.message')}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* ── Tab bar ── */}
            <View style={styles.tabBar}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'listings' && styles.tabActive]}
                onPress={() => setActiveTab('listings')}
                accessibilityRole="button"
                accessibilityLabel="listings"
                accessibilityState={{ selected: activeTab === 'listings' }}
              >
                <Icon name="storefront" size={22} color={activeTab === 'listings' ? COLORS.text : COLORS.text2} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'reviews' && styles.tabActive]}
                onPress={() => setActiveTab('reviews')}
                accessibilityRole="button"
                accessibilityLabel="reviews"
                accessibilityState={{ selected: activeTab === 'reviews' }}
              >
                <Icon name="rate-this" size={22} color={activeTab === 'reviews' ? COLORS.text : COLORS.text2} />
              </TouchableOpacity>
            </View>

            {/* ── Pinned listing spotlight ── */}
            {activeTab === 'listings' && pinnedProduct && (
              <View style={styles.pinnedSection}>
                <View style={styles.pinnedHeader}>
                  <MaterialCommunityIcons name="pin" size={14} color={COLORS.coral} />
                  <Text style={styles.pinnedTitle}>Pinned Listing</Text>
                </View>
                <TouchableOpacity
                  style={styles.pinnedCard}
                  onPress={() => navigation.navigate('ProductDetail', { productId: pinnedProduct.id })}
                  activeOpacity={0.8}
                >
                  {pinnedProduct.image_url ? (
                    <ExpoImage source={{ uri: pinnedProduct.image_url }} style={styles.pinnedImg} contentFit="cover" />
                  ) : (
                    <View style={styles.pinnedImgPlaceholder}>
                      <MaterialCommunityIcons name="image-outline" size={24} color={COLORS.text3} />
                    </View>
                  )}
                  <View style={styles.pinnedContent}>
                    <Text style={styles.pinnedName} numberOfLines={2}>{pinnedProduct.name}</Text>
                    <Text style={styles.pinnedPrice}>{formatPrice(pinnedProduct.price)}</Text>
                    {pinnedProduct.condition ? (
                      <Text style={styles.pinnedCondition}>{pinnedProduct.condition}</Text>
                    ) : null}
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.text2} />
                </TouchableOpacity>
              </View>
            )}

            {/* ── Reviews header (shown when reviews tab active) ── */}
            {activeTab === 'reviews' && reviews.length > 0 && (
              <View style={styles.ratingSummary}>
                <View style={styles.ratingSummaryLeft}>
                  <Text style={styles.ratingBig}>{avgRating}</Text>
                  <View style={styles.ratingStarsRow}>
                    {[1, 2, 3, 4, 5].map(s => (
                      <Icon key={s} name={s <= Math.round(parseFloat(avgRating)) ? 'rating' : 'rate-this'} size={13} color={s <= Math.round(parseFloat(avgRating)) ? COLORS.yellow : COLORS.text2} />
                    ))}
                  </View>
                  <Text style={styles.ratingCount}>{reviews.length} reviews</Text>
                </View>
                <View style={styles.ratingSummaryRight}>
                  {ratingBuckets.map(({ star, count, pct }) => (
                    <View key={star} style={styles.ratingBarRow}>
                      <Text style={styles.ratingBarLabel}>{star}★</Text>
                      <View style={styles.ratingBarTrack}>
                        <View style={[styles.ratingBarFill, { width: \`\${pct}%\` }]} />
                      </View>
                      <Text style={styles.ratingBarCount}>{count}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* ── Listings masonry / skeleton ── */}
            {activeTab === 'listings' && loading ? (
              <View style={styles.masonryGrid}>
                <View style={styles.masonryCol}>
                  <View style={[styles.card, { height: 180, backgroundColor: COLORS.surface2 }]} />
                  <View style={[styles.card, { height: 220, backgroundColor: COLORS.surface2 }]} />
                </View>
                <View style={styles.masonryCol}>
                  <View style={[styles.card, { height: 220, backgroundColor: COLORS.surface2 }]} />
                  <View style={[styles.card, { height: 180, backgroundColor: COLORS.surface2 }]} />
                </View>
              </View>
            ) : activeTab === 'listings' && gridProducts.length > 0 ? (
              <MasonryGrid
                products={gridProducts}
                standalone={false}
                columnGap={GRID_GAP}
                sidePad={0}
                onPress={(item) => navigation.navigate('ProductDetail', { productId: item.id })}
              />
            ) : null}
          </View>
        }
        renderItem={(({ item }: { item: Review }) => (
          <View style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
              <View style={styles.reviewAvatar}>
                <Text style={styles.reviewAvatarText}>{(item.reviewer?.username || 'A').charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.reviewInfo}>
                <Text style={styles.reviewName} numberOfLines={1}>{item.reviewer?.username || 'Anonymous'}</Text>
                <View style={styles.reviewStars}>
                  {[1, 2, 3, 4, 5].map(s => (
                    <Icon key={s} name={s <= item.rating ? 'rating' : 'rate-this'} size={11} color={s <= item.rating ? COLORS.yellow : COLORS.text2} />
                  ))}
                </View>
              </View>
              <Text style={styles.reviewDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
              {!isOwnProfile && (
                <TouchableOpacity
                  style={styles.reviewReportBtn}
                  onPress={() => handleReportReview(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="report review"
                >
                  <MaterialCommunityIcons name="flag-outline" size={15} color={COLORS.text3} />
                </TouchableOpacity>
              )}
            </View>
            {item.comment && <Text style={styles.reviewComment}>{item.comment}</Text>}
            
            {/* Seller response */}
            {item.seller_response ? (
              <View style={styles.sellerResponse}>
                <View style={styles.sellerResponseHeader}>
                  <Text style={styles.sellerResponseLabel}>{displayName} replied:</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {isOwnProfile ? (
                      <TouchableOpacity
                        onPress={() => openReplyModal(item)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityLabel="edit reply"
                      >
                        <MaterialCommunityIcons name="pencil-outline" size={14} color={COLORS.blue} />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        onPress={() => handleReportReply(item)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityLabel="report reply"
                      >
                        <MaterialCommunityIcons name="flag-outline" size={13} color={COLORS.text3} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                <Text style={styles.sellerResponseText}>{item.seller_response}</Text>
              </View>
            ) : isOwnProfile ? (
              <TouchableOpacity
                style={styles.replyActionBtn}
                onPress={() => openReplyModal(item)}
              >
                <MaterialCommunityIcons name="reply" size={14} color={COLORS.blue} />
                <Text style={styles.replyActionText}>Reply to review</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )) as any}
        ListEmptyComponent={
          (activeTab === 'listings' && gridProducts.length === 0 && !pinnedProduct) || (activeTab === 'reviews' && reviews.length === 0) ? (
            <EmptyState
              icon={activeTab === 'listings' ? 'storefront-outline' : 'star-outline'}
              title={activeTab === 'listings' ? (isBuyerProfile ? 'No listings' : t('storefront.noProducts')) : 'No reviews yet'}
              hint={isBuyerProfile ? 'This user has not listed any items for sale.' : undefined}
            />
          ) : null
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await fetchSellerData(true); setRefreshing(false); }} tintColor={COLORS.coral} />}
      />

      {/* ── Overflow Menu Modal (Report Profile / Block User) ── */}
      <Modal visible={overflowMenuVisible} transparent animationType="fade" onRequestClose={() => setOverflowMenuVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setOverflowMenuVisible(false)}>
          <View style={[styles.overflowSheet, { paddingBottom: Math.max(20, insets.bottom + 12) }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Profile Options</Text>

            <TouchableOpacity style={styles.sheetRow} onPress={handleReportUser}>
              <MaterialCommunityIcons name="flag-outline" size={20} color={COLORS.text} />
              <Text style={styles.sheetRowText}>Report Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetRow} onPress={handleBlockUser}>
              <MaterialCommunityIcons name="account-cancel-outline" size={20} color={COLORS.coral} />
              <Text style={[styles.sheetRowText, { color: COLORS.coral }]}>Block User</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.sheetRow, styles.sheetCancelRow]} onPress={() => setOverflowMenuVisible(false)}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* ── Seller Reply Modal ── */}
      <Modal visible={replyModalVisible} transparent animationType="slide" onRequestClose={() => setReplyModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setReplyModalVisible(false)}>
          <Pressable style={[styles.replySheet, { paddingBottom: Math.max(20, insets.bottom + 12) }]} onPress={e => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.replySheetTitle}>
              {replyingReview?.seller_response ? 'Edit Public Reply' : 'Public Reply to Review'}
            </Text>
            <Text style={styles.replySheetHint}>
              Your response will be visible publicly on your storefront.
            </Text>

            <TextInput
              style={styles.replyInput}
              value={replyText}
              onChangeText={setReplyText}
              placeholder="Write a professional, helpful response..."
              placeholderTextColor={COLORS.text3}
              multiline
              maxLength={1000}
              autoFocus
            />
            <Text style={styles.replyCounter}>{replyText.length}/1000</Text>

            <View style={styles.replyModalActions}>
              <TouchableOpacity
                style={styles.replyCancelBtn}
                onPress={() => setReplyModalVisible(false)}
                disabled={replySaving}
              >
                <Text style={styles.replyCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.replySubmitBtn, (!replyText.trim() || replySaving) && styles.actionDisabled]}
                onPress={handleSaveReply}
                disabled={!replyText.trim() || replySaving}
              >
                {replySaving ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Text style={styles.replySubmitText}>Post Reply</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Report Modal ── */}
      <ReportModal
        visible={reportModalVisible}
        targetType={reportTarget.targetType}
        targetId={reportTarget.targetId}
        targetName={reportTarget.targetName}
        onClose={() => setReportModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loadingContainer: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 60, paddingHorizontal: SPACING.md },
  content: {},

  /* Top bar — floats over hero */
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm,
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topBarNameWrap: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, justifyContent: 'center' },
  topBarName: { fontSize: 18, fontWeight: '800', color: COLORS.text, maxWidth: 200 },
  overflowBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  overflowPlaceholder: { width: 44, height: 44 },

  /* Hero */
  hero: { backgroundColor: COLORS.surface, paddingBottom: SPACING.lg },

  avatarRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },

  statsRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  stat: { alignItems: 'center', minWidth: 44, minHeight: 44, justifyContent: 'center' },
  statNum: { fontSize: 17, fontWeight: '800', color: COLORS.text, lineHeight: 22 },
  statLabel: { fontSize: 11, color: COLORS.text2, marginTop: 2 },

  nameBioBlock: { paddingHorizontal: SPACING.lg, paddingTop: 12 },
  displayName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  realNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  realNameText: { fontSize: 11.5, color: COLORS.text2 },
  bio: { fontSize: 13, color: COLORS.text2, lineHeight: 20, marginTop: 6 },
  memberSince: { fontSize: 11, color: COLORS.text2, opacity: 0.65, marginTop: 4 },

  trustChipsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    paddingHorizontal: SPACING.lg, paddingTop: 10,
  },
  trustChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6,
    borderWidth: 1,
  },
  trustChipText: { fontSize: 11, fontWeight: '700' },

  trustLine: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: SPACING.lg, paddingTop: 8,
  },
  trustLineText: { fontSize: 11.5, color: COLORS.text2 },

  /* About Card */
  aboutCard: {
    marginHorizontal: SPACING.lg, marginTop: 12,
    backgroundColor: COLORS.surface2, borderRadius: RADIUS.card,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
  },
  aboutHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10, minHeight: 44,
  },
  aboutHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  aboutTitle: { fontSize: 12.5, fontWeight: '700', color: COLORS.text },
  categoryBadge: {
    backgroundColor: COLORS.surface, paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border,
  },
  categoryBadgeText: { fontSize: 10.5, color: COLORS.text2, fontWeight: '600' },
  aboutBody: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  aboutDescription: { fontSize: 12.5, color: COLORS.text2, lineHeight: 18 },
  serviceAreaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  serviceAreaText: { fontSize: 11.5, color: COLORS.text2 },

  /* Action Buttons */
  actionRow: { flexDirection: 'row', gap: 8, paddingHorizontal: SPACING.lg, paddingTop: 14 },

  followBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: RADIUS.button,
    backgroundColor: COLORS.coral, minHeight: 44,
  },
  followBtnActive: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: COLORS.coral },
  followBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 14 },
  followBtnTextActive: { color: COLORS.coral },
  actionDisabled: { opacity: 0.55 },

  msgBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: RADIUS.button,
    borderWidth: 1.5, borderColor: COLORS.blue, minHeight: 44,
  },
  msgBtnText: { color: COLORS.blue, fontWeight: '700', fontSize: 14 },

  /* Tabs */
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  tab: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: 'transparent',
    minHeight: 44,
  },
  tabActive: { borderBottomColor: COLORS.text },

  /* Pinned Section */
  pinnedSection: {
    marginHorizontal: SPACING.md, marginTop: SPACING.md, marginBottom: 4,
  },
  pinnedHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  pinnedTitle: { fontSize: 12, fontWeight: '700', color: COLORS.coral, textTransform: 'uppercase', letterSpacing: 0.5 },
  pinnedCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, padding: 10, borderRadius: RADIUS.card,
    borderWidth: 1, borderColor: COLORS.coral + '40',
  },
  pinnedImg: { width: 56, height: 56, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface2 },
  pinnedImgPlaceholder: { width: 56, height: 56, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center' },
  pinnedContent: { flex: 1, gap: 2 },
  pinnedName: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  pinnedPrice: { fontSize: 13, fontWeight: '800', color: COLORS.coral },
  pinnedCondition: { fontSize: 11, color: COLORS.text2 },

  /* Rating Summary */
  ratingSummary: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.card, marginHorizontal: SPACING.md, marginTop: SPACING.md,
    padding: 14,
  },
  ratingSummaryLeft: { alignItems: 'center', minWidth: 60 },
  ratingBig: { fontSize: 36, fontWeight: '800', color: COLORS.text, lineHeight: 40 },
  ratingStarsRow: { flexDirection: 'row', gap: 1, marginTop: 4 },
  ratingCount: { fontSize: 11, color: COLORS.text2, marginTop: 4 },
  ratingSummaryRight: { flex: 1, gap: 3 },
  ratingBarRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingBarLabel: { fontSize: 10, color: COLORS.text2, width: 18 },
  ratingBarTrack: { flex: 1, height: 5, borderRadius: 99, backgroundColor: COLORS.surface2, overflow: 'hidden' },
  ratingBarFill: { height: '100%', backgroundColor: COLORS.yellow, borderRadius: 99 },
  ratingBarCount: { fontSize: 10, color: COLORS.text3, width: 18, textAlign: 'right' },

  /* Grid */
  masonryGrid: { flexDirection: 'row', gap: 3 },
  masonryCol: { flex: 1, gap: 3 },
  card: {
    borderRadius: RADIUS.row, overflow: 'hidden',
    backgroundColor: COLORS.surface2, marginBottom: 3,
  },

  /* Reviews */
  reviewCard: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.sm, padding: 14,
    borderRadius: RADIUS.card, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  reviewAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.coral, justifyContent: 'center', alignItems: 'center' },
  reviewAvatarText: { color: COLORS.white, fontSize: 13, fontWeight: '700' },
  reviewInfo: { flex: 1 },
  reviewName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  reviewStars: { flexDirection: 'row', gap: 2, marginTop: 2 },
  reviewDate: { fontSize: 11, color: COLORS.text2 },
  reviewReportBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  reviewComment: { fontSize: 13, color: COLORS.text2, lineHeight: 18 },

  sellerResponse: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  sellerResponseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  sellerResponseLabel: { fontSize: 11, color: COLORS.blue, fontWeight: '700' },
  sellerResponseText: { fontSize: 12, color: COLORS.text2, lineHeight: 18 },

  replyActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8,
    alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 8,
    borderRadius: RADIUS.sm, backgroundColor: COLORS.surface2,
  },
  replyActionText: { fontSize: 11, color: COLORS.blue, fontWeight: '600' },

  /* Overflow Sheet */
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  overflowSheet: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.modal, borderTopRightRadius: RADIUS.modal,
    paddingHorizontal: SPACING.lg, paddingTop: 12,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border,
    alignSelf: 'center', marginBottom: 12,
  },
  sheetTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 12, textAlign: 'center' },
  sheetRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, minHeight: 48, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  sheetRowText: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  sheetCancelRow: { borderBottomWidth: 0, justifyContent: 'center', marginTop: 4 },
  sheetCancelText: { fontSize: 15, fontWeight: '700', color: COLORS.text2, textAlign: 'center' },

  /* Reply Sheet */
  replySheet: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.modal, borderTopRightRadius: RADIUS.modal,
    paddingHorizontal: SPACING.lg, paddingTop: 12,
  },
  replySheetTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  replySheetHint: { fontSize: 12, color: COLORS.text2, textAlign: 'center', marginTop: 4, marginBottom: 12 },
  replyInput: {
    minHeight: 100, maxHeight: 160, backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.card, padding: 12, color: COLORS.text,
    fontSize: 14, textAlignVertical: 'top', borderWidth: 1, borderColor: COLORS.border,
  },
  replyCounter: { fontSize: 11, color: COLORS.text3, textAlign: 'right', marginTop: 4, marginBottom: 12 },
  replyModalActions: { flexDirection: 'row', gap: 12 },
  replyCancelBtn: {
    flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center',
    borderRadius: RADIUS.button, backgroundColor: COLORS.surface2,
  },
  replyCancelText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  replySubmitBtn: {
    flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center',
    borderRadius: RADIUS.button, backgroundColor: COLORS.coral,
  },
  replySubmitText: { fontSize: 14, fontWeight: '700', color: COLORS.white },

  /* Skeleton */
  skeletonTopBar: { height: 50, backgroundColor: COLORS.surface2, marginBottom: 16 },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  skeletonAvatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: COLORS.surface2 },
  skeletonLine80: { width: '80%', height: 16, borderRadius: 4, backgroundColor: COLORS.surface2 },
  skeletonLine50: { width: '50%', height: 12, borderRadius: 4, backgroundColor: COLORS.surface2 },
  skeletonLine20: { width: 120, height: 20, borderRadius: 4, backgroundColor: COLORS.surface2, marginTop: 12 },
  skeletonLine14: { width: 80, height: 14, borderRadius: 4, backgroundColor: COLORS.surface2, marginTop: 8 },
  skeletonRow2: { flexDirection: 'row', gap: 8, marginTop: 20 },
});
`;

fs.writeFileSync(targetPath, content, 'utf8');
console.log('StorefrontScreen.tsx updated successfully');
