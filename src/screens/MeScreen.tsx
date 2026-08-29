import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
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
import { useTranslation } from '../i18n';
import { useUser } from '../hooks';
import { store } from '../store';
import {
  getOrders, getSellerOrders, getSellerAnalytics, getWishlist,
  getSellerProducts, getFollowerCount, getFollowing, getSellerReviews, updateSellerProfile,
} from '../api';
import type { RootStackParamList } from '../navigation';
import type { Product, Order, Review } from '../types';
import UserAvatar from '../components/UserAvatar';
import { SkeletonBlock } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import { cacheKeys, readSnapshot, writeSnapshot } from '../offlineCache';
import MasonryGrid from '../components/MasonryGrid';

const profileCache: Record<string, { data: any; timestamp: number }> = {};
const CACHE_TTL = 60_000;
let _persistedTab: Tab = 'listings';


type Nav = NativeStackNavigationProp<RootStackParamList>;

type Tab = 'listings' | 'reviews' | 'saved';
type SellerAnalyticsResponse = {
  overview?: { avg_rating?: string | number; product_count?: string | number; review_count?: string | number; total_orders?: string | number; total_revenue?: string | number; follower_count?: string | number };
  avg_rating?: string | number;
  product_count?: string | number;
  review_count?: string | number;
  total_orders?: string | number;
  total_revenue?: string | number;
  follower_count?: string | number;
  topProducts?: Array<{ id: string; name: string; price: number; stock: number; units_sold: number; revenue: number; image_url?: string }>;
  sellerTier?: string;
};

