import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Animated,
  RefreshControl, ActivityIndicator, LayoutChangeEvent, Modal, Pressable, Platform, ScrollView, Share as RNShare,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@/components/icons/UnifiedIcon';
import { Icon } from '../components/icons/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ViewToken } from 'react-native';
import { COLORS, SPACING, RADIUS, getDisplayName } from '../theme';
import {
  getProducts, getImageUrl, getUnreadCount, getFollowing,
  trackFeedEvent, getActiveOrderCount,
} from '../api';
import { store } from '../store';
import type { Product } from '../types';
import type { RootStackParamList } from '../navigation';
import { useTranslation } from '@/localization';
import SalePriceTag from '../components/SalePriceTag';
import BuyRow from '../components/BuyRow';
import StockBadge from '../components/StockBadge';
import FollowButton from '../components/FollowButton';
import UserAvatar from '../components/UserAvatar';
import EmptyState from '../components/EmptyState';
import { SkeletonBlock } from '../components/Skeleton';
import { tapLight } from '../haptics';
import FeedLikeButton from '../components/FeedLikeButton';
import FeedSaveButton from '../components/FeedSaveButton';
import { useToast } from '../components/Toast';
import ReportModal from '../components/ReportModal';
import { queryClient, useViewport } from '../hooks';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { useLowDataMode } from '../hooks/useLowDataMode';
import { cacheKeys, readSnapshot, writeSnapshot } from '../offlineCache';
import { network } from '../network';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const FEED_VIEWABILITY_CONFIG = { viewAreaCoveragePercentThreshold: 80 };
const RECOMMENDATION_REASON_KEYS: Record<string, string> = {
  similar_people: 'feed.reasonSimilarPeople',
  similar_items: 'feed.reasonSimilarItems',
  category_browsing: 'feed.reasonCategoryBrowsing',
  trending: 'feed.reasonTrending',
  category_interest: 'feed.reasonCategoryInterest',
  followed_seller: 'feed.reasonFollowedSeller',
  purchase_history: 'feed.reasonPurchaseHistory',
  picked_for_you: 'feed.reasonPickedForYou',
};

