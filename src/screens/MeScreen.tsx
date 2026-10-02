import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Share, Animated,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Icon } from '../components/icons/Icon';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS, TOUCH, FONTS,
  getDisplayName, formatPrice, TIER_COLORS,
} from '../theme';
import { useTranslation } from '@/localization';
import { useUser, useReduceMotion } from '../hooks';
import { store } from '../store';
import {
  getSellerOrders, getSellerAnalytics, getWishlist,
  getSellerProducts, getFollowerCount, getFollowing, getSellerReviews,
  updateSellerProfile, pinListing, updateProduct, getImageUrl,
} from '../api';
import type { RootStackParamList } from '../navigation';
import type { Product, Order, Review } from '../types';
import UserAvatar from '../components/UserAvatar';
import EmptyState from '../components/EmptyState';
import { cacheKeys, readSnapshot, writeSnapshot } from '../offlineCache';
import MasonryGrid from '../components/MasonryGrid';
import { useToast } from '../components/Toast';
import { network } from '../network';
import {
  ProfileActions, ProfileTrustRow, ProfileTabs, ProfileStickyBar, ProfileReviews,
  ProfileSkeleton, FeaturedListingCard, CategoryFilterRow, StaleNotice,
  useProfileCollapse, useProfileLayout,
  PROFILE_GRID_GAP, PROFILE_PAD, PROFILE_STICKY_ROW,
} from '../components/profile';
import type { ProfileTabItem } from '../components/profile';

const profileCache: Record<string, { data: any; timestamp: number }> = {};
const CACHE_TTL = 60_000;
let _persistedTab: Tab = 'listings';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Tab = 'listings' | 'reviews' | 'saved';
type SellerAnalyticsResponse = {
  overview?: { avg_rating?: string | number; review_count?: string | number };
  avg_rating?: string | number;
  review_count?: string | number;
};
type ReviewStats = { avg_rating?: number | string; review_count?: number | string; breakdown?: Record<string, number> };

/** Category label for a product — the list endpoints return the name as a string. */
function categoryOf(product: Product): string | null {
  const raw = (product as any).category;
  if (typeof raw === 'string' && raw) return raw;
  if (raw && typeof raw === 'object' && typeof raw.name === 'string') return raw.name;
  return null;
}