export default function MeScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const { user } = useUser();
  const isSeller = user?.role === 'seller';

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>(_persistedTab);

  const [followerCount, setFollowerCount] = useState(store.followerCount);
  const [followingCount, setFollowingCount] = useState(store.followingCount);
  const [orderCount, setOrderCount] = useState(0);
  const [sellingOrderCount, setSellingOrderCount] = useState(0);
  const [productCount, setProductCount] = useState(0);
  const [rating, setRating] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);

  const [hasOrders, setHasOrders] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [wishlist, setWishlist] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [analyticsData, setAnalyticsData] = useState<SellerAnalyticsResponse | null>(null);
  const mountedRef = useRef(true);

  const tier = user?.seller_tier || 'casual';
  const isBusinessMode = isSeller && user?.seller_tier === 'business' && user?.use_store_identity;
  const displayName = isBusinessMode ? (user as any)?.store_name || getDisplayName(user) : getDisplayName(user);

  const memberSince = user?.created_at
    ? `${t('me.since')} ${new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
    : '';

  const locationCity = (user as any)?.location_city || '';

  const scrollOffset = useRef(0);
  const [headerBg, setHeaderBg] = useState(0);

  const onScroll = useCallback((e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    scrollOffset.current = y;
    const opacity = Math.min(1, Math.max(0, (y - 140) / 80));
    setHeaderBg(opacity);
  }, []);

  const handleTabChange = useCallback((tab: Tab) => {
    _persistedTab = tab;
    setActiveTab(tab);
  }, []);

  const fetchData = useCallback(async (force = false) => {
    const uid = user?.id || '';
    const cached = profileCache[uid];
    if (!force && cached && Date.now() - cached.timestamp < CACHE_TTL) {
      const d = cached.data;
      setOrderCount(d.orderCount || 0); setSellingOrderCount(d.sellingOrderCount || 0);
      setHasOrders(d.hasOrders || false); setProducts(d.products || []); setProductCount(d.productCount || 0);
      setRating(d.rating || 0); setReviewCount(d.reviewCount || 0); setAnalyticsData(d.analyticsData || null);
      setFollowerCount(d.followerCount || 0); setFollowingCount(d.followingCount || 0);
      setWishlist(d.wishlist || []); setReviews(d.reviews || []);
      return;
    }

    if (!force && uid) {
      const snapshot = await readSnapshot<Record<string, any>>(cacheKeys.profile(uid));
      if (snapshot?.value) {
        const d = snapshot.value;
        setOrderCount(d.orderCount || 0); setSellingOrderCount(d.sellingOrderCount || 0);
        setHasOrders(d.hasOrders || false); setProducts(d.products || []); setProductCount(d.productCount || 0);
        setRating(d.rating || 0); setReviewCount(d.reviewCount || 0); setAnalyticsData(d.analyticsData || null);
        setFollowerCount(d.followerCount || 0); setFollowingCount(d.followingCount || 0);
        setWishlist(d.wishlist || []); setReviews(d.reviews || []);
        setLoading(false);
      }
    }

    let cacheData: Record<string, any> = {};
    try {
      const [ordersRes, buyerOrdersRes] = await Promise.all([
        isSeller
          ? getSellerOrders().catch(() => ({ orders: [] })) as Promise<{ orders: Order[] }>
          : Promise.resolve({ orders: [] }),
        getOrders() as Promise<{ buyerOrders: Order[]; sellerOrders: Order[] }>,
      ]);

      const allBuyerOrders = buyerOrdersRes.buyerOrders || [];
      const sellingOrders = (ordersRes as { orders?: Order[] }).orders || [];
      const completedSellingOrders = sellingOrders.filter((o: Order) => o.status === 'completed');
      cacheData.orderCount = allBuyerOrders.length;
      cacheData.sellingOrderCount = completedSellingOrders.length;
      setOrderCount(allBuyerOrders.length);
      setSellingOrderCount(completedSellingOrders.length);

      cacheData.hasOrders = allBuyerOrders.length > 0;
      setHasOrders(allBuyerOrders.length > 0);

      let products: Product[] = [];
      let analyticsData: SellerAnalyticsResponse | null = null;
      let rating = 0;
      let reviewCount = 0;
      cacheData.products = products; cacheData.productCount = 0;
      if (isSeller) {
        let sellerProds: { products: Product[] } | null = null;
        try { sellerProds = await getSellerProducts() as { products: Product[] }; } catch { /* ignore */ }
        products = sellerProds?.products || [];
        setProducts(products);
        setProductCount(products.length || 0);
        cacheData.products = products; cacheData.productCount = products.length;

        if (user?.seller_tier !== 'casual') {
          try {
            const analytics = await getSellerAnalytics() as SellerAnalyticsResponse;
            const overview = analytics.overview || analytics;
            rating = Number(overview.avg_rating || 0);
            reviewCount = Number(overview.review_count || 0);
            analyticsData = analytics;
            setRating(rating); setReviewCount(reviewCount); setAnalyticsData(analytics);
          } catch { /* ignore */ }
        }
      }
      cacheData.rating = rating; cacheData.reviewCount = reviewCount; cacheData.analyticsData = analyticsData;

      let followerRes: { count: number } | null = null;
      try { followerRes = await getFollowerCount(user?.id || '') as { count: number }; } catch { /* ignore */ }
      const fc = followerRes?.count || 0;
      cacheData.followerCount = fc;
      setFollowerCount(fc);
      store.setFollowerCount(fc);

      let followingRes: { following?: unknown[] } | null = null;
      try { followingRes = await getFollowing() as { following?: unknown[] }; } catch { /* ignore */ }
      const fcing = followingRes?.following?.length || 0;
      cacheData.followingCount = fcing;
      setFollowingCount(fcing);
      store.setFollowingCount(fcing);

      let wishlistItems: Product[] = [];
      try { const wr = await getWishlist() as { items: Product[] }; wishlistItems = wr?.items || []; } catch { /* ignore */ }
      cacheData.wishlist = wishlistItems;
      setWishlist(wishlistItems);

      let reviewsList: Review[] = [];
      if (isSeller && user?.id) {
        try {
          const rr = await getSellerReviews(user.id) as { reviews: Review[] };
          reviewsList = (rr?.reviews || []).map((r: any) => ({
            ...r,
            reviewer: r.reviewer || {
              full_name: r.reviewer_name,
              avatar_url: r.reviewer_avatar,
              username: r.reviewer_username,
            },
          }));
        } catch { /* ignore */ }
      }
      cacheData.reviews = reviewsList;
      setReviews(reviewsList);
    } catch (e: any) { console.error(`[MeScreen fetchData] ERROR:`, e?.message); }

    if (uid) {
      profileCache[uid] = { timestamp: Date.now(), data: cacheData };
      void writeSnapshot(cacheKeys.profile(uid), cacheData);
    }
    setLoading(false);
  }, [isSeller, user?.id]);

  useFocusEffect(useCallback(() => {
    fetchData(false);
  }, [fetchData]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData(true);
    setRefreshing(false);
  }, [fetchData]);

  const handleProductPress = useCallback((item: Product) => {
    const isOwnProduct = isSeller && user?.id === item.seller_id;
    nav.navigate(isOwnProduct ? 'EditListing' : 'ProductDetail', { productId: item.id });
  }, [isSeller, user?.id, nav]);

  /* ── Tier badge ── */
  const tierColor = tier ? TIER_COLORS[tier] ?? COLORS.text2 : COLORS.text2;
  const tierLabel =
    tier === 'business' ? 'Business'
    : tier === 'verified' ? 'Verified'
    : '';

  return (
    <View style={styles.container}>
      {/* Sticky header */}
      <View style={[styles.stickyHeader, { paddingTop: insets.top + 6, paddingBottom: 8, backgroundColor: `rgba(13,17,23,${headerBg})` }]}>
        <View style={styles.stickyHeaderInner}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => nav.navigate(store.isSeller ? 'AddListing' : 'SellerOnboarding')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="add listing"
          >
            <MaterialCommunityIcons name="plus" size={26} color={COLORS.text} />
          </TouchableOpacity>

          <View style={styles.topBarNameCenter}>
            <View style={styles.topBarNameWrap}>
              <Text style={styles.topBarName} numberOfLines={1}>@{user?.username || 'you'}</Text>
              {(tier === 'verified' || tier === 'business') && (
                <Icon name="verified" size={16} color={tier === 'business' ? COLORS.coral : COLORS.blue} />
              )}
            </View>
          </View>

          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => nav.navigate('Settings')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="settings"
          >
            <MaterialCommunityIcons name="cog-outline" size={24} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 44, paddingBottom: insets.bottom + 80 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.coral} />
        }
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
      {/* ── Profile Hero ── */}
      <View style={styles.hero}>
        <View style={[styles.avatarRow, { paddingTop: SPACING.md }]}>
          <UserAvatar seller={{ ...user, seller_tier: tier } as any} size={72} animated={true} />
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{isSeller ? sellingOrderCount : orderCount}</Text>
              <Text style={styles.statLabel}>{isSeller ? 'Sales' : t('me.totalOrders')}</Text>
            </View>
            <TouchableOpacity style={styles.stat} onPress={() => user && nav.navigate('FollowList', { userId: user.id, kind: 'followers', title: t('me.followers') })}>
              <Text style={styles.statNum}>{followerCount}</Text>
              <Text style={styles.statLabel}>{t('me.followers')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stat} onPress={() => user && nav.navigate('FollowList', { userId: user.id, kind: 'following', title: t('me.following') })}>
              <Text style={styles.statNum}>{followingCount}</Text>
              <Text style={styles.statLabel}>{t('me.following')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Identity Toggle — business-tier sellers only */}
        {isSeller && user?.seller_tier === 'business' && (
          <View style={styles.identityToggle}>
            <TouchableOpacity
              style={[styles.identityBtn, !user?.use_store_identity && styles.identityBtnActive]}
              onPress={() => updateSellerProfile({ useStoreIdentity: false }).then(() => store.setUser({ ...store.user!, use_store_identity: false } as any, store.token!))}
              accessibilityRole="button"
              accessibilityLabel="personal mode"
            >
              <Text style={[styles.identityBtnText, !user?.use_store_identity && styles.identityBtnTextActive]}>Personal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.identityBtn, user?.use_store_identity && styles.identityBtnActive]}
              onPress={() => updateSellerProfile({ useStoreIdentity: true }).then(() => store.setUser({ ...store.user!, use_store_identity: true } as any, store.token!))}
              accessibilityRole="button"
              accessibilityLabel="business mode"
            >
              <Text style={[styles.identityBtnText, user?.use_store_identity && styles.identityBtnTextActive]}>Business</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Trust-preserving line for business mode */}
        {isBusinessMode && user?.username && (
          <View style={styles.trustLine}>
            <Icon name="verified" size={12} color={COLORS.green} />
            <Text style={styles.trustLineText}>Operated by <Text style={{ color: COLORS.text, fontWeight: FONT_WEIGHTS.bold }}>@{user.username}</Text> · Verified identity on file</Text>
          </View>
        )}

        {/* Name, bio, member since */}
        <View style={styles.nameBioBlock}>
          {user?.bio ? (
            <Text style={styles.bio} numberOfLines={2}>{user.bio}</Text>
          ) : null}
          {user?.show_real_name && user?.full_name && !isBusinessMode && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
              <Icon name="verified" size={11} color={COLORS.green} />
              <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.text }}>{user.full_name}</Text>
            </View>
          )}
          <View style={styles.metaRow}>
            {locationCity ? (
              <View style={styles.metaItem}>
                <MaterialCommunityIcons name="map-marker-outline" size={12} color={COLORS.text3} />
                <Text style={styles.metaText}>{locationCity}</Text>
              </View>
            ) : null}
            {memberSince ? (
              <View style={styles.metaItem}>
                <MaterialCommunityIcons name="calendar-outline" size={12} color={COLORS.text3} />
                <Text style={styles.metaText}>{memberSince}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => nav.navigate('EditProfile')}
            accessibilityRole="button"
            accessibilityLabel="edit profile"
          >
            <Icon name="edit" size={16} color={COLORS.text} />
            <Text style={styles.actionBtnText}>{t('me.editProfile')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => {}}
            accessibilityRole="button"
            accessibilityLabel="share profile"
          >
            <MaterialCommunityIcons name="share-variant-outline" size={16} color={COLORS.text} />
            <Text style={styles.actionBtnText}>{t('me.sharedProfile')}</Text>
          </TouchableOpacity>
          {isSeller && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => nav.navigate('Analytics')}
              accessibilityRole="button"
              accessibilityLabel="analytics"
            >
              <MaterialCommunityIcons name="chart-line" size={16} color={COLORS.text} />
              <Text style={styles.actionBtnText}>{t('me.analytics')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Become a Seller CTA for buyers */}
      {!isSeller && (
        <TouchableOpacity
          style={styles.sellBanner}
          onPress={() => nav.navigate('SellerOnboarding')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="become a seller"
        >
          <MaterialCommunityIcons name="store-plus-outline" size={20} color={COLORS.green} />
          <View style={{ flex: 1 }}>
            <Text style={styles.sellTitle}>{t('me.startSelling')}</Text>
            <Text style={styles.sellHint}>List your first product in seconds</Text>
          </View>
          <Icon name="chevron-right" size={18} color={COLORS.green} />
        </TouchableOpacity>
      )}

      {/* ── Tabs ── */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'listings' && styles.tabActive]}
          onPress={() => handleTabChange('listings')}
          accessibilityRole="button"
          accessibilityLabel="listings"
          accessibilityState={{ selected: activeTab === 'listings' }}
        >
          <MaterialCommunityIcons
            name={isSeller ? 'view-grid-outline' : 'shopping-outline'}
            size={22}
            color={activeTab === 'listings' ? COLORS.coral : COLORS.text2}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'reviews' && styles.tabActive]}
          onPress={() => handleTabChange('reviews')}
          accessibilityRole="button"
          accessibilityLabel="reviews"
          accessibilityState={{ selected: activeTab === 'reviews' }}
        >
          <Icon name="rate-this" size={22} color={activeTab === 'reviews' ? COLORS.coral : COLORS.text2} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'saved' && styles.tabActive]}
          onPress={() => handleTabChange('saved')}
          accessibilityRole="button"
          accessibilityLabel="saved"
          accessibilityState={{ selected: activeTab === 'saved' }}
        >
          <MaterialCommunityIcons
            name="heart-outline"
            size={22}
            color={activeTab === 'saved' ? COLORS.coral : COLORS.text2}
          />
        </TouchableOpacity>
      </View>

      {/* ── Tab Content ── */}
      <View style={styles.tabContent}>
        {activeTab === 'listings' && (
          isSeller ? (
            loading && products.length === 0 ? (
              <View style={styles.masonryGrid}>
                <View style={styles.masonryCol}>
                  {[180, 140, 190].map((h, i) => (
                    <SkeletonBlock key={i} width="100%" height={h} radius={RADIUS.media} />
                  ))}
                </View>
                <View style={styles.masonryCol}>
                  {[160, 200, 130].map((h, i) => (
                    <SkeletonBlock key={i} width="100%" height={h} radius={RADIUS.media} />
                  ))}
                </View>
              </View>
            ) : products.length > 0 ? (
              <MasonryGrid
                products={products}
                standalone={false}
                contentFit="contain"
                columnGap={3}
                sidePad={0}
                onPress={handleProductPress}
              />
            ) : (
              <EmptyState
                icon="storefront-outline"
                title={t('me.noListings')}
                hint="Add your first product so buyers have something to open from your shop."
                actionLabel="Add listing"
                onAction={() => nav.navigate('AddListing')}
              />
            )
          ) : (
            <EmptyState
              icon="shopping-outline"
              title="No recent orders"
              hint="Your purchases will appear here"
              size={56}
            />
          )
        )}

        {activeTab === 'reviews' && (
          reviews.length > 0 ? (
            <View style={{ gap: 6 }}>
              {reviews.map(rev => (
                <View key={rev.id} style={styles.reviewCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', gap: 2 }}>
                      {[1,2,3,4,5].map(s => (
                        <MaterialCommunityIcons
                          key={s}
                          name={s <= rev.rating ? 'star' : 'star-outline'}
                          size={12}
                          color={s <= rev.rating ? COLORS.yellow : COLORS.text2}
                        />
                      ))}
                    </View>
                    <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.text3 }}>{new Date(rev.created_at).toLocaleDateString()}</Text>
                  </View>
                  {rev.comment && <Text style={{ fontSize: FONT_SIZES.base, color: COLORS.text2 }}>{rev.comment}</Text>}
                  {rev.seller_response && (
                    <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: COLORS.border }}>
                      <Text style={{ fontSize: FONT_SIZES.xs, color: COLORS.blue, fontWeight: FONT_WEIGHTS.semibold }}>Your reply:</Text>
                      <Text style={{ fontSize: FONT_SIZES.sm, color: COLORS.text2, marginTop: 2 }}>{rev.seller_response}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <EmptyState
              icon="star-outline"
              title="No reviews yet"
              hint={isSeller ? 'Reviews from buyers will appear here' : 'Reviews you leave will appear here'}
              size={56}
            />
          )
        )}

        {activeTab === 'saved' && (
          wishlist.length > 0 ? (
            <MasonryGrid
              products={wishlist}
              standalone={false}
              contentFit="contain"
              columnGap={3}
              sidePad={0}
              onPress={handleProductPress}
            />
          ) : (
            <EmptyState
              icon="heart-outline"
              title="No saved items"
              hint="Tap the heart icon on products you like"
              size={56}
            />
          )
        )}
      </View>

      {/* ── Bottom Spacer ── */}
      <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingBottom: 100 },

  /* Sticky header */
  stickyHeader: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
  },
  stickyHeaderInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
  },
  headerBtn: {
    width: TOUCH.min, height: TOUCH.min,
    alignItems: 'center', justifyContent: 'center',
  },
  topBarNameCenter: { flex: 1, alignItems: 'center' },
  topBarNameWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  topBarName: { fontSize: FONT_SIZES.title, fontFamily: FONTS.heading, fontWeight: FONT_WEIGHTS.bold, color: COLORS.text },
  scrollView: { flex: 1 },

  /* Hero */
  hero: { backgroundColor: COLORS.surface, paddingBottom: SPACING.lg, position: 'relative' },
  avatarRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingTop: 60,
  },
  nameBioBlock: { paddingHorizontal: SPACING.lg, paddingTop: 12 },
  bio: { fontSize: FONT_SIZES.base, color: COLORS.text2, lineHeight: 20, marginTop: 6 },
  metaRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md,
    marginTop: SPACING.sm,
  },
  metaItem: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  metaText: { fontSize: FONT_SIZES.xs, color: COLORS.text3 },

  /* Identity Toggle */
  identityToggle: {
    flexDirection: 'row', marginHorizontal: SPACING.lg, marginTop: SPACING.md,
    backgroundColor: COLORS.surface2, borderRadius: RADIUS.pill, padding: 3,
  },
  identityBtn: { flex: 1, paddingVertical: 7, borderRadius: RADIUS.pill, alignItems: 'center' },
  identityBtnActive: { backgroundColor: COLORS.coral },
  identityBtnText: { fontSize: FONT_SIZES.sm, fontWeight: FONT_WEIGHTS.bold, color: COLORS.text2 },
  identityBtnTextActive: { color: COLORS.white },

  /* Trust Line */
  trustLine: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: SPACING.lg, paddingTop: 8,
  },
  trustLineText: { fontSize: FONT_SIZES.sm, color: COLORS.text2 },

  /* Stats */
  statsRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center' },
  statNum: { fontSize: FONT_SIZES.title, fontFamily: FONTS.heading, fontWeight: FONT_WEIGHTS.bold, color: COLORS.text, lineHeight: 22 },
  statLabel: { fontSize: FONT_SIZES.xs, color: COLORS.text2, marginTop: 2 },

  /* Action Buttons */
  actionRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: SPACING.lg, paddingTop: 14,
  },
  actionBtn: {
    flex: 1, minHeight: TOUCH.min, borderRadius: RADIUS.button,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
  },
  actionBtnText: { fontSize: FONT_SIZES.sm, fontWeight: FONT_WEIGHTS.bold, color: COLORS.text },

  /* Tabs */
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  tab: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: COLORS.coral },

  /* Tab Content */
  tabContent: { paddingTop: SPACING.md },
  masonryGrid: { flexDirection: 'row', gap: 3 },
  masonryCol: { flex: 1, gap: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  card: {
    borderRadius: RADIUS.row, overflow: 'hidden',
    backgroundColor: COLORS.surface2,
  },
  cardImgWrap: {
    width: '100%', backgroundColor: COLORS.surface2, position: 'relative',
  },
  cardPlaceholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.surface2,
  },
  cardPriceTop: {
    position: 'absolute', top: 6, right: 6, zIndex: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: RADIUS.sm,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  cardStockBadge: {
    position: 'absolute', bottom: 6, left: 6, zIndex: 6,
  },
  imgDots: {
    position: 'absolute', bottom: 8, alignSelf: 'center', zIndex: 6,
    flexDirection: 'row', gap: 4,
  },
  imgDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  imgDotActive: { backgroundColor: COLORS.white, width: 14 },
  cardName: {
    fontSize: FONT_SIZES.sm, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.text,
    paddingHorizontal: 6, paddingTop: 5, paddingBottom: 2,
  },

  /* Reviews */
  reviewCard: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.sm, padding: 14,
    borderRadius: RADIUS.card, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },

  /* Become a Seller Banner */
  sellBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: SPACING.lg, marginTop: SPACING.md, padding: 12,
    backgroundColor: COLORS.greenMuted, borderRadius: RADIUS.card,
    borderWidth: 1, borderColor: COLORS.green + '30',
  },
  sellTitle: { fontSize: FONT_SIZES.base, fontWeight: FONT_WEIGHTS.bold, color: COLORS.green },
  sellHint: { fontSize: FONT_SIZES.xs, color: COLORS.text2, marginTop: 1 },

});
