import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Dimensions, TouchableOpacity,
  RefreshControl, ActivityIndicator, LayoutChangeEvent, Modal, Pressable, Platform, ScrollView,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Icon } from '../components/icons/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING, RADIUS, getDisplayName, getSellerAvatar } from '../theme';
import {
  getProducts, toggleWishlist, checkWishlist, checkWishlistBatch, createConversation,
  getImageUrl, getUnreadCount, getProductReviews, getFollowing,
  trackFeedEvent, getActiveOrderCount,
} from '../api';
import { store } from '../store';
import type { Product, Review } from '../types';
import type { RootStackParamList } from '../navigation';
import { useTranslation } from '../i18n';
import SalePriceTag from '../components/SalePriceTag';
import BuyRow from '../components/BuyRow';
import StockBadge from '../components/StockBadge';
import FollowButton from '../components/FollowButton';
import UserAvatar from '../components/UserAvatar';
import EmptyState from '../components/EmptyState';
import { SkeletonBlock } from '../components/Skeleton';
import { tapLight } from '../haptics';
import { useToast } from '../components/Toast';
import { queryClient } from '../hooks';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function FeedScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const [products, setProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [screenHeight, setScreenHeight] = useState(0);
  const [wishlistedIds, setWishlistedIds] = useState<Set<string>>(new Set());
  const [cartCount, setCartCount] = useState(store.cartCount);
  const [unreadCount, setUnreadCount] = useState(0);
  const [commentProduct, setCommentProduct] = useState<Product | null>(null);
  const [comments, setComments] = useState<Review[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [moreProduct, setMoreProduct] = useState<Product | null>(null);
  const [feedTab, setFeedTab] = useState<'forYou' | 'new'>('new');
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const flatListRef = useRef<FlatList>(null);
  const checkedWishlistIds = useRef<Set<string>>(new Set());
  const viewStartTime = useRef<number>(Date.now());
  const currentProductId = useRef<string | null>(null);
  const scrollOffsetRef = useRef(0);
  const dragStartIndexRef = useRef(0);

  const fetchProducts = useCallback(async (p = 1, replace = false) => {
    try {
      const params: Record<string, string> = { page: String(p), limit: '20' };
      if (feedTab === 'forYou') {
        params.personalized = 'true';
      } else {
        params.sort = 'newest';
      }
      const queryKey = ['feed-products', feedTab, p] as const;
      const res = await queryClient.fetchQuery({
        queryKey,
        queryFn: () => getProducts(params) as Promise<{ products: Product[]; total: number; pages: number }>,
        staleTime: 30_000,
      });
      if (replace) {
        checkedWishlistIds.current.clear();
        setWishlistedIds(new Set());
        setProducts(res.products);
      } else {
        setProducts(prev => [...prev, ...res.products]);
      }
      setHasMore(p < res.pages);
    } catch {
      if (replace) toast.error('Feed could not refresh', 'Check your connection and try again.', () => fetchProducts(p, replace));
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
    if (!store.isLoggedIn || products.length === 0) return;
    const unchecked = products.filter(p => !checkedWishlistIds.current.has(p.id));
    if (unchecked.length === 0) return;
    unchecked.forEach(p => checkedWishlistIds.current.add(p.id));
    (async () => {
      try {
        const res = await checkWishlistBatch(unchecked.map(p => p.id)) as { wishlisted: Record<string, boolean> };
        setWishlistedIds(prev => {
          const next = new Set(prev);
          for (const p of unchecked) {
            if (res.wishlisted[p.id]) next.add(p.id);
            else next.delete(p.id);
          }
          return next;
        });
      } catch { /* Product cards remain usable even if wishlist state is unavailable. */ }
    })();
  }, [products]);

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

  const handleBookmark = async (product: Product) => {
    tapLight();
    const wasWishlisted = wishlistedIds.has(product.id);
    setWishlistedIds(prev => {
      const next = new Set(prev);
      if (wasWishlisted) next.delete(product.id);
      else next.add(product.id);
      return next;
    });
    try { await toggleWishlist(product.id); }
    catch {
      setWishlistedIds(prev => {
        const next = new Set(prev);
        if (wasWishlisted) next.add(product.id);
        else next.delete(product.id);
        return next;
      });
    }
  };

  const handleLike = async (product: Product) => {
    tapLight();
    const wasLiked = likedIds.has(product.id);
    setLikedIds(prev => {
      const next = new Set(prev);
      if (wasLiked) next.delete(product.id);
      else next.add(product.id);
      return next;
    });
    try {
      await trackFeedEvent(product.id, wasLiked ? 'unlike' : 'like');
    } catch {
      setLikedIds(prev => {
        const next = new Set(prev);
        if (wasLiked) next.add(product.id);
        else next.delete(product.id);
        return next;
      });
    }
  };

  const handleOpenComments = async (product: Product) => {
    setCommentProduct(product);
    setComments([]);
    setCommentsLoading(true);
    try {
      const res = await getProductReviews(product.id) as { reviews: Review[] };
      setComments((res.reviews || []).map((r: any) => ({
        ...r,
        reviewer: r.reviewer || {
          full_name: r.reviewer_name,
          avatar_url: r.reviewer_avatar,
          username: r.reviewer_username,
        },
      })));
    } catch {
      setComments([]);
    }
    setCommentsLoading(false);
  };

  const handleChat = async (product: Product) => {
    if (!product.seller) return;
    try {
      const res = await createConversation({
        sellerId: product.seller_id,
        productId: product.id,
      }) as { conversationId: string };
      nav.navigate('Chat', {
        conversationId: res.conversationId,
        otherUserName: getDisplayName(product.seller),
        otherUserId: product.seller_id,
        otherUserAvatar: product.seller.avatar_url,
      });
    } catch {
      toast.error('Could not open messages', 'Please check your connection and try again.', () => handleChat(product));
    }
  };

  const [feedImageIndices, setFeedImageIndices] = useState<Record<string, number>>({});

  const renderFeedItem = ({ item }: { item: Product }) => {
    const allImages = (item.images && item.images.length > 0)
      ? item.images
      : [{ id: 'empty', image_url: '', is_primary: true, display_order: 0 }];
    const activeIdx = feedImageIndices[item.id] || 0;
    const currentImg = allImages[activeIdx] || allImages[0];
    const imgUrl = getImageUrl(currentImg?.image_url);
    const isOwnProduct = store.user?.id === item.seller_id;

    return (
      <View style={[styles.slide, { height: screenHeight }]}>
        {/* Full-screen image / background — swipeable if multiple images */}
        <View style={styles.mediaContainer}>
          {allImages.length > 1 ? (
            <ScrollView
              horizontal
              pagingEnabled
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              style={{ width: Dimensions.get('window').width, height: '100%' }}
              onScroll={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / Dimensions.get('window').width);
                if (idx !== (feedImageIndices[item.id] ?? 0)) {
                  setFeedImageIndices(prev => ({ ...prev, [item.id]: idx }));
                }
              }}
              scrollEventThrottle={16}
            >
              {allImages.map((img, idx) => {
                const url = getImageUrl(img.image_url);
                return (
                  <View key={String(img.id || idx)} style={{ width: Dimensions.get('window').width, height: Dimensions.get('window').height }}>
                    {url ? (
                      <>
                        <ExpoImage source={{ uri: url }} style={styles.mediaFill} resizeMode="cover" blurRadius={30} cachePolicy="memory-disk" />
                        <ExpoImage source={{ uri: url }} style={styles.mediaContain} resizeMode="contain" cachePolicy="memory-disk" />
                      </>
                    ) : (
                      <Icon name="image-unavailable" size={48} color={COLORS.text2} />
                    )}
                  </View>
                );
              })}
            </ScrollView>
          ) : imgUrl ? (
            <>
              <ExpoImage source={{ uri: imgUrl }} style={styles.mediaFill} resizeMode="cover" blurRadius={30} cachePolicy="memory-disk" />
              <ExpoImage source={{ uri: imgUrl }} style={styles.mediaContain} resizeMode="contain" cachePolicy="memory-disk" />
            </>
          ) : (
            <Icon name="image-unavailable" size={48} color={COLORS.text2} />
          )}
        </View>

        {/* Right-side action rail — absolute, thumb-reachable */}
        <View style={[styles.actionRail, { bottom: screenHeight * 0.25 }]}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleLike(item)}
            accessibilityRole="button"
            accessibilityLabel={likedIds.has(item.id) ? t('accessibility.unlike') : t('accessibility.like')}
          >
            <MaterialCommunityIcons
              name={likedIds.has(item.id) ? 'heart' : 'heart-outline'}
              size={35}
              color={likedIds.has(item.id) ? COLORS.coral : COLORS.white}
            />
          </TouchableOpacity>
          {!isOwnProduct && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleOpenComments(item)}
              accessibilityRole="button"
              accessibilityLabel={t('accessibility.viewReviews')}
            >
              <MaterialCommunityIcons name="comment-outline" size={35} color={COLORS.white} />
              {(item.review_count || 0) > 0 && (
                <Text style={styles.actionCount}>{item.review_count}</Text>
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleBookmark(item)}
            accessibilityRole="button"
            accessibilityLabel={wishlistedIds.has(item.id) ? t('accessibility.unbookmark') : t('accessibility.bookmark')}
          >
            <MaterialCommunityIcons
              name={wishlistedIds.has(item.id) ? 'bookmark' : 'bookmark-outline'}
              size={35}
              color={wishlistedIds.has(item.id) ? COLORS.coral : COLORS.white}
            />
          </TouchableOpacity>
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
              onPress={() => item.seller && nav.navigate('Storefront', { sellerId: item.seller_id })}
              accessibilityRole="button"
              accessibilityLabel={t('accessibility.visitStore')}
            >
              <UserAvatar seller={item.seller} animated={false} />
              <Text style={styles.sellerName} numberOfLines={1}>{getDisplayName(item.seller)}</Text>
            </TouchableOpacity>
            {!isOwnProduct && item.seller_id && (
              <FollowButton sellerId={item.seller_id} variant="outline" />
            )}
          </View>

          {/* Price */}
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
          <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
          <View style={styles.productInfoRow}>
            <Text style={styles.productInfo}>{typeof item.category === 'string' ? item.category : item.category?.name || 'Port-au-Prince'}</Text>
            <StockBadge stock={item.stock} size="sm" />
            {allImages.length > 1 && (
              <View style={styles.imgDotsInline}>
                {allImages.map((_: any, i: number) => (
                  <View key={i} style={[styles.imgDot, i === activeIdx && styles.imgDotActive]} />
                ))}
              </View>
            )}
          </View>

          {/* Buy / Cart buttons */}
          <BuyRow product={item} navigation={nav} />
        </View>
      </View>
    );
  };

  if (screenHeight === 0 || (products.length === 0 && !refreshing)) {
    return (
      <View style={styles.container} onLayout={onContainerLayout}>
        {/* Full-screen feed skeleton */}
        <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
          <SkeletonBlock width="100%" height={screenHeight || 600} radius={0} style={{ opacity: 0.4 }} />
          {/* Action rail skeleton — right side */}
          <View style={{ position: 'absolute', right: 14, bottom: '30%', gap: 20, alignItems: 'center' }}>
            {[44, 44, 44, 44].map((s, i) => (
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
            onPress={() => { setFeedTab('new'); setPage(1); setProducts([]); }}
            accessibilityRole="button"
            accessibilityLabel={t('accessibility.newTab')}
          >
            <Text style={[styles.feedTabText, feedTab === 'new' && styles.feedTabTextActive]}>{t('feed.newTab')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.feedTab, feedTab === 'forYou' && styles.feedTabActive]}
            onPress={() => { setFeedTab('forYou'); setPage(1); setProducts([]); }}
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
            accessibilityLabel="notifications"
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
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 80 }}
        onViewableItemsChanged={({ viewableItems }) => {
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
            currentProductId.current = visible.item.id;
            viewStartTime.current = Date.now();
          }
        }}
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
      <Modal
        visible={Boolean(commentProduct)}
        animationType="slide"
        transparent
        onRequestClose={() => setCommentProduct(null)}
      >
        <View style={styles.commentScrim}>
          <TouchableOpacity
            style={styles.commentDismissArea}
            activeOpacity={1}
            onPress={() => setCommentProduct(null)}
            accessibilityRole="button"
            accessibilityLabel={t('accessibility.close')}
          />
          <View style={styles.commentSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.commentHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.commentTitle}>{t('productDetail.reviews')}</Text>
                <Text style={styles.commentSubtitle} numberOfLines={1}>
                  {commentProduct?.name}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.sheetIconBtn}
                onPress={() => setCommentProduct(null)}
                accessibilityRole="button"
                accessibilityLabel={t('accessibility.close')}
              >
                <Icon name="close" size={20} color={COLORS.text2} />
              </TouchableOpacity>
            </View>

            {commentsLoading ? (
              <View style={styles.commentLoading}>
                <ActivityIndicator color={COLORS.coral} />
              </View>
            ) : comments.length > 0 ? (
              <FlatList
                data={comments}
                keyExtractor={item => item.id}
                style={styles.commentList}
                contentContainerStyle={{ paddingBottom: 12 }}
                renderItem={({ item }) => (
                  <View style={styles.commentItem}>
                      <UserAvatar name={item.reviewer?.username ? `@${item.reviewer.username}` : 'B'} />
                    <View style={styles.commentBody}>
                      <View style={styles.commentNameRow}>
                        <Text style={styles.commentName}>{item.reviewer?.username ? `@${item.reviewer.username}` : 'Buyer'}</Text>
                        <View style={styles.commentStars}>
                          <Icon name="rating" size={11} color={COLORS.yellow} />
                          <Text style={styles.commentRating}>{item.rating}</Text>
                        </View>
                      </View>
                      <Text style={styles.commentText}>{item.comment || 'No written comment.'}</Text>
                    </View>
                  </View>
                )}
              />
            ) : (
              <View style={styles.commentEmpty}>
                <MaterialCommunityIcons name="comment-text-outline" size={34} color={COLORS.text2} />
                <Text style={styles.commentEmptyTitle}>{t('productDetail.noReviews')}</Text>
                <Text style={styles.commentEmptyText}>
                  Reviews from completed orders will appear here. Message the seller if you have a question now.
                </Text>
              </View>
            )}

            {commentProduct && store.isLoggedIn && store.user?.id !== commentProduct.seller_id && (
              <TouchableOpacity
                style={styles.messageSellerBtn}
                onPress={() => {
                  const product = commentProduct;
                  setCommentProduct(null);
                  handleChat(product);
                }}
                accessibilityRole="button"
                accessibilityLabel={t('accessibility.messageSeller')}
              >
                <Icon name="message" size={17} color={COLORS.white} />
                <Text style={styles.messageSellerText}>{t('productDetail.messageSeller')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

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
            <TouchableOpacity
              style={styles.moreItem}
              onPress={() => {
                if (moreProduct) trackFeedEvent(moreProduct.id, 'relevant');
                setMoreProduct(null);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('accessibility.markRelevant')}
            >
              <MaterialCommunityIcons name="thumb-up-outline" size={18} color={COLORS.text} />
              <Text style={styles.moreItemText}>Relevant</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.moreItem}
              onPress={() => {
                if (moreProduct) trackFeedEvent(moreProduct.id, 'not_relevant');
                setMoreProduct(null);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('accessibility.markNotRelevant')}
            >
              <MaterialCommunityIcons name="thumb-down-outline" size={18} color={COLORS.text} />
              <Text style={styles.moreItemText}>Not relevant</Text>
            </TouchableOpacity>
            <View style={styles.moreDivider} />
            <TouchableOpacity
              style={styles.moreItem}
              onPress={() => { setMoreProduct(null); }}
              accessibilityRole="button"
              accessibilityLabel={t('accessibility.share')}
            >
              <MaterialCommunityIcons name="share-variant-outline" size={18} color={COLORS.text} />
              <Text style={styles.moreItemText}>Share</Text>
            </TouchableOpacity>
            <View style={styles.moreDivider} />
            <TouchableOpacity
              style={styles.moreItem}
              onPress={() => { setMoreProduct(null); }}
              accessibilityRole="button"
              accessibilityLabel={t('accessibility.report')}
            >
              <MaterialCommunityIcons name="flag-outline" size={18} color={COLORS.coral} />
              <Text style={[styles.moreItemText, { color: COLORS.coral }]}>Report</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    fontFamily: 'Syne',
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

  /* Right-side action rail — TikTok style */
  actionRail: {
    position: 'absolute',
    right: 12,
    alignItems: 'center',
    gap: 8,
    zIndex: 15,
  },
  actionBtn: {
    alignItems: 'center',
    width: 35,
    height: 35,
    justifyContent: 'center',
    gap: 2,
  },
  actionCount: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
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
  commentSheet: {
    maxHeight: '72%',
    minHeight: 390,
    paddingHorizontal: SPACING.md,
    paddingTop: 10,
    paddingBottom: SPACING.xxl + 16,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: 12,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  commentTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  commentSubtitle: { color: COLORS.text2, fontSize: 12, marginTop: 2 },
  sheetIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  commentLoading: { minHeight: 180, alignItems: 'center', justifyContent: 'center' },
  commentList: { marginTop: 12 },
  commentItem: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
  },
  commentAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarText: { color: COLORS.white, fontSize: 13, fontWeight: '800' },
  commentBody: { flex: 1, minWidth: 0 },
  commentNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentName: { color: COLORS.text, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  commentStars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
  },
  commentRating: { color: COLORS.text2, fontSize: 10, fontWeight: '700' },
  commentText: { color: COLORS.text2, fontSize: 13, lineHeight: 18, marginTop: 3 },
  commentEmpty: {
    minHeight: 210,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: SPACING.lg,
  },
  commentEmptyTitle: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  commentEmptyText: { color: COLORS.text2, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  messageSellerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.blue,
  },
  messageSellerText: { color: COLORS.white, fontSize: 13, fontWeight: '800' },

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