export default function FeedScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  // The carousel's page width has to be the width the pages are laid out at, read live:
  // a rotated phone or a resized window re-renders the pages at the new width, so the
  // paging offset and the page index stay in step instead of snapping to the old size.
  const vp = useViewport();
  const reduceMotion = useReduceMotion();
  const lowDataMode = useLowDataMode();
  const [products, setProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [screenHeight, setScreenHeight] = useState(0);
  const [cartCount, setCartCount] = useState(store.cartCount);
  const [unreadCount, setUnreadCount] = useState(0);
  const [moreProduct, setMoreProduct] = useState<Product | null>(null);
  const [reportProduct, setReportProduct] = useState<Product | null>(null);
  const [reasonProduct, setReasonProduct] = useState<Product | null>(null);
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [feedTab, setFeedTab] = useState<'forYou' | 'new'>('new');
  const flatListRef = useRef<FlatList>(null);
  const activeProductIdRef = useRef<string | null>(null);
  const productsRef = useRef<Product[]>([]);
  const transitionOpacity = useRef(new Animated.Value(1)).current;
  const viewStartTime = useRef<number>(Date.now());
  const currentProductId = useRef<string | null>(null);
  const scrollOffsetRef = useRef(0);
  const dragStartIndexRef = useRef(0);
  const viewedProductIds = useRef<Set<string>>(new Set());

  const recommendationReasonText = useCallback((reason?: string) => {
    if (!reason) return '';
    let key = RECOMMENDATION_REASON_KEYS[reason];
    // Cached feed snapshots may still contain the previous prose values.
    if (!key && reason.startsWith('Browsing ')) key = 'feed.reasonCategoryBrowsing';
    if (!key && reason.startsWith('Because you like ')) key = 'feed.reasonCategoryInterest';
    if (!key && reason === 'People like you also liked this') key = 'feed.reasonSimilarPeople';
    if (!key && reason === "Similar to what you've browsed") key = 'feed.reasonSimilarItems';
    if (!key && reason === 'Trending right now') key = 'feed.reasonTrending';
    if (!key && reason === 'From a seller you follow') key = 'feed.reasonFollowedSeller';
    if (!key && reason === 'Based on your purchases') key = 'feed.reasonPurchaseHistory';
    return t(key || 'feed.reasonPickedForYou');
  }, [t]);

  useEffect(() => { productsRef.current = products; }, [products]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    // Track dwell time for previous product
    if (currentProductId.current) {
      const dwell = Date.now() - viewStartTime.current;
      if (dwell > 2000) {
        trackFeedEvent(currentProductId.current, 'dwell', dwell).catch(() => {});
      }
    }
    // Start tracking new product
    const visible = viewableItems[0];
    if (visible?.item) {
      const productId = visible.item.id;
      currentProductId.current = productId;
      viewStartTime.current = Date.now();
      // Fire 'view' event once per product per session
      if (!viewedProductIds.current.has(productId)) {
        viewedProductIds.current.add(productId);
        if (viewedProductIds.current.size > 100) {
          const oldestId = viewedProductIds.current.values().next().value;
          if (oldestId) viewedProductIds.current.delete(oldestId);
        }
        trackFeedEvent(productId, 'view').catch(() => {});
      }
      if (activeProductIdRef.current !== productId) {
        activeProductIdRef.current = productId;
        setActiveProductId(productId);
        if (!reduceMotion) {
          transitionOpacity.setValue(0.88);
          Animated.timing(transitionOpacity, { toValue: 1, duration: 140, useNativeDriver: true }).start();
        }
      }
      const visibleIndex = visible.index ?? productsRef.current.findIndex((product) => product.id === productId);
      const nextProduct = visibleIndex >= 0 ? productsRef.current[visibleIndex + 1] : undefined;
      const nextImage = nextProduct?.images?.find((image) => image.is_primary) || nextProduct?.images?.[0];
      const nextImageUrl = getImageUrl(nextImage?.thumbnail_url || nextImage?.image_url);
      if (nextImageUrl && !lowDataMode) {
        void ExpoImage.prefetch(nextImageUrl).catch(() => {});
      }
    }
  }, [lowDataMode, reduceMotion, transitionOpacity]);

