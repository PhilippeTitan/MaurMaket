import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl, useWindowDimensions, FlatList,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '../components/icons/Icon';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING, RADIUS, getDisplayName, formatPrice } from '../theme';
import { useTranslation } from '../i18n';
import { useUser } from '../hooks';
import { store } from '../store';
import {
  getOrders, getSellerOrders, getSellerAnalytics, getWishlist,
  getSellerProducts, getFollowerCount, getFollowing, getImageUrl, getSellerReviews, updateSellerProfile,
} from '../api';
import type { RootStackParamList } from '../navigation';
import type { Product, Order, Review } from '../types';
import SalePriceTag from '../components/SalePriceTag';
import StockBadge from '../components/StockBadge';
import UserAvatar from '../components/UserAvatar';
import { SkeletonBlock } from '../components/Skeleton';

const profileCache: Record<string, { data: any; timestamp: number }> = {};
const CACHE_TTL = 60_000;


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
  const [activeTab, setActiveTab] = useState<Tab>('listings');

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
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [imageSizes, setImageSizes] = useState<Record<string, { w: number; h: number }>>({});
  const [listingImageIndices, setListingImageIndices] = useState<Record<string, number>>({});
  const mountedRef = useRef(true);
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const CARD_W = (SCREEN_W - 3) / 2;
  const DEFAULT_IMG_H = Math.round(CARD_W * 1.25);
  const MIN_H = CARD_W * 0.6;
  const MAX_H = SCREEN_H * 0.52;

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

        products.forEach((p: Product) => {
          const url = getImageUrl(p.images?.find(i => i.is_primary)?.image_url || p.images?.[0]?.image_url);
          if (!url) return;
          Image.getSize(url, (w, h) => {
            if (mountedRef.current) setImageSizes(prev => ({ ...prev, [p.id]: { w, h } }));
          }, () => {});
        });

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

    if (uid) profileCache[uid] = { timestamp: Date.now(), data: cacheData };
    setLoading(false);
  }, [isSeller, user?.id]);

  useFocusEffect(useCallback(() => {
    // Preserve recently loaded profile data on tab return; pull-to-refresh remains explicit.
    fetchData(false);
  }, [fetchData]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData(true);
    setRefreshing(false);
  }, [fetchData]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getCardHeight = (p: Product) => {
    const size = imageSizes[p.id];
    if (size && size.w > 0) {
      const ratio = size.h / size.w;
      return Math.max(MIN_H, Math.min(MAX_H, CARD_W * ratio));
    }
    return DEFAULT_IMG_H;
  };

  const [leftCol, rightCol] = (() => {
    const cols: [Product[], Product[]] = [[], []];
    const heights = [0, 0];
    for (const item of products) {
      const target = heights[0] <= heights[1] ? 0 : 1;
      cols[target].push(item);
      heights[target] += getCardHeight(item) + 3;
    }
    return cols;
  })();

  const renderGridItem = (item: Product) => {
    const isOwnProduct = isSeller && user?.id === item.seller_id;
    const imgFailed = failedImages.has(item.id);
    const cardH = getCardHeight(item);
    const images = item.images && item.images.length > 0
      ? item.images
      : [{ id: 'empty', image_url: '', is_primary: true, display_order: 0 }];
    const hasMore = images.length > 1;
    const primaryUrl = getImageUrl(images.find(i => i.is_primary)?.image_url || images[0]?.image_url);
    const openListing = () => isOwnProduct
      ? nav.navigate('EditListing', { productId: item.id })
      : nav.navigate('ProductDetail', { productId: item.id });
    return (
      <View key={item.id}>
        <View style={styles.card}>
          <View style={[styles.cardImgWrap, { height: cardH }]}>
            {hasMore && !imgFailed ? (
              <FlatList
                data={images}
                horizontal
                pagingEnabled
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                windowSize={3}
                maxToRenderPerBatch={2}
                keyExtractor={(img, idx) => String(img.id || idx)}
                onScroll={(e) => {
                  const index = Math.round(e.nativeEvent.contentOffset.x / CARD_W);
                  if (index !== (listingImageIndices[item.id] ?? 0)) {
                    setListingImageIndices(prev => ({ ...prev, [item.id]: index }));
                  }
                }}
                scrollEventThrottle={16}
                getItemLayout={(_, index) => ({ length: CARD_W, offset: CARD_W * index, index })}
                renderItem={({ item: img }) => {
                  const url = getImageUrl(img.image_url);
                  return (
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={openListing}
                      style={{ width: CARD_W, height: cardH }}
                      accessibilityRole="button"
                      accessibilityLabel={isOwnProduct ? `edit ${item.name}` : item.name}
                    >
                      {url ? (
                        <ExpoImage source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" onError={() => setFailedImages(prev => new Set(prev).add(item.id))} />
                      ) : (
                        <View style={styles.cardPlaceholder}>
                          <Icon name="image-unavailable" size={20} color={COLORS.text2} />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            ) : primaryUrl && !imgFailed ? (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={openListing}
                style={StyleSheet.absoluteFill}
                accessibilityRole="button"
                accessibilityLabel={isOwnProduct ? `edit ${item.name}` : item.name}
              >
                <ExpoImage source={{ uri: primaryUrl }} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" onError={() => setFailedImages(prev => new Set(prev).add(item.id))} />
              </TouchableOpacity>
            ) : (
              <View style={styles.cardPlaceholder}>
                <Icon name="image-unavailable" size={20} color={COLORS.text2} />
              </View>
            )}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.92)']}
              style={styles.cardGradient}
              pointerEvents="none"
            />
            {hasMore && (
              <View style={styles.imgDots} pointerEvents="none">
                {images.map((_, index) => (
                  <View key={index} style={[styles.imgDot, index === (listingImageIndices[item.id] || 0) && styles.imgDotActive]} />
                ))}
              </View>
            )}
            {/* Price — top right */}
            <View style={styles.cardPriceTop} pointerEvents="none">
              <SalePriceTag price={item.price} effectivePrice={item.effective_price ?? item.price} isOnSale={item.is_on_sale || false} discountPct={item.discount_pct || 0} size="sm" />
            </View>
            {/* Stock badge — bottom left */}
            <View style={styles.cardStockBadge} pointerEvents="none">
              <StockBadge stock={item.stock} size="sm" />
            </View>
          </View>
        </View>
        <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Sticky header — name centered + sell/settings */}
      <View style={[styles.stickyHeader, { paddingTop: insets.top + 6, paddingBottom: 8, backgroundColor: `rgba(13,17,23,${headerBg})` }]}>
        <View style={styles.stickyHeaderInner}>
          <TouchableOpacity
            style={styles.sellBtn}
            onPress={() => nav.navigate(store.isSeller ? 'AddListing' : 'SellerOnboarding')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="add listing"
          >
            <MaterialCommunityIcons name="plus" size={28} color={COLORS.text} />
          </TouchableOpacity>

          <View style={styles.topBarNameCenter}>
            <View style={styles.topBarNameWrap}>
              <Text style={styles.topBarName} numberOfLines={1}>@{user?.username || 'you'}</Text>
              {(tier === 'verified' || tier === 'business') && (
                <Icon name="verified" size={18} color={tier === 'business' ? COLORS.coral : COLORS.blue} />
              )}
            </View>
          </View>

          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => nav.navigate('Settings')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="settings"
          >
            <MaterialCommunityIcons name="cog-outline" size={26} color={COLORS.text} />
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
      {/* Hero */}
      <View style={styles.hero}>

        {/* Avatar with TierRing + Stats row */}
        <View style={[styles.avatarRow, { paddingTop: SPACING.md }]}>
          <UserAvatar seller={{ ...user, seller_tier: tier } as any} size={76} animated={true} />
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{isSeller ? sellingOrderCount : orderCount}</Text>
              <Text style={styles.statLabel}>{isSeller ? 'Sales' : t('me.totalOrders')}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{followerCount}</Text>
              <Text style={styles.statLabel}>{t('me.followers')}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{followingCount}</Text>
              <Text style={styles.statLabel}>{t('me.following')}</Text>
            </View>
          </View>
        </View>

        {/* Personal / Business toggle — business-tier sellers only */}
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
            <Text style={styles.trustLineText}>Operated by <Text style={{ color: COLORS.text, fontWeight: '700' }}>@{user.username}</Text> · Verified identity on file</Text>
          </View>
        )}

        {/* Trust chips */}
        <View style={styles.trustChipsRow}>
          {isSeller && tier === 'verified' && (
            <View style={[styles.trustChip, { backgroundColor: COLORS.blue + '18', borderColor: COLORS.blue + '40' }]}>
              <Icon name="verified" size={12} color={COLORS.blue} />
              <Text style={[styles.trustChipText, { color: COLORS.blue }]}>Verified Seller</Text>
            </View>
          )}
          {isSeller && tier === 'business' && (
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

        {/* Bio + member since + optional real-name reveal */}
        <View style={styles.nameBioBlock}>
          {user?.bio ? (
            <Text style={styles.bio} numberOfLines={2}>{user.bio}</Text>
          ) : null}
          {user?.show_real_name && user?.full_name && !isBusinessMode && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
              <Icon name="verified" size={11} color={COLORS.green} />
              <Text style={{ fontSize: 12, color: COLORS.text }}>{user.full_name}</Text>
            </View>
          )}
          {memberSince ? <Text style={styles.memberSince}>{memberSince}</Text> : null}
        </View>

      {/* Action buttons — inside hero */}
      <View style={styles.sellerActions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => nav.navigate('EditProfile')}
          accessibilityRole="button"
          accessibilityLabel="edit profile"
        >
          <Icon name="edit" size={16} color={COLORS.text} />
          <Text style={[styles.actionBtnText, { color: COLORS.text }]}>{t('me.editProfile')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => {}}
          accessibilityRole="button"
          accessibilityLabel="share profile"
        >
          <MaterialCommunityIcons name="share-variant-outline" size={16} color={COLORS.text} />
          <Text style={[styles.actionBtnText, { color: COLORS.text }]}>Share</Text>
        </TouchableOpacity>
        {isSeller && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => nav.navigate('Analytics')}
            accessibilityRole="button"
            accessibilityLabel="analytics"
          >
            <MaterialCommunityIcons name="chart-line" size={16} color={COLORS.text} />
            <Text style={[styles.actionBtnText, { color: COLORS.text }]}>Analytics</Text>
          </TouchableOpacity>
        )}
      </View>

        {/* Dark fade at bottom of hero */}
        <LinearGradient
          colors={['transparent', 'rgba(13,17,23,0.78)', '#0D1117']}
          style={styles.heroFade}
          pointerEvents="none"
        />
      </View>

      {/* Become a Seller CTA for buyers */}
      {!isSeller && (
        <TouchableOpacity
          style={styles.sellBanner}
          onPress={() => nav.navigate('SellerOnboarding')}
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

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'listings' && styles.tabActive]}
          onPress={() => setActiveTab('listings')}
          accessibilityRole="button"
          accessibilityLabel="listings"
          accessibilityState={{ selected: activeTab === 'listings' }}
        >
          <MaterialCommunityIcons
            name={isSeller ? 'view-grid-outline' : 'shopping-outline'}
            size={22}
            color={activeTab === 'listings' ? COLORS.text : COLORS.text2}
          />
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
        <TouchableOpacity
          style={[styles.tab, activeTab === 'saved' && styles.tabActive]}
          onPress={() => setActiveTab('saved')}
          accessibilityRole="button"
          accessibilityLabel="saved"
          accessibilityState={{ selected: activeTab === 'saved' }}
        >
          <MaterialCommunityIcons
            name="heart-outline"
            size={22}
            color={activeTab === 'saved' ? COLORS.text : COLORS.text2}
          />
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      <View style={styles.tabContent}>
        {activeTab === 'listings' && (
          isSeller ? (
            loading && products.length === 0 ? (
              <View style={styles.masonryGrid}>
                <View style={styles.masonryCol}>
                  {[CARD_W * 1.1, CARD_W * 0.8, CARD_W * 1.2].map((h, i) => (
                    <SkeletonBlock key={i} width="100%" height={h} radius={RADIUS.media} />
                  ))}
                </View>
                <View style={styles.masonryCol}>
                  {[CARD_W * 0.9, CARD_W * 1.3, CARD_W * 0.7].map((h, i) => (
                    <SkeletonBlock key={i} width="100%" height={h} radius={RADIUS.media} />
                  ))}
                </View>
              </View>
            ) : products.length > 0 ? (
              <View style={styles.masonryGrid}>
                <View style={styles.masonryCol}>
                  {leftCol.map(renderGridItem)}
                </View>
                <View style={styles.masonryCol}>
                  {rightCol.map(renderGridItem)}
                </View>
              </View>
            ) : (
              <View style={styles.empty}>
                <Icon name="storefront" size={32} color={COLORS.text2} />
                <Text style={styles.emptyText}>{t('me.noListings')}</Text>
                <Text style={styles.emptyHint}>Add your first product so buyers have something to open from your shop.</Text>
                <TouchableOpacity style={styles.emptyAction} onPress={() => nav.navigate('AddListing')} accessibilityRole="button" accessibilityLabel="add listing">
                  <Icon name="plus" size={16} color={COLORS.white} />
                  <Text style={styles.emptyActionText}>Add listing</Text>
                </TouchableOpacity>
              </View>
            )
          ) : (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="shopping-outline" size={32} color={COLORS.text2} />
              <Text style={styles.emptyText}>No recent orders</Text>
              <Text style={styles.emptyHint}>Your purchases will appear here</Text>
            </View>
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
                    <Text style={{ fontSize: 11, color: COLORS.text2 }}>{new Date(rev.created_at).toLocaleDateString()}</Text>
                  </View>
                  {rev.comment && <Text style={{ fontSize: 13, color: COLORS.text2 }}>{rev.comment}</Text>}
                  {rev.seller_response && (
                    <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: COLORS.border }}>
                      <Text style={{ fontSize: 11, color: COLORS.blue, fontWeight: '600' }}>Your reply:</Text>
                      <Text style={{ fontSize: 12, color: COLORS.text2, marginTop: 2 }}>{rev.seller_response}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="star-outline" size={32} color={COLORS.text2} />
              <Text style={styles.emptyText}>No reviews yet</Text>
              <Text style={styles.emptyHint}>
                {isSeller ? 'Reviews from buyers will appear here' : 'Reviews you leave will appear here'}
              </Text>
            </View>
          )
        )}

        {activeTab === 'saved' && (
          wishlist.length > 0 ? (
            <View style={styles.grid}>
              {wishlist.map(renderGridItem)}
            </View>
          ) : (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="heart-outline" size={32} color={COLORS.text2} />
              <Text style={styles.emptyText}>No saved items</Text>
              <Text style={styles.emptyHint}>Tap the heart icon on products you like</Text>
            </View>
          )
        )}
      </View>
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
  sellBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  topBarNameCenter: { flex: 1, alignItems: 'center' },
  topBarNameWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  topBarName: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  settingsBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  scrollView: { flex: 1 },

  /* Hero */
  hero: { backgroundColor: COLORS.surface, paddingBottom: SPACING.lg, position: 'relative' },
  heroFade: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 40,
  },
  avatarRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingTop: 60,
  },
  nameBioBlock: { paddingHorizontal: SPACING.lg, paddingTop: 12 },
  bio: { fontSize: 13, color: COLORS.text2, lineHeight: 20, marginTop: 6 },
  memberSince: { fontSize: 11, color: COLORS.text2, opacity: 0.65, marginTop: 4 },

  /* Identity Toggle */
  identityToggle: {
    flexDirection: 'row', marginHorizontal: SPACING.lg, marginTop: SPACING.md,
    backgroundColor: COLORS.surface2, borderRadius: 999, padding: 3,
  },
  identityBtn: { flex: 1, paddingVertical: 7, borderRadius: 999, alignItems: 'center' },
  identityBtnActive: { backgroundColor: COLORS.coral },
  identityBtnText: { fontSize: 12.5, fontWeight: '700', color: COLORS.text2 },
  identityBtnTextActive: { color: '#fff' },

  /* Trust Line */
  trustLine: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: SPACING.lg, paddingTop: 8,
  },
  trustLineText: { fontSize: 11.5, color: COLORS.text2 },

  /* Trust Chips */
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

  /* Stats */
  statsRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 18, fontWeight: '800', color: COLORS.text, lineHeight: 22 },
  statLabel: { fontSize: 11, color: COLORS.text2, marginTop: 2 },

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
  tabActive: { borderBottomColor: COLORS.text },

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
  cardImg: { width: '100%', height: '100%' },
  cardPlaceholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.surface2,
  },
  cardGradient: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: '55%', zIndex: 5,
  },
  cardPriceTop: {
    position: 'absolute', top: 6, right: 6, zIndex: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6,
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
    fontSize: 12.5, fontWeight: '600', color: COLORS.text,
    paddingHorizontal: 6, paddingTop: 5, paddingBottom: 2,
  },
  /* Empty */
  empty: { alignItems: 'center', paddingVertical: 40, gap: 6 },
  emptyText: { fontSize: 14, color: COLORS.text2, fontWeight: '600' },
  emptyHint: { fontSize: 12, color: COLORS.text2, opacity: 0.7, textAlign: 'center', paddingHorizontal: 20 },

  /* Reviews */
  reviewCard: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.sm, padding: 14,
    borderRadius: RADIUS.card, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },

  /* Become a Seller Banner */
  sellBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: SPACING.lg, marginTop: SPACING.md, padding: 12,
    backgroundColor: COLORS.green + '10', borderRadius: RADIUS.card,
    borderWidth: 1, borderColor: COLORS.green + '30',
  },
  sellTitle: { fontSize: 13, fontWeight: '700', color: COLORS.green },
  sellHint: { fontSize: 11, color: COLORS.text2, marginTop: 1 },

  /* Seller Actions Bar */
  sellerActions: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: SPACING.lg, paddingTop: 14,
  },
  actionBtn: {
    flex: 1, minHeight: 44, borderRadius: RADIUS.button,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
  },
  actionBtnText: { fontSize: 13, fontWeight: '700' },
  emptyAction: {
    marginTop: 8, minHeight: 38, paddingHorizontal: 14, borderRadius: RADIUS.row,
    backgroundColor: COLORS.coral, flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  emptyActionText: { fontSize: 12, color: COLORS.white, fontWeight: '800' },
});
