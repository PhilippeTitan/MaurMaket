const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '..', 'src', 'screens', 'MeScreen.tsx');

const content = `import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  Share, Alert,
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
import { useUser } from '../hooks';
import { store } from '../store';
import {
  getOrders, getSellerOrders, getSellerAnalytics, getWishlist,
  getSellerProducts, getFollowerCount, getFollowing, getSellerReviews,
  updateSellerProfile, pinListing, updateProduct,
} from '../api';
import type { RootStackParamList } from '../navigation';
import type { Product, Order, Review } from '../types';
import UserAvatar from '../components/UserAvatar';
import { SkeletonBlock } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import { cacheKeys, readSnapshot, writeSnapshot } from '../offlineCache';
import MasonryGrid from '../components/MasonryGrid';
import { useToast } from '../components/Toast';
import { Image as ExpoImage } from 'expo-image';

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
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const { user, refetch } = useUser();
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
  const [showPausedSection, setShowPausedSection] = useState(false);

  const tier = user?.seller_tier || 'casual';
  const isBusinessMode = isSeller && user?.seller_tier === 'business' && user?.use_store_identity;
  const displayName = isBusinessMode ? (user as any)?.store_name || getDisplayName(user) : getDisplayName(user);

  const memberSince = user?.created_at
    ? \`\${t('me.since')} \${new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}\`
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
      setLoading(false);
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

      let fetchedProducts: Product[] = [];
      let analytics: SellerAnalyticsResponse | null = null;
      let calculatedRating = 0;
      let calculatedReviewCount = 0;
      cacheData.products = fetchedProducts; cacheData.productCount = 0;
      if (isSeller) {
        let sellerProds: { products: Product[] } | null = null;
        try {
          sellerProds = await getSellerProducts() as { products: Product[] };
        } catch (e: any) {
          console.error('[MeScreen] seller products error:', e?.message);
        }
        fetchedProducts = sellerProds?.products || [];
        setProducts(fetchedProducts);
        setProductCount(fetchedProducts.length || 0);
        cacheData.products = fetchedProducts; cacheData.productCount = fetchedProducts.length;

        if (user?.seller_tier !== 'casual') {
          try {
            const anRes = await getSellerAnalytics() as SellerAnalyticsResponse;
            const overview = anRes.overview || anRes;
            calculatedRating = Number(overview.avg_rating || 0);
            calculatedReviewCount = Number(overview.review_count || 0);
            analytics = anRes;
            setRating(calculatedRating); setReviewCount(calculatedReviewCount); setAnalyticsData(anRes);
          } catch { /* ignore */ }
        }
      }
      cacheData.rating = calculatedRating; cacheData.reviewCount = calculatedReviewCount; cacheData.analyticsData = analytics;

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
    } catch (e: any) { console.error(\`[MeScreen fetchData] ERROR:\`, e?.message); }

    if (uid) {
      profileCache[uid] = { timestamp: Date.now(), data: cacheData };
      void writeSnapshot(cacheKeys.profile(uid), cacheData);
    }
    setLoading(false);
  }, [isSeller, user?.id, user?.seller_tier]);

  useFocusEffect(useCallback(() => {
    fetchData(false);
  }, [fetchData]));

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
      await Share.share({
        message: \`Check out @\${user.username} on MaurMaket!\`,
      });
    } catch { /* ignore */ }
  }, [user]);

  const handleTogglePin = useCallback(async (productToPin: Product) => {
    const isCurrentlyPinned = user?.pinned_product_id === productToPin.id;
    try {
      if (isCurrentlyPinned) {
        await pinListing(null);
        toast.show({ kind: 'info', title: 'Listing unpinned from profile' });
      } else {
        await pinListing(productToPin.id);
        toast.show({ kind: 'success', title: 'Listing pinned to profile' });
      }
      await refetch();
      await fetchData(true);
    } catch (e: any) {
      toast.error('Could not update pin', e?.message || 'Please try again.');
    }
  }, [user?.pinned_product_id, refetch, fetchData, toast]);

  const handleResumeProduct = useCallback(async (prod: Product) => {
    try {
      await updateProduct(prod.id, { is_available: true } as any);
      toast.show({ kind: 'success', title: 'Listing reactivated' });
      await fetchData(true);
    } catch (e: any) {
      toast.error('Could not reactivate listing', e?.message || 'Check tier limits in Seller Tools.');
    }
  }, [fetchData, toast]);

  const handleIdentitySwitch = async (useStore: boolean) => {
    if (!user) return;
    try {
      await updateSellerProfile({ useStoreIdentity: useStore });
      await store.setUser({ ...store.user!, use_store_identity: useStore } as any, store.token!);
      toast.show({ kind: 'success', title: useStore ? 'Switched to Business presentation' : 'Switched to Personal presentation' });
      await refetch();
    } catch {
      toast.error('Could not switch presentation', 'Please try again.');
    }
  };

  /* ── Filter listings into active, pinned, and paused ── */
  const pinnedProductId = user?.pinned_product_id;
  const pinnedProduct = products.find(p => p.id === pinnedProductId);
  const activeProducts = products.filter(p => p.is_available !== false && p.id !== pinnedProductId);
  const pausedProducts = products.filter(p => p.is_available === false);

  const tierLabel =
    tier === 'business' ? 'Business Seller'
    : tier === 'verified' ? 'Verified Seller'
    : 'Casual Seller';

  return (
    <View style={styles.container}>
      {/* Sticky header */}
      <View style={[styles.stickyHeader, { paddingTop: insets.top + 6, paddingBottom: 8, backgroundColor: \`rgba(13,17,23,\${headerBg})\` }]}>
        <View style={styles.stickyHeaderInner}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => nav.navigate(store.isSeller ? 'AddListing' : 'SellerOnboarding')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="add listing"
          >
            <MaterialCommunityIcons name="plus" size={32} color={COLORS.text} />
          </TouchableOpacity>

          <View style={styles.topBarNameCenter}>
            <View style={styles.topBarNameWrap}>
              <Text style={styles.topBarName} numberOfLines={1}>{user?.username || 'you'}</Text>
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
            <MaterialCommunityIcons name="cog-outline" size={28} color={COLORS.text} />
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
            <UserAvatar seller={{ ...user, seller_tier: tier } as any} size={74} animated={true} />
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statNum}>{isSeller ? sellingOrderCount : orderCount}</Text>
                <Text style={styles.statLabel}>{isSeller ? 'Sales' : t('me.totalOrders')}</Text>
              </View>
              <TouchableOpacity
                style={styles.stat}
                onPress={() => user && nav.navigate('FollowList', { userId: user.id, kind: 'followers', title: t('me.followers') })}
              >
                <Text style={styles.statNum}>{followerCount}</Text>
                <Text style={styles.statLabel}>{t('me.followers')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stat}
                onPress={() => user && nav.navigate('FollowList', { userId: user.id, kind: 'following', title: t('me.following') })}
              >
                <Text style={styles.statNum}>{followingCount}</Text>
                <Text style={styles.statLabel}>{t('me.following')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Identity Presentation Toggle — business sellers only */}
          {isSeller && user?.seller_tier === 'business' && (
            <View style={styles.identityToggle}>
              <TouchableOpacity
                style={[styles.identityBtn, !user?.use_store_identity && styles.identityBtnActive]}
                onPress={() => handleIdentitySwitch(false)}
                accessibilityRole="button"
                accessibilityLabel="personal mode"
              >
                <Text style={[styles.identityBtnText, !user?.use_store_identity && styles.identityBtnTextActive]}>Personal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.identityBtn, user?.use_store_identity && styles.identityBtnActive]}
                onPress={() => handleIdentitySwitch(true)}
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
              <Text style={styles.trustLineText}>
                Operated by <Text style={{ color: COLORS.text, fontWeight: FONT_WEIGHTS.bold }}>{user.username}</Text> · Verified identity on file
              </Text>
            </View>
          )}

          {/* Name, bio, member since */}
          <View style={styles.nameBioBlock}>
            <Text style={styles.displayName}>{displayName}</Text>
            {user?.bio ? (
              <Text style={styles.bio} numberOfLines={2}>{user.bio}</Text>
            ) : null}
            {user?.show_real_name && user?.full_name && !isBusinessMode && (
              <View style={styles.realNameRow}>
                <Icon name="verified" size={11} color={COLORS.green} />
                <Text style={styles.realNameText}>{user.full_name}</Text>
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

          {/* Action Buttons: Edit Profile, Share Profile, View as Visitor */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => nav.navigate('EditProfile')}
              accessibilityRole="button"
              accessibilityLabel="edit profile"
            >
              <Icon name="edit" size={15} color={COLORS.text} />
              <Text style={styles.actionBtnText}>{t('me.editProfile')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={handleShareProfile}
              accessibilityRole="button"
              accessibilityLabel="share profile"
            >
              <MaterialCommunityIcons name="share-variant-outline" size={15} color={COLORS.text} />
              <Text style={styles.actionBtnText}>{t('me.sharedProfile')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => user && nav.navigate('Storefront', { sellerId: user.id })}
              accessibilityRole="button"
              accessibilityLabel="view as visitor"
            >
              <MaterialCommunityIcons name="eye-outline" size={15} color={COLORS.text} />
              <Text style={styles.actionBtnText}>Visitor View</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Compact Seller Tools Entry (Identity-first architecture) ── */}
        {isSeller && (
          <TouchableOpacity
            style={styles.sellerToolsBanner}
            onPress={() => nav.navigate('SellerToolsSettings')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="open seller tools"
          >
            <View style={styles.sellerToolsIconWrap}>
              <MaterialCommunityIcons name="storefront-outline" size={20} color={COLORS.coral} />
            </View>
            <View style={styles.sellerToolsInfo}>
              <View style={styles.sellerToolsHeaderRow}>
                <Text style={styles.sellerToolsTitle}>Seller Tools</Text>
                <View style={[styles.tierTag, { backgroundColor: (TIER_COLORS[tier] || COLORS.blue) + '20' }]}>
                  <Text style={[styles.tierTagText, { color: TIER_COLORS[tier] || COLORS.blue }]}>{tierLabel}</Text>
                </View>
              </View>
              <Text style={styles.sellerToolsSub}>
                {products.length} {products.length === 1 ? 'listing' : 'listings'} · {sellingOrderCount} completed sales
              </Text>
            </View>
            <Icon name="chevron-right" size={18} color={COLORS.text2} />
          </TouchableOpacity>
        )}

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
              ) : (
                <View>
                  {/* Pinned Listing Highlight */}
                  {pinnedProduct && (
                    <View style={styles.pinnedBox}>
                      <View style={styles.pinnedBoxHeader}>
                        <View style={styles.pinnedLabelWrap}>
                          <MaterialCommunityIcons name="pin" size={14} color={COLORS.coral} />
                          <Text style={styles.pinnedLabel}>Pinned to Profile</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.unpinBtn}
                          onPress={() => handleTogglePin(pinnedProduct)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={styles.unpinText}>Unpin</Text>
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity
                        style={styles.pinnedItemRow}
                        onPress={() => handleProductPress(pinnedProduct)}
                        activeOpacity={0.8}
                      >
                        {pinnedProduct.images?.[0]?.image_url ? (
                          <ExpoImage source={{ uri: pinnedProduct.images[0].image_url }} style={styles.pinnedItemImg} contentFit="cover" />
                        ) : (
                          <View style={styles.pinnedItemPlaceholder}>
                            <MaterialCommunityIcons name="image-outline" size={22} color={COLORS.text3} />
                          </View>
                        )}
                        <View style={styles.pinnedItemDetails}>
                          <Text style={styles.pinnedItemName} numberOfLines={1}>{pinnedProduct.name}</Text>
                          <Text style={styles.pinnedItemPrice}>{formatPrice(pinnedProduct.price)}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.editPenSmall}
                          onPress={() => nav.navigate('EditListing', { productId: pinnedProduct.id })}
                        >
                          <MaterialCommunityIcons name="pencil" size={14} color={COLORS.text} />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Active listings masonry grid */}
                  {activeProducts.length > 0 ? (
                    <MasonryGrid
                      products={activeProducts}
                      standalone={false}
                      columnGap={3}
                      sidePad={0}
                      onPress={handleProductPress}
                      renderCardOverlay={(item) => (
                        <View style={styles.cardActionsOverlay}>
                          <TouchableOpacity
                            style={styles.editPenBtn}
                            onPress={() => nav.navigate('EditListing', { productId: item.id })}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel="edit listing"
                          >
                            <MaterialCommunityIcons name="pencil" size={14} color={COLORS.white} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.pinIconBtn}
                            onPress={() => handleTogglePin(item)}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel="pin listing"
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
                    />
                  ) : null}

                  {/* Paused listings accordion */}
                  {pausedProducts.length > 0 && (
                    <View style={styles.pausedSection}>
                      <TouchableOpacity
                        style={styles.pausedHeader}
                        onPress={() => setShowPausedSection(prev => !prev)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.pausedHeaderLeft}>
                          <MaterialCommunityIcons name="pause-circle-outline" size={16} color={COLORS.yellow} />
                          <Text style={styles.pausedTitle}>Paused Listings ({pausedProducts.length})</Text>
                        </View>
                        <MaterialCommunityIcons
                          name={showPausedSection ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color={COLORS.text2}
                        />
                      </TouchableOpacity>

                      {showPausedSection && (
                        <View style={styles.pausedList}>
                          {pausedProducts.map(p => (
                            <View key={p.id} style={styles.pausedCard}>
                              <View style={styles.pausedCardInfo}>
                                <Text style={styles.pausedCardName} numberOfLines={1}>{p.name}</Text>
                                <View style={styles.pausedReasonRow}>
                                  <View style={[styles.pausedBadge, p.paused_reason === 'tier_cap' && { backgroundColor: COLORS.coral + '20' }]}>
                                    <Text style={[styles.pausedBadgeText, p.paused_reason === 'tier_cap' && { color: COLORS.coral }]}>
                                      {p.paused_reason === 'tier_cap' ? 'Paused (Plan Cap)' : 'Paused'}
                                    </Text>
                                  </View>
                                  <Text style={styles.pausedPrice}>{formatPrice(p.price)}</Text>
                                </View>
                              </View>
                              <TouchableOpacity
                                style={styles.resumeBtn}
                                onPress={() => handleResumeProduct(p)}
                              >
                                <Text style={styles.resumeBtnText}>Resume</Text>
                              </TouchableOpacity>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )
            ) : (
              <EmptyState
                icon="shopping-outline"
                title={t('me.noRecentOrders')}
                hint={t('me.purchasesHint')}
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
                        {[1, 2, 3, 4, 5].map(s => (
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
                title={t('me.noReviews')}
                hint={isSeller ? t('me.reviewsHintSeller') : t('me.reviewsHintBuyer')}
                size={56}
              />
            )
          )}

          {activeTab === 'saved' && (
            wishlist.length > 0 ? (
              <MasonryGrid
                products={wishlist}
                standalone={false}
                columnGap={3}
                sidePad={0}
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
    width: TOUCH.recommended, height: TOUCH.recommended,
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

  /* Card Overlays */
  cardActionsOverlay: {
    position: 'absolute', top: 8, left: 8, flexDirection: 'row', gap: 6,
  },
  editPenBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  pinIconBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },

  nameBioBlock: { paddingHorizontal: SPACING.lg, paddingTop: 12 },
  displayName: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  realNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  realNameText: { fontSize: FONT_SIZES.sm, color: COLORS.text2 },
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
  identityBtn: { flex: 1, paddingVertical: 8, borderRadius: RADIUS.pill, alignItems: 'center', minHeight: 36, justifyContent: 'center' },
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
  statsRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  stat: { alignItems: 'center', minWidth: 44, minHeight: 44, justifyContent: 'center' },
  statNum: { fontSize: FONT_SIZES.title, fontFamily: FONTS.heading, fontWeight: FONT_WEIGHTS.bold, color: COLORS.text, lineHeight: 22 },
  statLabel: { fontSize: FONT_SIZES.xs, color: COLORS.text2, marginTop: 2 },

  /* Action Buttons */
  actionRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: SPACING.lg, paddingTop: 14,
  },
  actionBtn: {
    flex: 1, minHeight: TOUCH.min, borderRadius: RADIUS.button,
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
  },
  actionBtnText: { fontSize: 13, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.text },

  /* Seller Tools Banner */
  sellerToolsBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: SPACING.lg, marginTop: SPACING.md, padding: 12,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.card,
    borderWidth: 1, borderColor: COLORS.border, minHeight: 48,
  },
  sellerToolsIconWrap: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  sellerToolsInfo: { flex: 1, gap: 2 },
  sellerToolsHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sellerToolsTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  tierTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADIUS.pill },
  tierTagText: { fontSize: 10, fontWeight: '700' },
  sellerToolsSub: { fontSize: 11.5, color: COLORS.text2 },

  /* Tabs */
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface, marginTop: SPACING.sm,
  },
  tab: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: 'transparent',
    minHeight: 44,
  },
  tabActive: { borderBottomColor: COLORS.coral },

  /* Tab Content */
  tabContent: { paddingTop: SPACING.sm },
  masonryGrid: { flexDirection: 'row', gap: 3 },
  masonryCol: { flex: 1, gap: 3 },

  /* Pinned Box */
  pinnedBox: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md, padding: 10,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.card,
    borderWidth: 1, borderColor: COLORS.coral + '50',
  },
  pinnedBoxHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  pinnedLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pinnedLabel: { fontSize: 11.5, fontWeight: '700', color: COLORS.coral, textTransform: 'uppercase', letterSpacing: 0.5 },
  unpinBtn: { paddingHorizontal: 8, paddingVertical: 2 },
  unpinText: { fontSize: 11, color: COLORS.text3, fontWeight: '600' },
  pinnedItemRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pinnedItemImg: { width: 50, height: 50, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface2 },
  pinnedItemPlaceholder: { width: 50, height: 50, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center' },
  pinnedItemDetails: { flex: 1, gap: 2 },
  pinnedItemName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  pinnedItemPrice: { fontSize: 13, fontWeight: '800', color: COLORS.coral },
  editPenSmall: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.surface2,
    alignItems: 'center', justifyContent: 'center',
  },

  /* Paused Section */
  pausedSection: {
    marginHorizontal: SPACING.md, marginTop: SPACING.lg,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.card,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
  },
  pausedHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 12, minHeight: 44,
  },
  pausedHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pausedTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  pausedList: { paddingHorizontal: 12, paddingBottom: 10, gap: 8 },
  pausedCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  pausedCardInfo: { flex: 1, gap: 4 },
  pausedCardName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  pausedReasonRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pausedBadge: {
    backgroundColor: COLORS.surface2, paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: RADIUS.pill,
  },
  pausedBadgeText: { fontSize: 10, color: COLORS.text2, fontWeight: '600' },
  pausedPrice: { fontSize: 12, fontWeight: '700', color: COLORS.text2 },
  resumeBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border,
    minHeight: 36, alignItems: 'center', justifyContent: 'center',
  },
  resumeBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.coral },

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
`;

fs.writeFileSync(targetPath, content, 'utf8');
console.log('MeScreen.tsx updated successfully');
