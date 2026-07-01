import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Dimensions, TouchableOpacity,
  RefreshControl, ActivityIndicator, LayoutChangeEvent, Image, Alert, Modal, Pressable, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING, RADIUS, getDisplayName, getSellerAvatar } from '../theme';
import {
  getProducts, toggleWishlist, checkWishlist, createConversation, toggleFollow,
  getImageUrl, getConversationUnreadCount, getProductReviews, getFollowing,
  trackFeedEvent,
} from '../api';
import { store } from '../store';
import type { Product, Review } from '../types';
import type { RootStackParamList } from '../navigation';
import { useTranslation } from '../i18n';
import SalePriceTag from '../components/SalePriceTag';
import BuyRow from '../components/BuyRow';
import UserAvatar from '../components/UserAvatar';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function FeedScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const [products, setProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [screenHeight, setScreenHeight] = useState(0);
  const [wishlistedIds, setWishlistedIds] = useState<Set<string>>(new Set());
  const [followedSellerIds, setFollowedSellerIds] = useState<Set<string>>(new Set());
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
      const res = await getProducts(params) as {
        products: Product[]; total: number; pages: number;
      };
      if (replace) {
        checkedWishlistIds.current.clear();
        setWishlistedIds(new Set());
        setProducts(res.products);
      } else {
        setProducts(prev => [...prev, ...res.products]);
      }
      setHasMore(p < res.pages);
    } catch { /* silent */ }
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
        const res = await getConversationUnreadCount() as { count: string | number };
        if (mounted) setUnreadCount(Number(res.count || 0));
      } catch {
        if (mounted) setUnreadCount(0);
      }
    };
    loadUnread();
    const interval = setInterval(loadUnread, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!store.isLoggedIn || products.length === 0) return;
    const unchecked = products.filter(p => !checkedWishlistIds.current.has(p.id));
    unchecked.forEach(async (p) => {
      checkedWishlistIds.current.add(p.id);
      try {
        const res = await checkWishlist(p.id) as { wishlisted: boolean };
        setWishlistedIds(prev => {
          const next = new Set(prev);
          if (res.wishlisted) next.add(p.id);
          else next.delete(p.id);
          return next;
        });
    } catch { Alert.alert(t('common.error'), 'Could not load products.'); }
    });
  }, [products]);

  useEffect(() => {
    if (!store.isLoggedIn) return;
    let mounted = true;
    (async () => {
      try {
        const res = await getFollowing() as { following?: Array<{ seller_id?: string; id?: string }> };
        if (!mounted) return;
        const ids = (res.following || []).map((f) => f.seller_id || f.id).filter(Boolean) as string[];
        setFollowedSellerIds(new Set(ids));
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
    await fetchProducts(1, true);
    setRefreshing(false);
  }, []);

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
      setComments(res.reviews || []);
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
      Alert.alert('Message unavailable', 'Could not open this seller chat right now.');
    }
  };

  const handleFollow = async (sellerId: string) => {
    const wasFollowing = followedSellerIds.has(sellerId);
    setFollowedSellerIds(prev => {
      const next = new Set(prev);
      if (wasFollowing) next.delete(sellerId);
      else next.add(sellerId);
      return next;
    });
    try {
      const res = await toggleFollow(sellerId) as { following?: boolean };
      if (typeof res.following === 'boolean') {
        setFollowedSellerIds(prev => {
          const next = new Set(prev);
          if (res.following) next.add(sellerId);
          else next.delete(sellerId);
          return next;
        });
      }
    } catch {
      setFollowedSellerIds(prev => {
        const next = new Set(prev);
        if (wasFollowing) next.add(sellerId);
        else next.delete(sellerId);
        return next;
      });
    }
  };

  const renderFeedItem = ({ item }: { item: Product }) => {
    const primaryImg = item.images?.find(i => i.is_primary) || item.images?.[0];
    const imgUrl = getImageUrl(primaryImg?.image_url);
    const isSoldOut = item.stock <= 0;
    const isFollowing = followedSellerIds.has(item.seller_id);
    const isOwnProduct = store.user?.id === item.seller_id;
    const stockLabel = isSoldOut ? t('feed.soldOut') : item.stock === 1 ? t('feed.oneLeft') : `${item.stock} ${t('feed.available').toLowerCase()}`;

    return (
      <View style={[styles.slide, { height: screenHeight }]}>
        {/* Full-screen image / background */}
        <View style={styles.mediaContainer}>
          {imgUrl ? (
            <>
              <Image source={{ uri: imgUrl }} style={styles.mediaFill} resizeMode="cover" blurRadius={30} />
              <Image source={{ uri: imgUrl }} style={styles.mediaContain} resizeMode="contain" />
            </>
          ) : (
            <MaterialCommunityIcons name="image-off-outline" size={48} color={COLORS.text2} />
          )}
        </View>

        {/* Right-side action rail — absolute, thumb-reachable */}
        <View style={[styles.actionRail, { bottom: screenHeight * 0.25 }]}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleLike(item)}>
            <MaterialCommunityIcons
              name={likedIds.has(item.id) ? 'heart' : 'heart-outline'}
              size={28}
              color={likedIds.has(item.id) ? COLORS.coral : COLORS.white}
            />
          </TouchableOpacity>
          {!isOwnProduct && (
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleOpenComments(item)}>
              <MaterialCommunityIcons name="comment-outline" size={28} color={COLORS.white} />
              {(item.review_count || 0) > 0 && (
                <Text style={styles.actionCount}>{item.review_count}</Text>
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleBookmark(item)}>
            <MaterialCommunityIcons
              name={wishlistedIds.has(item.id) ? 'bookmark' : 'bookmark-outline'}
              size={28}
              color={wishlistedIds.has(item.id) ? COLORS.coral : COLORS.white}
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setMoreProduct(item)}>
            <MaterialCommunityIcons name="dots-horizontal" size={28} color={COLORS.white} />
          </TouchableOpacity>
        </View>

        {/* Bottom gradient — real fade from transparent to dark */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.92)']}
          style={styles.bottomGradient}
        />

        {/* Bottom overlay — caption + actions, sits ON TOP of image */}
        <View style={[styles.bottomOverlay, { paddingBottom: Math.max(90, insets.bottom + 80) }]}>
          {/* Seller chip + follow */}
          <View style={styles.sellerRow}>
            <TouchableOpacity
              style={styles.sellerChip}
              onPress={() => item.seller && nav.navigate('Storefront', { sellerId: item.seller_id })}
            >
              <UserAvatar seller={item.seller} />
              <Text style={styles.sellerName} numberOfLines={1}>{getDisplayName(item.seller)}</Text>
            </TouchableOpacity>
            {!isOwnProduct && (
              <TouchableOpacity
                style={[styles.followBtn, isFollowing && styles.followBtnActive]}
                onPress={() => item.seller_id && handleFollow(item.seller_id)}
              >
                <Text style={[styles.followBtnText, isFollowing && styles.followBtnTextActive]}>
                  {isFollowing ? t('storefront.following') : t('feed.follow')}
                </Text>
              </TouchableOpacity>
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
          <Text style={styles.productInfo}>{typeof item.category === 'string' ? item.category : item.category?.name || 'Port-au-Prince'} - {stockLabel}</Text>

          {/* Buy / Cart buttons */}
          <BuyRow product={item} navigation={nav} />
        </View>
      </View>
    );
  };

  if (screenHeight === 0) {
    return (
      <View style={styles.container} onLayout={onContainerLayout}>
        <ActivityIndicator color={COLORS.coral} style={{ flex: 1 }} />
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
          >
            <Text style={[styles.feedTabText, feedTab === 'new' && styles.feedTabTextActive]}>New</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.feedTab, feedTab === 'forYou' && styles.feedTabActive]}
            onPress={() => { setFeedTab('forYou'); setPage(1); setProducts([]); }}
          >
            <Text style={[styles.feedTabText, feedTab === 'forYou' && styles.feedTabTextActive]}>For You</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.utilityRow}>
          <TouchableOpacity
            style={styles.utilityBtn}
            activeOpacity={0.82}
            onPress={() => nav.navigate('Inbox', { returnTab: 'FeedTab' })}
          >
            <MaterialCommunityIcons name="message-text-outline" size={35} color={COLORS.white} />
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
              <View style={styles.emptyIcon}>
                <MaterialCommunityIcons name="fire" size={36} color={COLORS.text2} />
              </View>
              <Text style={styles.emptyText}>{t('feed.noProducts')}</Text>
              <Text style={styles.emptyHint}>{t('feed.checkBack')}</Text>
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
              <TouchableOpacity style={styles.sheetIconBtn} onPress={() => setCommentProduct(null)}>
                <MaterialCommunityIcons name="close" size={20} color={COLORS.text2} />
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
                      <UserAvatar name={item.reviewer?.full_name || 'B'} />
                    <View style={styles.commentBody}>
                      <View style={styles.commentNameRow}>
                        <Text style={styles.commentName}>{item.reviewer?.full_name || 'Buyer'}</Text>
                        <View style={styles.commentStars}>
                          <MaterialCommunityIcons name="star" size={11} color={COLORS.yellow} />
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
              >
                <MaterialCommunityIcons name="message-outline" size={17} color={COLORS.white} />
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
          />
          <View style={styles.moreSheet}>
            <View style={styles.sheetHandle} />
            <TouchableOpacity style={styles.moreItem} onPress={() => {
              if (moreProduct) trackFeedEvent(moreProduct.id, 'relevant');
              setMoreProduct(null);
            }}>
              <MaterialCommunityIcons name="thumb-up-outline" size={18} color={COLORS.text} />
              <Text style={styles.moreItemText}>Relevant</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.moreItem} onPress={() => {
              if (moreProduct) trackFeedEvent(moreProduct.id, 'not_relevant');
              setMoreProduct(null);
            }}>
              <MaterialCommunityIcons name="thumb-down-outline" size={18} color={COLORS.text} />
              <Text style={styles.moreItemText}>Not relevant</Text>
            </TouchableOpacity>
            <View style={styles.moreDivider} />
            <TouchableOpacity style={styles.moreItem} onPress={() => { setMoreProduct(null); }}>
              <MaterialCommunityIcons name="share-variant-outline" size={18} color={COLORS.text} />
              <Text style={styles.moreItemText}>Share</Text>
            </TouchableOpacity>
            <View style={styles.moreDivider} />
            <TouchableOpacity style={styles.moreItem} onPress={() => { setMoreProduct(null); }}>
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
    justifyContent: 'center',
    alignItems: 'center',
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
    width: 48,
    height: 48,
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
    paddingRight: 80,
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
  followBtn: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: RADIUS.media,
    borderWidth: 1,
    borderColor: COLORS.coral,
  },
  followBtnActive: {
    backgroundColor: COLORS.coral,
    borderColor: COLORS.coral,
  },
  followBtnText: {
    fontSize: 12,
    color: COLORS.coral,
    fontWeight: '700',
    flexShrink: 1,
  },
  followBtnTextActive: {
    color: COLORS.white,
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
  productInfo: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 12,
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
    width: 34,
    height: 34,
    borderRadius: 17,
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
    backgroundColor: 'rgba(255,255,255,0.1)',
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