const fetchProducts = useCallback(async (p = 1, replace = false) => {
    const cacheKey = cacheKeys.feed(feedTab, store.user?.id);
    if (p === 1 && replace) {
      const snapshot = await readSnapshot<{ products: Product[]; pages: number }>(cacheKey);
      if (snapshot?.value.products?.length) {
        const cachedProducts = snapshot.value.products.filter((product) =>
          (!store.isLoggedIn || product.seller_id !== store.user?.id) &&
          !viewedProductIds.current.has(product.id)
        );
        setProducts(cachedProducts);
        setHasMore(1 < snapshot.value.pages);
      }
    }
    try {
      const loadedIds = productsRef.current.map((product) => product.id);
      const excludedIds = Array.from(new Set([...viewedProductIds.current, ...loadedIds])).slice(-100);
      const params: Record<string, string> = { page: String(excludedIds.length ? 1 : p), limit: '20' };
      if (feedTab === 'forYou') {
        params.personalized = 'true';
      } else {
        params.sort = 'newest';
      }
      if (store.isLoggedIn) params.excludeOwnListings = 'true';
      if (excludedIds.length) params.excludeProductIds = excludedIds.join(',');
      const queryKey = ['feed-products', feedTab, p, excludedIds.join(',')] as const;
      const res = await queryClient.fetchQuery({
        queryKey,
        queryFn: () => getProducts(params) as Promise<{ products: Product[]; total: number; pages: number }>,
        staleTime: 30_000,
      });
      if (res.products.length === 0 && excludedIds.length > 0) {
        viewedProductIds.current.clear();
        setPage(1);
        await fetchProducts(1, true);
        return;
      }
      if (replace) {
        setProducts(res.products);
        if (p === 1) void writeSnapshot(cacheKey, { products: res.products, pages: res.pages });
      } else {
        setProducts((prev) => {
          const presentIds = new Set(prev.map((product) => product.id));
          return [
            ...prev,
            ...res.products.filter((product) =>
              !presentIds.has(product.id) && !viewedProductIds.current.has(product.id)
            ),
          ];
        });
      }
      setHasMore(excludedIds.length > 0 ? res.pages > 1 : p < res.pages);
      if (p === 1) setLoading(false);
    } catch {
      if (p === 1) setLoading(false);
      if (replace) toast.error(t('feedback.feedRefreshFailed'), t('feedback.connectionRetry'), () => fetchProducts(p, replace));
    }
  }, [feedTab]);

  useFocusEffect(useCallback(() => { fetchProducts(1, true); }, [feedTab]));

  useEffect(() => {
    const unsub = store.onChange(() => setCartCount(store.cartCount));
    return unsub;
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadUnread = async () => {
      if (network.isOffline) return;
      try {
        const [notifRes, activeRes] = await Promise.allSettled([
          getUnreadCount() as Promise<{ count: string | number }>,
          getActiveOrderCount() as Promise<{ count: number }>,
        ]);
        const notifCount = notifRes.status === 'fulfilled' ? Number(notifRes.value.count || 0) : 0;
        const activeCount = activeRes.status === 'fulfilled' ? Number(activeRes.value.count || 0) : 0;
        if (mounted) setUnreadCount(notifCount + activeCount);
      } catch {
        if (mounted) setUnreadCount(0);
      }
    };
    loadUnread();
    const interval = setInterval(loadUnread, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Re-fetch unread count when screen comes back into focus
  useFocusEffect(useCallback(() => {
    const loadUnread = async () => {
      try {
        const [notifRes, activeRes] = await Promise.allSettled([
          getUnreadCount() as Promise<{ count: string | number }>,
          getActiveOrderCount() as Promise<{ count: number }>,
        ]);
        const notifCount = notifRes.status === 'fulfilled' ? Number(notifRes.value.count || 0) : 0;
        const activeCount = activeRes.status === 'fulfilled' ? Number(activeRes.value.count || 0) : 0;
        setUnreadCount(notifCount + activeCount);
      } catch {}
    };
    loadUnread();
  }, []));

  useEffect(() => {
    if (!store.isLoggedIn) return;
    let mounted = true;
    (async () => {
      try {
        const res = await getFollowing() as { following?: Array<{ seller_id?: string; id?: string }> };
        if (!mounted) return;
        const ids = (res.following || []).map((f) => f.seller_id || f.id).filter(Boolean) as string[];
        store.setFollowingList(ids);
      } catch { /* silent */ }
    })();
    return () => { mounted = false; };
  }, []);

  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) setScreenHeight(h);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setPage(1);
    await queryClient.invalidateQueries({ queryKey: ['feed-products', feedTab] });
    await fetchProducts(1, true);
    setRefreshing(false);
  }, [feedTab, fetchProducts]);

  const onEndReached = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const next = page + 1;
    setPage(next);
    await fetchProducts(next);
    setLoadingMore(false);
  }, [page, hasMore, loadingMore]);

  // Manual single-card snap. We don't use native snapToInterval at all here —
  // it was fighting our own scrollToOffset calls and causing the jerk-back.
  // Instead: track the offset, and on release decide a target that's never
  // more than one card away from where the drag started.
  const onScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
  }, []);

  const onScrollBeginDrag = useCallback(() => {
    if (screenHeight > 0) {
      dragStartIndexRef.current = Math.round(scrollOffsetRef.current / screenHeight);
    }
  }, [screenHeight]);

  const onScrollEndDrag = useCallback(() => {
    // Native snapToInterval handles the snap — no programmatic scroll needed.
  }, []);

  const onMomentumScrollEnd = useCallback(() => {
    dragStartIndexRef.current = Math.round(scrollOffsetRef.current / screenHeight);
  }, [screenHeight]);

  const handleFeedback = async (eventType: 'relevant' | 'not_relevant') => {
    const product = moreProduct;
    if (!product) return;
    const originalIndex = productsRef.current.findIndex(item => item.id === product.id);
    setMoreProduct(null);
    if (eventType === 'not_relevant') {
      setProducts(prev => prev.filter(item => item.id !== product.id));
    }
    try {
      await trackFeedEvent(product.id, eventType);
      await queryClient.invalidateQueries({ queryKey: ['feed-products', 'forYou'] });
      await queryClient.invalidateQueries({ queryKey: ['explore-products'] });
      if (feedTab === 'forYou') await fetchProducts(1, true);
      if (eventType === 'not_relevant') {
        toast.show({
          kind: 'info',
          title: t('feed.removed'),
          message: t('feed.removedMsg'),
          actionLabel: t('feed.undo'),
          onAction: async () => {
            try {
              await trackFeedEvent(product.id, 'undo_not_relevant');
              setProducts(prev => {
                if (prev.some(item => item.id === product.id)) return prev;
                const restored = [...prev];
                restored.splice(Math.min(Math.max(originalIndex, 0), restored.length), 0, product);
                return restored;
              });
              await queryClient.invalidateQueries({ queryKey: ['feed-products', 'forYou'] });
              await queryClient.invalidateQueries({ queryKey: ['explore-products'] });
            } catch {
              toast.error(t('common.error'), t('feedback.feedPreferenceSaveFailed'));
            }
          },
        });
      }
    } catch {
      if (eventType === 'not_relevant') {
        setProducts(prev => prev.some(item => item.id === product.id) ? prev : [product, ...prev]);
      }
      toast.error(t('common.error'), t('feedback.feedPreferenceSaveFailed'));
    }
  };

  const openListingReport = (product: Product) => {
    setMoreProduct(null);
    if (!store.isLoggedIn) {
      toast.show({ kind: 'info', title: t('auth.signInToAccount') });
      nav.navigate('Auth', { screen: 'Login' });
      return;
    }
    setReportProduct(product);
  };

  const [feedImageIndices, setFeedImageIndices] = useState<Record<string, number>>({});

  const renderFeedItem = ({ item }: { item: Product }) => {
    const allImages = (item.images && item.images.length > 0)
      ? item.images
      : [{ id: 'empty', image_url: '', thumbnail_url: null, is_primary: true, display_order: 0 }];
    const activeIdx = feedImageIndices[item.id] || 0;
    const currentImg = allImages[activeIdx] || allImages[0];
    // Prefer thumbnail for faster loading in feed view
    const imgUrl = getImageUrl(currentImg?.thumbnail_url || currentImg?.image_url);
    const isOwnProduct = store.user?.id === item.seller_id;

    return (
      <Animated.View style={[styles.slide, { height: screenHeight, opacity: activeProductId === item.id ? transitionOpacity : 1 }]}>
        {/* Full-screen image / background — swipeable if multiple images */}
        <View style={styles.mediaContainer}>
          {allImages.length > 1 ? (
            <ScrollView
              horizontal
              pagingEnabled
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              style={{ width: vp.width, height: '100%' }}
              directionalLockEnabled
              onScroll={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / vp.width);
                if (idx !== (feedImageIndices[item.id] ?? 0)) {
                  setFeedImageIndices(prev => ({ ...prev, [item.id]: idx }));
                }
              }}
              scrollEventThrottle={16}
            >
              {allImages.map((img, idx) => {
                const url = getImageUrl(img.thumbnail_url || img.image_url);
                return (
                  <Pressable
                    key={String(img.id || idx)}
                    style={{ width: vp.width, height: vp.height }}
                    onPress={() => nav.navigate('ProductDetail', { productId: item.id })}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('accessibility.viewProduct')}: ${item.name}`}
                  >
                    {url ? (
                      <>
                        <ExpoImage source={{ uri: url }} style={styles.mediaFill} contentFit="cover" blurRadius={30} cachePolicy="memory-disk" />
                        <ExpoImage source={{ uri: url }} style={styles.mediaContain} contentFit="contain" cachePolicy="memory-disk" />
                      </>
                    ) : (
                      <Icon name="image-unavailable" size={48} color={COLORS.text2} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <Pressable
              style={{ width: '100%', height: '100%' }}
              onPress={() => nav.navigate('ProductDetail', { productId: item.id })}
              accessibilityRole="button"
              accessibilityLabel={`${t('accessibility.viewProduct')}: ${item.name}`}
            >
              {imgUrl ? (
                <>
                  <ExpoImage source={{ uri: imgUrl }} style={styles.mediaFill} contentFit="cover" blurRadius={30} cachePolicy="memory-disk" />
                  <ExpoImage source={{ uri: imgUrl }} style={styles.mediaContain} contentFit="contain" cachePolicy="memory-disk" />
                </>
              ) : (
                <Icon name="image-unavailable" size={48} color={COLORS.text2} />
              )}
            </Pressable>
          )}
        </View>

        {/* Right-side action rail — absolute, thumb-reachable */}
        <View style={[styles.actionRail, { bottom: screenHeight * 0.25 }]}>
          <FeedLikeButton productId={item.id} />
          <FeedSaveButton productId={item.id} />
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => setMoreProduct(item)}
            accessibilityRole="button"
            accessibilityLabel={t('accessibility.moreOptions')}
          >
            <MaterialCommunityIcons name="dots-horizontal" size={35} color={COLORS.white} />
          </TouchableOpacity>
        </View>

        {/* Bottom gradient — real fade from transparent to dark */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.92)']}
          style={styles.bottomGradient}
          pointerEvents="none"
        />

        {/* Bottom overlay — caption + actions, sits ON TOP of image */}
        <View style={[styles.bottomOverlay, { paddingBottom: Math.max(90, insets.bottom + 80) }]} pointerEvents="box-none">
          {/* Seller chip + follow */}
          <View style={styles.sellerRow}>
            <TouchableOpacity
              style={styles.sellerChip}
              onPress={() => item.seller && nav.navigate('Storefront', { sellerId: item.seller_id, preloadedSeller: item.seller })}
              accessibilityRole="button"
              accessibilityLabel={t('accessibility.visitStore')}
            >
              <UserAvatar seller={item.seller} animated={false} />
              <Text style={styles.sellerName} numberOfLines={1}>{getDisplayName(item.seller)}</Text>
            </TouchableOpacity>
            {!isOwnProduct && item.seller_id && (
              <FollowButton sellerId={item.seller_id} size="md" />
            )}
          </View>

{/* Price */}
          {feedTab === 'forYou' && item.recommendation_reason && (
            <TouchableOpacity style={styles.reasonPill} onPress={() => setReasonProduct(item)} accessibilityRole="button" accessibilityLabel={`${t('feed.whySeeing')}: ${recommendationReasonText(item.recommendation_reason)}`}>
              <MaterialCommunityIcons name="star-four-points" size={13} color={COLORS.white} />
              <Text style={styles.reasonText}>{recommendationReasonText(item.recommendation_reason)}</Text>
            </TouchableOpacity>
          )}
          <View style={styles.priceTag}>
            <SalePriceTag
              price={item.price}
              effectivePrice={item.effective_price ?? item.price}
              isOnSale={item.is_on_sale || false}
              discountPct={item.discount_pct || 0}
              size="md"
            />
          </View>

          {/* Product name + info */}
          <TouchableOpacity
            onPress={() => nav.navigate('ProductDetail', { productId: item.id })}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('accessibility.viewProduct')}
          >
            <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
          </TouchableOpacity>
          <View style={styles.productInfoRow}>
            <Text style={styles.productInfo}>{typeof item.category === 'string' ? item.category : item.category?.name || 'Port-au-Prince'}</Text>
            <StockBadge stock={item.stock} size="sm" />
          </View>
          {allImages.length > 1 && (
            <View style={styles.imgDotsCentered}>
              {allImages.map((_: any, i: number) => (
                <View key={i} style={[styles.imgDot, i === activeIdx && styles.imgDotActive]} />
              ))}
            </View>
          )}

          {/* Buy / Cart buttons */}
          <BuyRow product={item} navigation={nav} />
        </View>
      </Animated.View>
    );
  };

  if (screenHeight === 0 || loading) {
    return (
      <View style={styles.container} onLayout={onContainerLayout}>
        {/* Full-screen feed skeleton */}
        <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
          <SkeletonBlock width="100%" height={screenHeight || 600} radius={0} style={{ opacity: 0.4 }} />
          {/* Action rail skeleton — right side */}
          <View style={{ position: 'absolute', right: 14, bottom: '30%', gap: 20, alignItems: 'center' }}>
              {[44, 44, 44].map((s, i) => (
              <SkeletonBlock key={i} width={s} height={s} radius={22} />
            ))}
          </View>
          {/* Bottom info skeleton */}
          <View style={{ position: 'absolute', bottom: 40, left: 16, right: 80, gap: 8 }}>
            <SkeletonBlock width="45%" height={16} />
            <SkeletonBlock width="65%" height={12} />
            <SkeletonBlock width="30%" height={12} />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <SkeletonBlock width={100} height={40} radius={20} />
              <SkeletonBlock width={44} height={44} radius={22} />
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container} onLayout={onContainerLayout}>
      <View style={[styles.feedTopbar, { top: insets.top + 14 }]}>
        <View>
          <Text style={styles.brand}>MaurMaket</Text>
        </View>
        <View style={styles.feedTabs}>
          <TouchableOpacity
            style={[styles.feedTab, feedTab === 'new' && styles.feedTabActive]}
            onPress={() => { if (feedTab !== 'new') { setFeedTab('new'); setPage(1); setProducts([]); } }}
            accessibilityRole="button"
            accessibilityLabel={t('accessibility.newTab')}
          >
            <Text style={[styles.feedTabText, feedTab === 'new' && styles.feedTabTextActive]}>{t('feed.newTab')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.feedTab, feedTab === 'forYou' && styles.feedTabActive]}
            onPress={() => { if (feedTab !== 'forYou') { setFeedTab('forYou'); setPage(1); setProducts([]); } }}
            accessibilityRole="button"
            accessibilityLabel={t('accessibility.forYouTab')}
          >
            <Text style={[styles.feedTabText, feedTab === 'forYou' && styles.feedTabTextActive]}>{t('feed.forYouTab')}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.utilityRow}>
          <TouchableOpacity
            style={styles.utilityBtn}
            activeOpacity={0.82}
            onPress={() => nav.navigate('Notification')}
            accessibilityRole="button"
            accessibilityLabel={t('accessibility.openNotifications')}
          >
            <MaterialCommunityIcons name="bell-outline" size={35} color={COLORS.white} />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
      <FlatList
        ref={flatListRef}
        data={products}
        renderItem={renderFeedItem}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={screenHeight}
        snapToAlignment="start"
        disableIntervalMomentum
        onScroll={onScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        onMomentumScrollEnd={onMomentumScrollEnd}
        removeClippedSubviews={Platform.OS === 'android'}
        maxToRenderPerBatch={2}
        windowSize={3}
        initialNumToRender={1}
        getItemLayout={(_data, index) => ({
          length: screenHeight,
          offset: screenHeight * index,
          index,
        })}
        viewabilityConfig={FEED_VIEWABILITY_CONFIG}
        onViewableItemsChanged={onViewableItemsChanged}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.coral} />
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.loadingFooter}>
              <ActivityIndicator color={COLORS.coral} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          !refreshing ? (
            <View style={[styles.empty, { height: screenHeight }]}>
              <EmptyState
                icon="fire"
                title={t('feed.noProducts')}
                hint={t('feed.checkBack')}
                size={72}
              />
            </View>
          ) : null
        }
      />
      {/* More Menu */}
      <Modal
        visible={Boolean(moreProduct)}
        transparent
        animationType="slide"
        onRequestClose={() => setMoreProduct(null)}
      >
        <View style={styles.commentScrim}>
          <TouchableOpacity
            style={styles.commentDismissArea}
            activeOpacity={1}
            onPress={() => setMoreProduct(null)}
            accessibilityRole="button"
            accessibilityLabel={t('accessibility.close')}
          />
          <View style={styles.moreSheet}>
            <View style={styles.sheetHandle} />
            {moreProduct && moreProduct.seller_id === store.user?.id ? (
              /* Own product options */
              <>
                <TouchableOpacity
                  style={styles.moreItem}
                  onPress={() => { const p = moreProduct; setMoreProduct(null); nav.navigate('EditListing', { productId: p.id }); }}
                  accessibilityRole="button"
                  accessibilityLabel={t('editListing.title')}
                >
                  <MaterialCommunityIcons name="pencil-outline" size={18} color={COLORS.text} />
                  <Text style={styles.moreItemText}>{t('editListing.title')}</Text>
                </TouchableOpacity>
                <View style={styles.moreDivider} />
                <TouchableOpacity
                  style={styles.moreItem}
                  onPress={() => { const p = moreProduct; setMoreProduct(null); nav.navigate('ProductDetail', { productId: p.id }); }}
                  accessibilityRole="button"
                  accessibilityLabel={t('accessibility.viewProduct')}
                >
                  <MaterialCommunityIcons name="eye-outline" size={18} color={COLORS.text} />
                  <Text style={styles.moreItemText}>{t('accessibility.viewProduct')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              /* Other seller options */
              <>
                <TouchableOpacity
                  style={styles.moreItem}
                  onPress={() => handleFeedback('relevant')}
                  accessibilityRole="button"
                  accessibilityLabel={t('accessibility.markRelevant')}
                >
                  <MaterialCommunityIcons name="thumb-up-outline" size={18} color={COLORS.text} />
                  <Text style={styles.moreItemText}>{t('feed.showMoreLike')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.moreItem}
                  onPress={() => handleFeedback('not_relevant')}
                  accessibilityRole="button"
                  accessibilityLabel={t('accessibility.markNotRelevant')}
                >
                  <MaterialCommunityIcons name="thumb-down-outline" size={18} color={COLORS.text} />
                  <Text style={styles.moreItemText}>{t('feed.notInterested')}</Text>
                </TouchableOpacity>
                <View style={styles.moreDivider} />
                <TouchableOpacity
                  style={styles.moreItem}
                  onPress={async () => {
                    const p = moreProduct;
                    if (!p) return;
                    setMoreProduct(null);
                    try {
                      await RNShare.share({
                        message: t('feed.shareMessage', { name: p.name, price: p.price }),
                        url: `https://maurmaket.com/product/${p.id}`,
                        title: p.name,
                      });
                    } catch {}
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('accessibility.share')}
                >
                  <MaterialCommunityIcons name="share-variant-outline" size={18} color={COLORS.text} />
                  <Text style={styles.moreItemText}>{t('accessibility.share')}</Text>
                </TouchableOpacity>
                <View style={styles.moreDivider} />
                <TouchableOpacity
                  style={styles.moreItem}
                  onPress={() => { if (moreProduct) openListingReport(moreProduct); }}
                  accessibilityRole="button"
                  accessibilityLabel={t('accessibility.report')}
                >
                  <MaterialCommunityIcons name="flag-outline" size={18} color={COLORS.coral} />
                  <Text style={[styles.moreItemText, { color: COLORS.coral }]}>{t('productDetail.report')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
      <Modal
        visible={Boolean(reasonProduct)}
        transparent
        animationType={reduceMotion ? 'none' : 'fade'}
        onRequestClose={() => setReasonProduct(null)}
      >
        <Pressable style={styles.reasonOverlay} onPress={() => setReasonProduct(null)}>
          <Pressable style={styles.reasonSheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.reasonHeader}>
              <MaterialCommunityIcons name="lightbulb-on-outline" size={20} color={COLORS.coral} />
              <Text style={styles.reasonTitle}>{t('feed.whySeeing')}</Text>
            </View>
            <Text style={styles.reasonProductName} numberOfLines={2}>{reasonProduct?.name}</Text>
            <Text style={styles.reasonBody}>{recommendationReasonText(reasonProduct?.recommendation_reason)}</Text>
            <TouchableOpacity
              style={styles.reasonCloseBtn}
              onPress={() => setReasonProduct(null)}
              accessibilityRole="button"
              accessibilityLabel={t('accessibility.close')}
            >
              <Text style={styles.reasonCloseText}>{t('common.done')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
      <ReportModal
        visible={Boolean(reportProduct)}
        targetType="listing"
        targetId={reportProduct?.id || ''}
        targetName={reportProduct?.name}
        onClose={() => setReportProduct(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  feedTopbar: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: SPACING.xl + 28,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    color: COLORS.white,
    
    fontSize: 18,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  brandSub: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: -1,
  },
  utilityRow: {
    flexDirection: 'row',
    gap: 9,
  },
  utilityBtn: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.coral,
    borderWidth: 1,
    borderColor: '#05070D',
  },
  badgeText: {
    color: COLORS.white,
    fontSize: 9,
    fontWeight: '800',
  },
  slide: {
    width: '100%',
    backgroundColor: '#000',
    position: 'relative',
  },
  mediaContainer: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#000',
  },
  mediaFill: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    width: '100%', height: '100%',
    opacity: 0.4,
  },
  mediaContain: {
    width: '100%', height: '100%',
  },

  /* Image dots indicator */
  imgDots: {
    position: 'absolute', bottom: 100, alignSelf: 'center',
    flexDirection: 'row', gap: 5, zIndex: 10,
  },
  imgDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  imgDotActive: {
    backgroundColor: '#fff', width: 8, height: 8, borderRadius: 4,
  },
  imgDotsInline: {
    flexDirection: 'row', gap: 4, alignItems: 'center',
  },
  imgDotsCentered: {
    flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },

  /* Right-side action rail — TikTok style */
  actionRail: {
    position: 'absolute',
    right: 12,
    alignItems: 'center',
    gap: 12,
    zIndex: 15,
  },
  actionBtn: {
    alignItems: 'center',
    width: 48,
    height: 60,
    justifyContent: 'center',
    gap: 4,
  },
  /* Bottom gradient overlay — real fade */
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '55%',
    zIndex: 5,
  },

  /* Bottom content — sits ON TOP of image */
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingLeft: 14,
    paddingRight: 14,
    paddingTop: SPACING.md,
    zIndex: 10,
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  sellerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
    maxWidth: '68%',
  },
  sellerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerAvatarText: {
    fontSize: 14,
    color: COLORS.white,
    fontWeight: '700',
  },
  sellerName: {
    fontSize: 14,
    color: COLORS.white,
    fontWeight: '700',
    flexShrink: 1,
  },
  priceTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,77,106,0.2)',
    borderWidth: 1,
    borderColor: COLORS.coral,
    borderRadius: RADIUS.row,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 6,
  },
  reasonPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.42)', borderRadius: 14, paddingHorizontal: 10, minHeight: 28, marginBottom: 8 },
  reasonText: { color: COLORS.white, fontSize: 12, fontWeight: '700' },
  priceText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.coral,
  },
  productName: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 2,
    lineHeight: 22,
  },
  productInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  productInfo: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
  actionDisabled: { opacity: 0.45 },

  loadingFooter: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  emptyText: {
    fontSize: 16,
    color: COLORS.white,
    fontWeight: '600',
  },
  emptyHint: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  commentScrim: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  commentDismissArea: {
    flex: 1,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: 12,
  },
  /* Feed Tabs */
  feedTabs: {
    flexDirection: 'row',
    gap: 4,
  },
  feedTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: RADIUS.media,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  feedTabActive: {
    backgroundColor: COLORS.white,
  },
  feedTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
  },
  feedTabTextActive: {
    color: '#000',
  },

  /* More Menu */
  moreSheet: {
    paddingHorizontal: SPACING.md,
    paddingTop: 10,
    paddingBottom: SPACING.xxl + 16,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  reasonOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.48)' },
  reasonSheet: {
    width: '100%', maxWidth: 460, alignSelf: 'center',
    paddingHorizontal: SPACING.lg, paddingTop: 12, paddingBottom: SPACING.xxl + 12,
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  reasonHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 12 },
  reasonTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  reasonProductName: { color: COLORS.text, fontSize: 14, fontWeight: '700', marginBottom: 6 },
  reasonBody: { color: COLORS.text2, fontSize: 13, lineHeight: 19 },
  reasonCloseBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 16, borderRadius: RADIUS.row, backgroundColor: COLORS.surface2 },
  reasonCloseText: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  moreItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  moreItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  moreDivider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
});