export default function MeScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const { user, refetch } = useUser();
  const reduceMotion = useReduceMotion();
  const { columns, containerWidth, gridWidth } = useProfileLayout();
  const scrollRef = useRef<ScrollView>(null);

  const isSeller = user?.role === 'seller';
  const tier = user?.seller_tier || 'casual';

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [stale, setStale] = useState(false);
  const [rawTab, setRawTab] = useState<Tab>(_persistedTab);
  const [category, setCategory] = useState<string | null>(null);
  const [tabBarY, setTabBarY] = useState(0);

  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const [followingCount, setFollowingCount] = useState<number | null>(null);
  const [sellingOrderCount, setSellingOrderCount] = useState(0);
  const [rating, setRating] = useState<number | null>(null);
  const [reviewCount, setReviewCount] = useState<number | null>(null);
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [wishlist, setWishlist] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [showPausedSection, setShowPausedSection] = useState(false);

  const isBusinessMode = isSeller && user?.seller_tier === 'business' && !!user?.use_store_identity;
  const username = user?.username || '';
  const fullName = user?.full_name?.trim().replace(/\s+/g, ' ') || '';
  const storeName = ((user as any)?.store_name || '').trim().replace(/\s+/g, ' ');
  const profileName = isBusinessMode ? (storeName || fullName) : fullName;
  const displayedName = profileName || fullName || username || t('profile.you');
  const displayName = displayedName;
  const isVerified = tier === 'verified' || tier === 'business';
  const tierLabel =
    tier === 'business' ? t('profile.tierBusiness')
    : tier === 'verified' ? t('profile.tierVerified')
    : t('profile.tierCasual');
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '';
  const locationCity = (user as any)?.location_city || '';
  const serviceArea = ((user as any)?.store_service_area || '') as string;

  const tabs = useMemo<ProfileTabItem[]>(() => {
    if (!isSeller) return [{ key: 'saved', label: t('common.saved') }];
    return [
      { key: 'listings', label: t('profile.listings') },
      { key: 'reviews', label: t('common.reviews') },
      { key: 'saved', label: t('common.saved') },
    ];
  }, [isSeller, t]);

  const activeTab = tabs.some((tab) => tab.key === rawTab) ? rawTab : (tabs[0].key as Tab);

  const contentTopPad = insets.top + PROFILE_STICKY_ROW + SPACING.md;
  const { onScroll, collapse, collapsed, chrome, scrolled } = useProfileCollapse(
    tabBarY > 0 ? contentTopPad + tabBarY : 0,
    insets.top + PROFILE_STICKY_ROW,
  );

  const applyData = useCallback((d: Record<string, any>) => {
    setProducts(d.products || []);
    setWishlist(d.wishlist || []);
    setReviews(d.reviews || []);
    setSellingOrderCount(d.sellingOrderCount || 0);
    if (typeof d.rating === 'number') setRating(d.rating);
    if (typeof d.reviewCount === 'number') setReviewCount(d.reviewCount);
    if (d.reviewStats) setReviewStats(d.reviewStats);
    if (typeof d.followerCount === 'number') setFollowerCount(d.followerCount);
    if (typeof d.followingCount === 'number') setFollowingCount(d.followingCount);
    setHasData(true);
  }, []);

  const handleTabChange = useCallback((key: string) => {
    _persistedTab = key as Tab;
    setRawTab(key as Tab);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const fetchData = useCallback(async (force = false) => {
    const uid = user?.id || '';
    const cached = profileCache[uid];
    if (!force && cached && Date.now() - cached.timestamp < CACHE_TTL) {
      applyData(cached.data);
      setLoading(false);
      return;
    }

    let usedSnapshot = false;
    if (!force && uid) {
      const snapshot = await readSnapshot<Record<string, any>>(cacheKeys.profile(uid));
      if (snapshot?.value) {
        usedSnapshot = true;
        applyData(snapshot.value);
        if (snapshot.isStale || !network.isOnline) setStale(true);
      }
    }

    const cacheData: Record<string, any> = {};
    try {
      if (isSeller) {
        const ordersRes = (await getSellerOrders().catch(() => ({ orders: [] }))) as { orders?: Order[] };
        const completed = (ordersRes.orders || []).filter((o) => o.status === 'completed').length;
        cacheData.sellingOrderCount = completed;
        setSellingOrderCount(completed);

        try {
          const sellerProds = (await getSellerProducts()) as { products: Product[] };
          const fetched = sellerProds?.products || [];
          cacheData.products = fetched;
          setProducts(fetched);
        } catch { /* keep cached products */ }

        // Rating: analytics is authoritative for verified/business sellers;
        // everyone else falls back to their review stats.
        let nextRating: number | null = null;
        let nextReviewCount: number | null = null;
        let nextStats: ReviewStats | null = null;
        if (user?.seller_tier !== 'casual') {
          try {
            const analytics = (await getSellerAnalytics()) as SellerAnalyticsResponse;
            const overview = analytics.overview || analytics;
            nextRating = Number(overview.avg_rating || 0);
            nextReviewCount = Number(overview.review_count || 0);
          } catch { /* hidden, retried next visit */ }
        }

        try {
          const rr = (await getSellerReviews(user!.id)) as { reviews?: Review[]; stats?: ReviewStats };
          const list = (rr?.reviews || []).map((r: any) => ({
            ...r,
            reviewer: r.reviewer || {
              full_name: r.reviewer_name,
              avatar_url: r.reviewer_avatar,
              username: r.reviewer_username,
            },
          }));
          cacheData.reviews = list;
          setReviews(list);
          if (rr?.stats) {
            nextStats = rr.stats;
            if (nextRating === null) nextRating = Number(rr.stats.avg_rating || 0);
            if (nextReviewCount === null) nextReviewCount = Number(rr.stats.review_count || 0);
          } else if (nextReviewCount === null) {
            nextReviewCount = list.length;
          }
        } catch { /* keep cached reviews */ }

        if (nextRating !== null) { cacheData.rating = nextRating; setRating(nextRating); }
        if (nextReviewCount !== null) { cacheData.reviewCount = nextReviewCount; setReviewCount(nextReviewCount); }
        if (nextStats) { cacheData.reviewStats = nextStats; setReviewStats(nextStats); }
      }

      try {
        const followerRes = (await getFollowerCount(user?.id || '')) as { count: number };
        cacheData.followerCount = followerRes?.count || 0;
        setFollowerCount(followerRes?.count || 0);
        store.setFollowerCount(followerRes?.count || 0);
      } catch { /* hidden until it loads */ }

      try {
        const followingRes = (await getFollowing()) as { following?: unknown[] };
        const count = followingRes?.following?.length || 0;
        cacheData.followingCount = count;
        setFollowingCount(count);
        store.setFollowingCount(count);
      } catch { /* hidden until it loads */ }

      try {
        const wishlistRes = (await getWishlist()) as { items: Product[] };
        cacheData.wishlist = wishlistRes?.items || [];
        setWishlist(wishlistRes?.items || []);
      } catch { /* keep cached saved items */ }

      setStale(false);
      setHasData(true);
    } catch (e: any) {
      console.error('[MeScreen fetchData] ERROR:', e?.message);
      setStale(usedSnapshot || !network.isOnline);
    }

    if (uid) {
      profileCache[uid] = { timestamp: Date.now(), data: cacheData };
      void writeSnapshot(cacheKeys.profile(uid), cacheData);
    }
    setLoading(false);
  }, [isSeller, user?.id, user?.seller_tier, applyData]);

  useFocusEffect(useCallback(() => { fetchData(false); }, [fetchData]));

  // Coming back online refreshes quietly — the cached profile stays usable meanwhile.
  useEffect(() => {
    const unsub = network.onChange((online) => { if (online) void fetchData(true); });
    return unsub;
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchData(true), refetch()]);
    setRefreshing(false);
  }, [fetchData, refetch]);

  const handleProductPress = useCallback((item: Product) => {
    nav.navigate('ProductDetail', { productId: item.id });
  }, [nav]);

  const handleShareProfile = useCallback(async () => {
    if (!user) return;
    try {
      await Share.share({ message: `${displayName} on MaurMaket — @${user.username}` });
    } catch { /* dismissed */ }
  }, [user, displayName]);

  const handleTogglePin = useCallback(async (productToPin: Product) => {
    const isCurrentlyPinned = user?.pinned_product_id === productToPin.id;
    try {
      await pinListing(isCurrentlyPinned ? null : productToPin.id);
      toast.show({ kind: 'info', title: isCurrentlyPinned ? t('profile.unpinned') : t('profile.pinned') });
      await refetch();
      await fetchData(true);
    } catch (e: any) {
      toast.error(t('profile.pinFailed'), e?.message || t('feedback.connectionRetry'));
    }
  }, [user?.pinned_product_id, refetch, fetchData, toast, t]);

  const handleResumeProduct = useCallback(async (prod: Product) => {
    try {
      await updateProduct(prod.id, { is_available: true } as any);
      toast.show({ kind: 'success', title: t('profile.listingReactivated') });
      await fetchData(true);
    } catch (e: any) {
      toast.error(t('profile.reactivateFailed'), e?.message || t('feedback.connectionRetry'));
    }
  }, [fetchData, toast, t]);

  const handleIdentitySwitch = useCallback(async (useStore: boolean) => {
    if (!user) return;
    try {
      await updateSellerProfile({ useStoreIdentity: useStore });
      await store.setUser({ ...store.user!, use_store_identity: useStore } as any, store.token!);
      toast.show({
        kind: 'success',
        title: useStore ? t('profile.switchedBusiness') : t('profile.switchedPersonal'),
      });
      await refetch();
    } catch {
      toast.error(t('profile.switchFailed'), t('feedback.connectionRetry'));
    }
  }, [user, refetch, toast, t]);

  const pinnedProductId = user?.pinned_product_id || null;
  const pinnedProduct = useMemo(
    () => products.find((p) => p.id === pinnedProductId) || null,
    [products, pinnedProductId],
  );
  const activeProducts = useMemo(
    () => products.filter((p) => p.is_available !== false && p.id !== pinnedProductId),
    [products, pinnedProductId],
  );
  const pausedProducts = useMemo(() => products.filter((p) => p.is_available === false), [products]);

  const categoryNames = useMemo(() => {
    const names = new Set<string>();
    activeProducts.forEach((p) => {
      const name = categoryOf(p);
      if (name) names.add(name);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [activeProducts]);
  const showCategoryFilters = categoryNames.length >= 2 && activeProducts.length >= 8;

  useEffect(() => {
    if (category && !categoryNames.includes(category)) setCategory(null);
  }, [category, categoryNames]);

  const filteredProducts = useMemo(
    () => (category ? activeProducts.filter((p) => categoryOf(p) === category) : activeProducts),
    [activeProducts, category],
  );

  const pinnedImage = useMemo(() => {
    if (!pinnedProduct) return null;
    const images = pinnedProduct.images || [];
    const primary = images.find((i) => i.is_primary) || images[0];
    return getImageUrl(primary?.thumbnail_url || primary?.image_url) || null;
  }, [pinnedProduct]);

  const showSkeleton = loading && !hasData;

  return (
    <View style={styles.container}>
      <ProfileStickyBar
        collapse={collapse}
        collapsed={collapsed}
        chrome={chrome}
        scrolled={scrolled}
        topInset={insets.top}
        avatar={<UserAvatar seller={{ ...user, seller_tier: tier } as any} size={30} />}
        name={username || t('profile.you')}
        verified={isVerified}
        identityLabel={username || t('profile.you')}
        showChevron={true}
        onIdentityPress={() => scrollRef.current?.scrollTo({ y: 0, animated: !reduceMotion })}
        right={
          <>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => nav.navigate(isSeller ? 'AddListing' : 'SellerOnboarding')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={isSeller ? t('me.addListing') : t('me.becomeSeller')}
            >
              <MaterialCommunityIcons name="plus" size={24} color={COLORS.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => nav.navigate('Settings')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('me.settings')}
            >
              <MaterialCommunityIcons name="cog-outline" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </>
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.coral} />}
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
                <UserAvatar seller={{ ...user, seller_tier: tier } as any} size={76} animated />
                <View style={styles.statsWrap}>
                  <ProfileTrustRow
                    rating={rating}
                    reviewCount={reviewCount}
                    salesCount={isSeller ? sellingOrderCount : null}
                    followers={followerCount}
                    following={followingCount}
                    onFollowersPress={user ? () => nav.navigate('FollowList', { userId: user.id, kind: 'followers', title: t('me.followers') }) : undefined}
                    onFollowingPress={user ? () => nav.navigate('FollowList', { userId: user.id, kind: 'following', title: t('me.following') }) : undefined}
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

                {user?.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}

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

              {/* ── Business / Personal presentation (business sellers only) ── */}
              {isSeller && tier === 'business' ? (
                <IdentityModeControl
                  business={!!user?.use_store_identity}
                  onChange={handleIdentitySwitch}
                  personalLabel={t('profile.personal')}
                  businessLabel={t('profile.business')}
                />
              ) : null}

              <View style={styles.actionsWrap}>
                <ProfileActions
                  variant="owner"
                  editLabel={t('me.editProfile')}
                  shareLabel={t('profile.shareProfile')}
                  visitorLabel={t('profile.visitorView')}
                  onEdit={() => nav.navigate('EditProfile')}
                  onShare={handleShareProfile}
                  onVisitorView={user ? () => nav.navigate('Storefront', { sellerId: user.id }) : undefined}
                />
              </View>

              {isSeller ? (
                <TouchableOpacity
                  style={styles.sellerToolsRow}
                  onPress={() => nav.navigate('SellerToolsSettings')}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('profile.sellerTools')}
                >
                  <View style={styles.sellerToolsIconWrap}>
                    <MaterialCommunityIcons name="storefront-outline" size={18} color={COLORS.coral} />
                  </View>
                  <View style={styles.sellerToolsInfo}>
                    <View style={styles.sellerToolsHeader}>
                      <Text style={styles.sellerToolsTitle}>{t('profile.sellerTools')}</Text>
                      <View style={[styles.tierTag, { backgroundColor: (TIER_COLORS[tier] || COLORS.blue) + '20' }]}>
                        <Text style={[styles.tierTagText, { color: TIER_COLORS[tier] || COLORS.blue }]}>{tierLabel}</Text>
                      </View>
                    </View>
                    <Text style={styles.sellerToolsSub}>
                      {t('profile.listingsCount', { count: products.length })} · {t('profile.salesCount', { count: sellingOrderCount })}
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={18} color={COLORS.text2} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.sellBanner}
                  onPress={() => nav.navigate('SellerOnboarding')}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('me.becomeSeller')}
                >
                  <MaterialCommunityIcons name="store-plus-outline" size={20} color={COLORS.green} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sellTitle}>{t('me.startSelling')}</Text>
                    <Text style={styles.sellHint}>{t('profile.startSellingHint')}</Text>
                  </View>
                  <Icon name="chevron-right" size={18} color={COLORS.green} />
                </TouchableOpacity>
              )}

              {stale ? <StaleNotice onRetry={() => fetchData(true)} /> : null}

              {/* ── Sticky tab bar ── */}
              <View onLayout={(e) => setTabBarY(e.nativeEvent.layout.y)}>
                <ProfileTabs tabs={tabs} active={activeTab} onChange={handleTabChange} />
              </View>

              {/* ── Tab content ── */}
              <View style={styles.tabContent}>
                {activeTab === 'listings' && isSeller ? (
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
                          effective_price: pinnedProduct.effective_price,
                          is_on_sale: pinnedProduct.is_on_sale,
                          condition: (pinnedProduct as any).condition,
                        }}
                        imageUrl={pinnedImage}
                        onPress={() => handleProductPress(pinnedProduct)}
                        onEdit={() => nav.navigate('EditListing', { productId: pinnedProduct.id })}
                        onUnpin={() => handleTogglePin(pinnedProduct)}
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
                        onPress={handleProductPress}
                        renderCardOverlay={(item) => (
                          <View style={styles.cardActionsOverlay}>
                            <TouchableOpacity
                              style={styles.cardIconBtn}
                              onPress={() => nav.navigate('EditListing', { productId: item.id })}
                              activeOpacity={0.7}
                              accessibilityRole="button"
                              accessibilityLabel={t('profile.editListing')}
                            >
                              <MaterialCommunityIcons name="pencil" size={14} color={COLORS.white} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.cardIconBtn}
                              onPress={() => handleTogglePin(item)}
                              activeOpacity={0.7}
                              accessibilityRole="button"
                              accessibilityLabel={user?.pinned_product_id === item.id ? t('profile.unpin') : t('profile.pin')}
                            >
                              <MaterialCommunityIcons
                                name={user?.pinned_product_id === item.id ? 'pin-off' : 'pin'}
                                size={14}
                                color={COLORS.white}
                              />
                            </TouchableOpacity>
                          </View>
                        )}
                      />
                    ) : !pinnedProduct ? (
                      <EmptyState
                        icon="storefront-outline"
                        title={t('me.noListings')}
                        hint={t('me.noListingsHint')}
                        actionLabel={t('me.addListing')}
                        onAction={() => nav.navigate('AddListing')}
                        size={56}
                        topSpacing={SPACING.xl}
                      />
                    ) : null}

                    {pausedProducts.length > 0 ? (
                      <View style={styles.pausedSection}>
                        <TouchableOpacity
                          style={styles.pausedHeader}
                          onPress={() => setShowPausedSection((prev) => !prev)}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel={t('profile.pausedCount', { count: pausedProducts.length })}
                        >
                          <View style={styles.pausedHeaderLeft}>
                            <MaterialCommunityIcons name="pause-circle-outline" size={16} color={COLORS.yellow} />
                            <Text style={styles.pausedTitle}>
                              {t('profile.pausedCount', { count: pausedProducts.length })}
                            </Text>
                          </View>
                          <MaterialCommunityIcons
                            name={showPausedSection ? 'chevron-up' : 'chevron-down'}
                            size={18}
                            color={COLORS.text2}
                          />
                        </TouchableOpacity>

                        {showPausedSection ? (
                          <View style={styles.pausedList}>
                            {pausedProducts.map((p) => (
                              <View key={p.id} style={styles.pausedCard}>
                                <View style={styles.pausedCardInfo}>
                                  <Text style={styles.pausedCardName} numberOfLines={1}>{p.name}</Text>
                                  <View style={styles.pausedReasonRow}>
                                    <View style={[styles.pausedBadge, p.paused_reason === 'tier_cap' && { backgroundColor: COLORS.coralMuted }]}>
                                      <Text style={[styles.pausedBadgeText, p.paused_reason === 'tier_cap' && { color: COLORS.coral }]}>
                                        {p.paused_reason === 'tier_cap' ? t('profile.pausedByPlan') : t('profile.paused')}
                                      </Text>
                                    </View>
                                    <Text style={styles.pausedPrice}>{formatPrice(p.price)}</Text>
                                  </View>
                                </View>
                                <TouchableOpacity
                                  style={styles.resumeBtn}
                                  onPress={() => handleResumeProduct(p)}
                                  accessibilityRole="button"
                                  accessibilityLabel={t('profile.resume')}
                                >
                                  <Text style={styles.resumeBtnText}>{t('profile.resume')}</Text>
                                </TouchableOpacity>
                              </View>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </>
                ) : null}

                {activeTab === 'reviews' ? (
                  <ProfileReviews
                    reviews={reviews}
                    stats={reviewStats}
                    isOwner
                    ownerName={displayName}
                    emptyHint={t('me.reviewsHintSeller')}
                    onReplySaved={() => fetchData(true)}
                  />
                ) : null}

                {activeTab === 'saved' ? (
                  wishlist.length > 0 ? (
                    <MasonryGrid
                      products={wishlist}
                      standalone={false}
                      columns={columns}
                      availableWidth={gridWidth}
                      columnGap={PROFILE_GRID_GAP}
                      sidePad={0}
                      priceOverlay={false}
                      detailsBelow="full"
                      onPress={handleProductPress}
                    />
                  ) : (
                    <EmptyState
                      icon="heart-outline"
                      title={t('me.noSavedItems')}
                      hint={t('me.noSavedItemsHint')}
                      size={56}
                    />
                  )
                ) : null}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/** Compact Business ⇄ Personal switch with a smooth, immediate active state. */
function IdentityModeControl({
  business,
  onChange,
  personalLabel,
  businessLabel,
}: {
  business: boolean;
  onChange: (value: boolean) => void;
  personalLabel: string;
  businessLabel: string;
}) {
  const progress = useRef(new Animated.Value(business ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: business ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [business, progress]);

  const personalOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const businessOpacity = progress;

  return (
    <View style={styles.modeControl}>
      <TouchableOpacity
        style={styles.modeBtn}
        onPress={() => !business || onChange(false)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={personalLabel}
        accessibilityState={{ selected: !business }}
      >
        <Animated.View style={[StyleSheet.absoluteFill, styles.modeBtnActive, { opacity: personalOpacity }]} />
        <Text style={[styles.modeBtnText, !business && styles.modeBtnTextActive]}>{personalLabel}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.modeBtn}
        onPress={() => business || onChange(true)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={businessLabel}
        accessibilityState={{ selected: business }}
      >
        <Animated.View style={[StyleSheet.absoluteFill, styles.modeBtnActive, { opacity: businessOpacity }]} />
        <Text style={[styles.modeBtnText, business && styles.modeBtnTextActive]}>{businessLabel}</Text>
      </TouchableOpacity>
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

  /* Identity header: avatar + stats, then name / bio / @username */
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

  /* Presentation switch */
  modeControl: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.pill,
    padding: 3,
    marginTop: SPACING.lg,
    alignSelf: 'flex-start',
    minWidth: 200,
  },
  modeBtn: {
    flex: 1,
    minHeight: 34,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
  },
  modeBtnActive: { backgroundColor: COLORS.coral, borderRadius: RADIUS.pill },
  modeBtnText: { fontSize: FONT_SIZES.sm, fontWeight: FONT_WEIGHTS.bold, color: COLORS.text2 },
  modeBtnTextActive: { color: COLORS.white },

  actionsWrap: { marginTop: SPACING.lg },

  /* Seller tools + buyer CTA */
  sellerToolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.md,
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 56,
  },
  sellerToolsIconWrap: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerToolsInfo: { flex: 1, gap: 2 },
  sellerToolsHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  sellerToolsTitle: { fontSize: FONT_SIZES.md, fontWeight: FONT_WEIGHTS.bold, color: COLORS.text },
  tierTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADIUS.pill },
  tierTagText: { fontSize: FONT_SIZES.xs, fontWeight: FONT_WEIGHTS.bold },
  sellerToolsSub: { fontSize: FONT_SIZES.sm, color: COLORS.text2 },

  sellBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    padding: SPACING.md,
    backgroundColor: COLORS.greenMuted,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.green + '30',
  },
  sellTitle: { fontSize: FONT_SIZES.md, fontWeight: FONT_WEIGHTS.bold, color: COLORS.green },
  sellHint: { fontSize: FONT_SIZES.sm, color: COLORS.text2, marginTop: 1 },

  /* Tab content */
  tabContent: { paddingTop: SPACING.md },

  /* Owner controls over a tile */
  cardActionsOverlay: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', gap: 6 },
  cardIconBtn: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Paused (tier-capped) listings */
  pausedSection: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  pausedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    minHeight: 48,
  },
  pausedHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  pausedTitle: { fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.bold, color: COLORS.text },
  pausedList: { paddingHorizontal: SPACING.md, paddingBottom: 10, gap: SPACING.sm },
  pausedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  pausedCardInfo: { flex: 1, gap: SPACING.xs },
  pausedCardName: { fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.text },
  pausedReasonRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  pausedBadge: {
    backgroundColor: COLORS.surface2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
  },
  pausedBadgeText: { fontSize: FONT_SIZES.xs, color: COLORS.text2, fontWeight: FONT_WEIGHTS.semibold },
  pausedPrice: { fontSize: FONT_SIZES.sm, fontWeight: FONT_WEIGHTS.bold, color: COLORS.text2 },
  resumeBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumeBtnText: { fontSize: FONT_SIZES.sm, fontWeight: FONT_WEIGHTS.bold, color: COLORS.coral },
});
