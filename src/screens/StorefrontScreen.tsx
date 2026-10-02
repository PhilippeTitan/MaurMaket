import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl,
  Alert, Modal, Pressable,
} from 'react-native';
import { Icon } from '../components/icons/Icon';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS, TOUCH, FONTS, getDisplayName, getSellerAvatar } from '../theme';
import {
  getSellerProfile, getSellerReviews, toggleFollow, getFollowerCount,
  createConversation, getConversations, blockUser,
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
import { cacheKeys, readSnapshot, writeSnapshot } from '../offlineCache';
import { network } from '../network';
import { useSavedListings, useReduceMotion } from '../hooks';
import {
  ProfileActions, ProfileTrustRow, ProfileTabs, ProfileStickyBar, ProfileReviews,
  ProfileSkeleton, FeaturedListingCard, CategoryFilterRow, SaveChip, StaleNotice,
  useProfileCollapse, useProfileLayout,
  PROFILE_GRID_GAP, PROFILE_PAD, PROFILE_STICKY_ROW,
} from '../components/profile';
import type { ProfileTabItem } from '../components/profile';

type Props = NativeStackScreenProps<RootStackParamList, 'Storefront'>;
type Tab = 'listings' | 'reviews';

const STOREFRONT_CACHE_TTL = 60_000;
const storefrontCache: Record<string, { data: any; timestamp: number }> = {};

type ReviewStats = { avg_rating?: number | string; review_count?: number | string; breakdown?: Record<string, number> };
type StorefrontSnapshot = {
  kind: 'storefront';
  seller: SellerProfile;
  products: Product[];
  reviews: Review[];
  reviewStats: ReviewStats | null;
  followerCount: number | null;
  salesCount: number | null;
};

/** Category label for a product — the list endpoints return the name as a string. */
function categoryOf(product: Product): string | null {
  const raw = (product as any).category;
  if (typeof raw === 'string' && raw) return raw;
  if (raw && typeof raw === 'object' && typeof raw.name === 'string') return raw.name;
  return null;
}

export default function StorefrontScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const { columns, containerWidth, gridWidth } = useProfileLayout();
  const scrollRef = useRef<ScrollView>(null);

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
    } as any) : null,
  );
  const [products, setProducts] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);
  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const [salesCount, setSalesCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [stale, setStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [messageLoading, setMessageLoading] = useState(false);
  const [rawTab, setRawTab] = useState<Tab>('listings');
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [tabBarY, setTabBarY] = useState(0);
  const [overflowMenuVisible, setOverflowMenuVisible] = useState(false);

  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportTarget, setReportTarget] = useState<{
    targetType: 'profile' | 'review' | 'reply';
    targetId: string;
    targetName?: string;
  }>({ targetType: 'profile', targetId: sellerId });

  // The store holds follow state; re-render when it changes so Follow flips instantly.
  const [, setStoreTick] = useState(0);
  useEffect(() => store.onChange(() => setStoreTick((tick) => tick + 1)), []);

  const isOwnProfile = store.user?.id === sellerId;
  // Only an explicitly-known buyer gets the minimal buyer treatment: a seller
  // with an empty catalog still shows her trust signals and quiet empty state.
  const isBuyerProfile = seller?.role === 'buyer' && products.length === 0;

  const tier = seller?.seller_tier || 'casual';
  const avatarTier = tier === 'verified' || tier === 'business' ? tier : 'casual';
  const avatarSeller = seller
    ? { ...seller, seller_tier: isBuyerProfile ? undefined : avatarTier }
    : null;
  const isBusinessMode = tier === 'business' && !!seller?.use_store_identity;
  const username = seller?.username || '';
  const fullName = seller?.full_name?.trim().replace(/\s+/g, ' ') || '';
  const storeName = (seller?.store_name || '').trim().replace(/\s+/g, ' ');
  const publicName = seller?.show_real_name ? fullName : '';
  const profileName = isBusinessMode ? (storeName || publicName || username) : (publicName || username);
  const displayedName = profileName || username || t('common.seller');
  const displayName = displayedName;
  const isVerified = tier === 'verified' || tier === 'business';
  const locationCity = seller?.show_public_city !== false ? ((seller as any)?.location_city || '') : '';
  const serviceArea = (seller?.store_service_area || '') as string;
  const memberSince = (seller as any)?.created_at
    ? new Date((seller as any).created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '';

  const tabs = useMemo<ProfileTabItem[]>(
    () => [
      { key: 'listings', label: t('profile.listings') },
      { key: 'reviews', label: t('common.reviews') },
    ],
    [t],
  );
  const activeTab = tabs.some((tab) => tab.key === rawTab) ? rawTab : 'listings';

  const contentTopPad = insets.top + PROFILE_STICKY_ROW + SPACING.md;
  const { onScroll, collapse, collapsed, chrome, scrolled } = useProfileCollapse(
    tabBarY > 0 ? contentTopPad + tabBarY : 0,
    insets.top + PROFILE_STICKY_ROW,
  );

  const applySnapshot = useCallback((snapshot: StorefrontSnapshot) => {
    if (snapshot.seller) setSeller(snapshot.seller);
    setProducts(snapshot.products || []);
    setReviews(snapshot.reviews || []);
    setReviewStats(snapshot.reviewStats || null);
    if (typeof snapshot.followerCount === 'number') setFollowerCount(snapshot.followerCount);
    if (typeof snapshot.salesCount === 'number') setSalesCount(snapshot.salesCount);
    setHasData(true);
  }, []);

  const fetchSellerData = useCallback(async (force = false) => {
    const cached = storefrontCache[sellerId];
    if (!force && cached && Date.now() - cached.timestamp < STOREFRONT_CACHE_TTL) {
      applySnapshot({ kind: 'storefront', ...cached.data });
      setLoading(false);
      return;
    }

    let usedSnapshot = false;
    if (!force) {
      const snapshot = await readSnapshot<StorefrontSnapshot>(cacheKeys.seller(sellerId));
      if (snapshot?.value?.kind === 'storefront') {
        usedSnapshot = true;
        applySnapshot(snapshot.value);
        if (snapshot.isStale || !network.isOnline) setStale(true);
      }
    }

    try {
      const [sellerRes, prodRes, revRes, followingRes] = await Promise.all([
        getSellerProfile(sellerId) as Promise<{ seller: SellerProfile }>,
        import('../api').then((m) => m.getProducts({ seller: sellerId, limit: '50' })) as Promise<{ products: Product[] }>,
        getSellerReviews(sellerId) as Promise<{ reviews: Review[]; stats?: ReviewStats }>,
        store.isLoggedIn
          ? import('../api').then((m) => m.getFollowing()) as Promise<{ following?: Array<{ seller_id?: string; id?: string }> }>
          : Promise.resolve({ following: [] }),
      ]);

      const fetchedSeller = sellerRes.seller;
      const visibleProducts = (prodRes.products || []).filter((p) => p.is_available !== false);
      const fetchedReviews = (revRes.reviews || []).map((r: any) => ({
        ...r,
        reviewer: r.reviewer || {
          full_name: r.reviewer_name,
          avatar_url: r.reviewer_avatar,
          username: r.reviewer_username,
        },
      }));
      const stats = revRes.stats || null;
      const followIds = (followingRes.following || [])
        .map((f) => f.seller_id || f.id)
        .filter(Boolean) as string[];
      store.setFollowingList(followIds);

      setSeller(fetchedSeller);
      setProducts(visibleProducts);
      setReviews(fetchedReviews);
      setReviewStats(stats);
      setSalesCount(typeof fetchedSeller.sales_count === 'number' ? fetchedSeller.sales_count : null);

      let nextFollowerCount: number | null = null;
      try {
        const countRes = (await getFollowerCount(sellerId)) as { count: number };
        const raw = countRes?.count ?? fetchedSeller.followers_count ?? 0;
        nextFollowerCount = fetchedSeller.hide_follower_counts ? null : raw;
      } catch {
        nextFollowerCount = null; // hidden rather than shown as zero
      }
      setFollowerCount(nextFollowerCount);

      setStale(false);
      setHasData(true);

      const snapshot: StorefrontSnapshot = {
        kind: 'storefront',
        seller: fetchedSeller,
        products: visibleProducts,
        reviews: fetchedReviews,
        reviewStats: stats,
        followerCount: nextFollowerCount,
        salesCount: typeof fetchedSeller.sales_count === 'number' ? fetchedSeller.sales_count : null,
      };
      storefrontCache[sellerId] = {
        timestamp: Date.now(),
        data: {
          seller: fetchedSeller,
          products: visibleProducts,
          reviews: fetchedReviews,
          reviewStats: stats,
          followerCount: nextFollowerCount,
          salesCount: snapshot.salesCount,
        },
      };
      void writeSnapshot(cacheKeys.seller(sellerId), snapshot);
    } catch {
      if (usedSnapshot || !network.isOnline) setStale(true);
      else toast.error(t('storefront.loadFailed'), t('feedback.connectionRetry'), () => fetchSellerData(true));
    }
    setLoading(false);
  }, [sellerId, applySnapshot, toast, t]);

  useFocusEffect(useCallback(() => { fetchSellerData(); }, [fetchSellerData]));

  // Refresh quietly once connectivity returns.
  useEffect(() => {
    const unsub = network.onChange((online) => { if (online) void fetchSellerData(true); });
    return unsub;
  }, [fetchSellerData]);

  const handleTabChange = useCallback((key: string) => {
    setRawTab(key as Tab);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const handleFollow = useCallback(async () => {
    if (followLoading) return;
    const wasFollowing = store.isFollowing(sellerId);
    const previousCount = followerCount ?? 0;
    setFollowLoading(true);
    store.toggleFollowing(sellerId, !wasFollowing);
    if (!wasFollowing && followerCount !== null) setFollowerCount(previousCount + 1);
    else if (wasFollowing && followerCount !== null) setFollowerCount(Math.max(0, previousCount - 1));
    try {
      const res = (await toggleFollow(sellerId)) as { following: boolean };
      store.toggleFollowing(sellerId, res.following);
      if (followerCount !== null) {
        setFollowerCount(Math.max(0, previousCount + (res.following ? 1 : 0) - (wasFollowing ? 1 : 0)));
      }
    } catch {
      store.toggleFollowing(sellerId, wasFollowing);
      if (followerCount !== null) setFollowerCount(previousCount);
      toast.error(t('storefront.followFailed'), t('storefront.followUnavailable'), handleFollow);
    }
    setFollowLoading(false);
  }, [followLoading, sellerId, followerCount, toast, t]);

  const handleMessage = useCallback(async () => {
    if (!store.user || messageLoading) return;
    setMessageLoading(true);
    try {
      const chatParams = {
        otherUserName: getDisplayName(seller) || t('common.seller'),
        otherUserId: sellerId,
        otherUserAvatar: getSellerAvatar(seller),
        otherUserStoreLogoUrl: seller?.store_logo_url,
        otherUserUseStoreIdentity: seller?.use_store_identity,
        otherUserTier: seller?.seller_tier,
      };
      const convosRes = (await getConversations()) as { conversations: Array<{ id: string; seller_id?: string; buyer_id?: string }> };
      const existing = (convosRes.conversations || []).find((c) => c.seller_id === sellerId || c.buyer_id === sellerId);
      if (existing) {
        navigation.navigate('Chat', { conversationId: existing.id, ...chatParams });
      } else {
        const res = (await createConversation({ sellerId, productId: products[0]?.id })) as { conversationId: string };
        navigation.navigate('Chat', { conversationId: res.conversationId, ...chatParams });
      }
    } catch (err: unknown) {
      toast.error(t('storefront.messageFailed'), err instanceof Error ? err.message : t('feedback.connectionRetry'), handleMessage);
    }
    setMessageLoading(false);
  }, [sellerId, seller, products, messageLoading, navigation, toast, t]);

  const handleBlockUser = useCallback(() => {
    setOverflowMenuVisible(false);
    Alert.alert(
      t('profile.blockTitle'),
      t('profile.blockBody', { name: seller?.username || t('profile.thisUser') }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.block'),
          style: 'destructive',
          onPress: async () => {
            try {
              await blockUser(sellerId);
              toast.show({ kind: 'info', title: t('profile.blocked') });
              navigation.goBack();
            } catch {
              toast.error(t('profile.blockFailed'), t('feedback.connectionRetry'));
            }
          },
        },
      ],
    );
  }, [seller?.username, sellerId, navigation, toast, t]);

  const handleReportUser = useCallback(() => {
    setOverflowMenuVisible(false);
    setReportTarget({ targetType: 'profile', targetId: sellerId, targetName: displayName });
    setReportModalVisible(true);
  }, [sellerId, seller?.username]);

  const handleReportReview = useCallback((review: Review) => {
    setReportTarget({
      targetType: 'review',
      targetId: review.id,
      targetName: review.reviewer?.username || t('profile.review'),
    });
    setReportModalVisible(true);
  }, [t]);

  const handleReportReply = useCallback((review: Review) => {
    setReportTarget({
      targetType: 'reply',
      targetId: review.id,
      targetName: displayName,
    });
    setReportModalVisible(true);
  }, [seller]);

  const reviewCount = Number(reviewStats?.review_count ?? reviews.length) || 0;
  const averageRating = Number(reviewStats?.avg_rating ?? 0) || 0;

  const pinnedProduct = (seller as any)?.pinned_product || null;
  const gridProducts = useMemo(
    () => (pinnedProduct ? products.filter((p) => p.id !== pinnedProduct.id) : products),
    [products, pinnedProduct?.id],
  );

  const categoryNames = useMemo(() => {
    const names = new Set<string>();
    gridProducts.forEach((p) => {
      const name = categoryOf(p);
      if (name) names.add(name);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [gridProducts]);
  const showCategoryFilters = categoryNames.length >= 2 && gridProducts.length >= 8;

  useEffect(() => {
    if (category && !categoryNames.includes(category)) setCategory(null);
  }, [category, categoryNames]);

  const filteredProducts = useMemo(
    () => (category ? gridProducts.filter((p) => categoryOf(p) === category) : gridProducts),
    [gridProducts, category],
  );

  const productIds = useMemo(() => products.map((p) => p.id), [products]);
  const canSave = store.isLoggedIn && !isOwnProfile;
  const savedListings = useSavedListings(canSave ? productIds : []);

  const showSkeleton = loading && !hasData;

  return (
    <View style={styles.container}>
      <ProfileStickyBar
        collapse={collapse}
        collapsed={collapsed}
        chrome={chrome}
        scrolled={scrolled}
        topInset={insets.top}
        left={<BackButton onPress={() => navigation.goBack()} />}
        avatar={<UserAvatar seller={avatarSeller} size={30} />}
        name={username || displayName}
        verified={isVerified}
        identityLabel={username || displayName}
        onIdentityPress={() => scrollRef.current?.scrollTo({ y: 0, animated: !reduceMotion })}
        right={
          !isOwnProfile ? (
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => setOverflowMenuVisible(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('profile.options')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons name="dots-horizontal" size={22} color={COLORS.text} />
            </TouchableOpacity>
          ) : undefined
        }
        tabs={
          <ProfileTabs variant="sticky" tabs={tabs} active={activeTab} onChange={handleTabChange} />
        }
      />

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: contentTopPad, paddingBottom: insets.bottom + 96 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await fetchSellerData(true); setRefreshing(false); }}
            tintColor={COLORS.coral}
          />
        }
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.column, { width: containerWidth }]}>
          {showSkeleton ? (
            <ProfileSkeleton />
          ) : (
            <>
              {/* ── Compact identity header ── */}
              <View style={styles.identityRow}>
                <UserAvatar seller={avatarSeller} size={76} animated />
                <View style={styles.statsWrap}>
                  <ProfileTrustRow
                    rating={reviewCount > 0 ? averageRating : null}
                    reviewCount={reviewCount > 0 ? reviewCount : null}
                    salesCount={isBuyerProfile ? null : salesCount}
                    followers={isBuyerProfile ? null : followerCount}
                    onFollowersPress={
                      !isBuyerProfile && !seller?.hide_follower_lists
                        ? () => navigation.navigate('FollowList', { userId: sellerId, kind: 'followers', title: t('storefront.followers') })
                        : undefined
                    }
                  />
                </View>
              </View>

              {/* ── Name, category, bio, trust info, metadata ── */}
              <View style={styles.identityText}>
                <View style={styles.nameRow}>
                  <Text style={styles.displayName} numberOfLines={1}>{displayedName}</Text>
                  {isVerified ? (
                    <Icon name="verified" size={16} color={tier === 'business' ? COLORS.coral : COLORS.blue} />
                  ) : null}
                </View>

                {seller?.bio ? <Text style={styles.bio}>{seller.bio}</Text> : null}

                {(locationCity || memberSince || (isBusinessMode && serviceArea)) ? (
                  <View style={styles.metaRow}>
                    {locationCity ? (
                      <View style={styles.metaItem}>
                        <MaterialCommunityIcons name="map-marker-outline" size={13} color={COLORS.text3} />
                        <Text style={styles.metaText}>{locationCity}</Text>
                      </View>
                    ) : null}
                    {isBusinessMode && serviceArea ? (
                      <View style={styles.metaItem}>
                        <MaterialCommunityIcons name="map-marker-radius-outline" size={13} color={COLORS.text3} />
                        <Text style={styles.metaText}>{t('profile.serves', { area: serviceArea })}</Text>
                      </View>
                    ) : null}
                    {memberSince ? (
                      <View style={styles.metaItem}>
                        <MaterialCommunityIcons name="calendar-outline" size={13} color={COLORS.text3} />
                        <Text style={styles.metaText}>{t('me.since')} {memberSince}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>

              {/* ── Store details, only the fields the seller filled ── */}
              {seller?.store_description || seller?.store_category ? (
                <View style={styles.aboutCard}>
                  <TouchableOpacity
                    style={styles.aboutHeader}
                    onPress={() => setAboutExpanded((prev) => !prev)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t('profile.aboutStore')}
                    accessibilityState={{ expanded: aboutExpanded }}
                  >
                    <View style={styles.aboutHeaderLeft}>
                      <MaterialCommunityIcons name="storefront-outline" size={16} color={COLORS.coral} />
                      <Text style={styles.aboutTitle}>{t('profile.aboutStore')}</Text>
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
                  {aboutExpanded && seller.store_description ? (
                    <View style={styles.aboutBody}>
                      <Text style={styles.aboutDescription}>{seller.store_description}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {store.isLoggedIn && !isOwnProfile ? (
                <View style={styles.actionsWrap}>
                  <ProfileActions
                    variant="visitor"
                    messageLabel={t('storefront.message')}
                    followLabel={t('storefront.follow')}
                    followingLabel={t('storefront.following')}
                    following={store.isFollowing(sellerId)}
                    messageBusy={messageLoading}
                    followBusy={followLoading}
                    onMessage={handleMessage}
                    onFollow={handleFollow}
                  />
                </View>
              ) : null}

              {stale ? <StaleNotice onRetry={() => fetchSellerData(true)} /> : null}

              {/* ── Sticky tab bar ── */}
              <View onLayout={(e) => setTabBarY(e.nativeEvent.layout.y)}>
                <ProfileTabs tabs={tabs} active={activeTab} onChange={handleTabChange} />
              </View>

              <View style={styles.tabContent}>
                {activeTab === 'listings' ? (
                  <>
                    {showCategoryFilters ? (
                      <CategoryFilterRow
                        categories={categoryNames}
                        active={category}
                        onChange={setCategory}
                        allLabel={t('common.all')}
                      />
                    ) : null}

                    {pinnedProduct ? (
                      <FeaturedListingCard
                        product={{
                          id: pinnedProduct.id,
                          name: pinnedProduct.name,
                          price: pinnedProduct.price,
                          condition: pinnedProduct.condition,
                        }}
                        imageUrl={pinnedProduct.image_url}
                        onPress={() => navigation.navigate('ProductDetail', { productId: pinnedProduct.id })}
                      />
                    ) : null}

                    {filteredProducts.length > 0 ? (
                      <MasonryGrid
                        products={filteredProducts}
                        standalone={false}
                        columns={columns}
                        availableWidth={gridWidth}
                        columnGap={PROFILE_GRID_GAP}
                        sidePad={0}
                        priceOverlay={false}
                        detailsBelow="full"
                        animateOnMount
                        onPress={(item) => navigation.navigate('ProductDetail', { productId: item.id })}
                        renderCardOverlay={
                          canSave
                            ? (item) => (
                                <SaveChip
                                  saved={savedListings.isSaved(item.id)}
                                  onPress={() => savedListings.toggle(item.id)}
                                  label={savedListings.isSaved(item.id) ? t('profile.unsaveListing') : t('profile.saveListing')}
                                />
                              )
                            : undefined
                        }
                      />
                    ) : !pinnedProduct ? (
                      <EmptyState
                        icon="storefront-outline"
                        title={isBuyerProfile ? t('profile.noListingsBuyer') : t('storefront.noProducts')}
                        hint={isBuyerProfile ? t('profile.noListingsBuyerHint') : undefined}
                        size={56}
                      />
                    ) : null}
                  </>
                ) : null}

                {activeTab === 'reviews' ? (
                  <ProfileReviews
                    reviews={reviews}
                    stats={reviewStats}
                    isOwner={isOwnProfile}
                    ownerName={displayName}
                    emptyHint={isOwnProfile ? t('me.reviewsHintSeller') : undefined}
                    onReportReview={isOwnProfile ? undefined : handleReportReview}
                    onReportReply={isOwnProfile ? undefined : handleReportReply}
                    onReplySaved={() => fetchSellerData(true)}
                  />
                ) : null}
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* ── Overflow menu (Report / Block) ── */}
      <Modal visible={overflowMenuVisible} transparent animationType="fade" onRequestClose={() => setOverflowMenuVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setOverflowMenuVisible(false)}>
          <View style={[styles.overflowSheet, { paddingBottom: Math.max(SPACING.xl, insets.bottom + SPACING.md) }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{t('profile.options')}</Text>

            <TouchableOpacity
              style={styles.sheetRow}
              onPress={handleReportUser}
              accessibilityRole="button"
              accessibilityLabel={t('profile.reportProfile')}
            >
              <MaterialCommunityIcons name="flag-outline" size={20} color={COLORS.text} />
              <Text style={styles.sheetRowText}>{t('profile.reportProfile')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetRow}
              onPress={handleBlockUser}
              accessibilityRole="button"
              accessibilityLabel={t('profile.block')}
            >
              <MaterialCommunityIcons name="account-cancel-outline" size={20} color={COLORS.coral} />
              <Text style={[styles.sheetRowText, { color: COLORS.coral }]}>{t('profile.blockUser')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sheetRow, styles.sheetCancelRow]}
              onPress={() => setOverflowMenuVisible(false)}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <Text style={styles.sheetCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

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
  scroll: { flex: 1 },
  content: { alignItems: 'center' },
  column: { paddingHorizontal: PROFILE_PAD },

  headerIconBtn: {
    width: TOUCH.recommended,
    height: TOUCH.recommended,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Identity: avatar + stats, then name / bio / @username */
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  statsWrap: { flex: 1 },
  identityText: { marginTop: SPACING.md, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  displayName: {
    flexShrink: 1,
    fontSize: FONT_SIZES.md,
    fontFamily: FONTS.heading,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
  },
  bio: { fontSize: FONT_SIZES.md, color: COLORS.text, lineHeight: 19, marginTop: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, marginTop: SPACING.sm },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: FONT_SIZES.sm, color: COLORS.text3 },

  /* About store */
  aboutCard: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  aboutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    minHeight: 48,
  },
  aboutHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flex: 1 },
  aboutTitle: { fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.bold, color: COLORS.text },
  categoryBadge: {
    backgroundColor: COLORS.surface2,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  categoryBadgeText: { fontSize: FONT_SIZES.xs, color: COLORS.text2, fontWeight: FONT_WEIGHTS.semibold },
  aboutBody: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.md },
  aboutDescription: { fontSize: FONT_SIZES.base, color: COLORS.text2, lineHeight: 19 },

  actionsWrap: { marginTop: SPACING.lg },
  tabContent: { paddingTop: SPACING.md },

  /* Overflow sheet */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  overflowSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.pill,
    borderTopRightRadius: RADIUS.pill,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  sheetTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: 14,
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sheetRowText: { fontSize: FONT_SIZES.lg, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.text },
  sheetCancelRow: { borderBottomWidth: 0, justifyContent: 'center', marginTop: SPACING.xs },
  sheetCancelText: { fontSize: FONT_SIZES.lg, fontWeight: FONT_WEIGHTS.bold, color: COLORS.text2, textAlign: 'center' },
});
