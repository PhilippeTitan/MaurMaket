import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, useWindowDimensions,
} from 'react-native';
import { Icon } from '../components/icons/Icon';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, getDisplayName, getSellerAvatar } from '../theme';
import { getSellerProfile, getSellerReviews, toggleFollow, getFollowerCount, getImageUrl, createConversation, getConversations } from '../api';
import { store } from '../store';
import { useTranslation } from '../i18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EmptyState from '../components/EmptyState';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation';
import type { Product, Review, SellerProfile } from '../types';
import SalePriceTag from '../components/SalePriceTag';
import { useToast } from '../components/Toast';
import StockBadge from '../components/StockBadge';
import UserAvatar from '../components/UserAvatar';
import BackButton from '../components/BackButton';

type Props = NativeStackScreenProps<RootStackParamList, 'Storefront'>;
type Tab = 'listings' | 'reviews';

const STOREFRONT_CACHE_TTL = 60_000;
let _storefrontCache: Record<string, { data: any; timestamp: number }> = {};

export default function StorefrontScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const GRID_GAP = 3;
  const CARD_W = (SCREEN_W - GRID_GAP) / 2;
  const DEFAULT_IMG_H = Math.round(CARD_W * 1.25);
  const MIN_H = CARD_W * 0.6;
  const MAX_H = SCREEN_H * 0.52;

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
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [messageLoading, setMessageLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('listings');
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [imageSizes, setImageSizes] = useState<Record<string, { w: number; h: number }>>({});
  const [listingImageIndices, setListingImageIndices] = useState<Record<string, number>>({});
  const mountedRef = useRef(true);
  const [storeTick, setStoreTick] = useState(0);
  const listRef = useRef<FlatList>(null);

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
      setFollowerCount(d.followerCount);
      setFollowingCount(d.followingCount);
      setLoading(false);
      return;
    }
    try {
      const [sellerRes, prodRes, revRes, followingRes] = await Promise.all([
        getSellerProfile(sellerId) as Promise<{ seller: SellerProfile }>,
        import('../api').then(m => m.getProducts({ seller: sellerId, limit: '50' })) as Promise<{ products: Product[] }>,
        getSellerReviews(sellerId) as Promise<{ reviews: Review[] }>,
        store.isLoggedIn ? import('../api').then(m => m.getFollowing()) as Promise<{ following?: Array<{ seller_id?: string; id?: string }> }> : Promise.resolve({ following: [] }),
      ]);
      const seller = sellerRes.seller;
      const products = prodRes.products || [];
      const reviews = (revRes.reviews || []).map((r: any) => ({
        ...r,
        reviewer: r.reviewer || {
          full_name: r.reviewer_name,
          avatar_url: r.reviewer_avatar,
          username: r.reviewer_username,
        },
      }));
      const followIds = (followingRes.following || []).map(f => f.seller_id || f.id).filter(Boolean) as string[];
      store.setFollowingList(followIds);
      setSeller(seller);
      setProducts(products);
      setReviews(reviews);

      products.forEach((p: Product) => {
        const url = getImageUrl(p.images?.find(i => i.is_primary)?.image_url || p.images?.[0]?.image_url);
        if (!url) return;
        Image.getSize(url, (w, h) => {
          if (mountedRef.current) setImageSizes(prev => ({ ...prev, [p.id]: { w, h } }));
        }, () => {});
      });
      const countRes = await getFollowerCount(sellerId) as { count: number };
      setFollowerCount(countRes.count || 0);
      let fcing = 0;
      try {
        const fRes = await import('../api').then(m => m.getFollowing()) as { following?: unknown[] };
        fcing = fRes?.following?.length || 0;
      } catch {}
      setFollowingCount(fcing);
      _storefrontCache[sellerId] = { timestamp: Date.now(), data: { seller, products, reviews, followerCount: countRes.count || 0, followingCount: fcing } };
    } catch { toast.error('Seller profile could not load', 'Check your connection and try again.', () => fetchSellerData(true)); }
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
        });
      } else {
        const productContext = products[0];
        const res = await createConversation({ sellerId, productId: productContext?.id }) as { conversationId: string };
        navigation.navigate('Chat', {
          conversationId: res.conversationId,
          otherUserName: getDisplayName(seller) || 'Seller',
          otherUserId: sellerId,
          otherUserAvatar: getSellerAvatar(seller),
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed';
      toast.error('Could not open messages', msg, handleMessage);
    }
    setMessageLoading(false);
  };

  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : '0';

  const memberSince = (seller as any)?.created_at
    ? new Date((seller as any).created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '';

  const tier = seller?.seller_tier || 'casual';
  const isBusinessMode = tier === 'business' && seller?.use_store_identity;
  const displayName = isBusinessMode ? seller?.store_name || getDisplayName(seller) : getDisplayName(seller);
  const locationCity = (seller as any)?.location_city || '';

  const ratingBuckets = [5, 4, 3, 2, 1].map(s => ({
    star: s,
    count: reviews.filter(r => r.rating === s).length,
    pct: reviews.length > 0 ? (reviews.filter(r => r.rating === s).length / reviews.length) * 100 : 0,
  }));

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
      heights[target] += getCardHeight(item) + GRID_GAP;
    }
    return cols;
  })();

  const renderGridItem = ({ item }: { item: Product }) => {
    const imgFailed = failedImages.has(item.id);
    const cardH = getCardHeight(item);
    const images = item.images && item.images.length > 0
      ? item.images
      : [{ id: 'empty', image_url: '', is_primary: true, display_order: 0 }];
    const hasMore = images.length > 1;
    const primaryUrl = getImageUrl(images.find(i => i.is_primary)?.image_url || images[0]?.image_url);
    const openProduct = () => navigation.navigate('ProductDetail', { productId: item.id });
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
                      onPress={openProduct}
                      style={{ width: CARD_W, height: cardH }}
                      accessibilityRole="button"
                      accessibilityLabel={item.name}
                    >
                      {url ? (
                        <Image source={{ uri: url }} style={styles.cardImg} resizeMode="contain" onError={() => setFailedImages(prev => new Set(prev).add(item.id))} />
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
                onPress={openProduct}
                style={StyleSheet.absoluteFill}
                accessibilityRole="button"
                accessibilityLabel={item.name}
              >
                <Image source={{ uri: primaryUrl }} style={styles.cardImg} resizeMode="contain" onError={() => setFailedImages(prev => new Set(prev).add(item.id))} />
              </TouchableOpacity>
            ) : (
              <View style={styles.cardPlaceholder}>
                <Icon name="image-unavailable" size={20} color={COLORS.text2} />
              </View>
            )}
            {hasMore && (
              <View style={styles.imgDots} pointerEvents="none">
                {images.map((_, index) => (
                  <View key={index} style={[styles.imgDot, index === (listingImageIndices[item.id] || 0) && styles.imgDotActive]} />
                ))}
              </View>
            )}
            {/* Price — top right */}
            <View style={styles.cardPriceTop} pointerEvents="none">
              <SalePriceTag price={item.price ?? 0} effectivePrice={item.effective_price ?? item.price ?? 0} isOnSale={item.is_on_sale || false} discountPct={item.discount_pct || 0} size="sm" />
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

  if (loading && !seller) {
    return (
      <View style={styles.loadingContainer}>
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
                  style={{ position: 'absolute', left: SPACING.lg, top: insets.top + SPACING.sm, zIndex: 20 }}
                />

                <View style={styles.topBarNameWrap}>
                  <Text style={styles.topBarName} numberOfLines={1}>@{seller?.username || 'seller'}</Text>
                  {(tier === 'verified' || tier === 'business') && (
                    <Icon name="verified" size={18} color={tier === 'business' ? COLORS.coral : COLORS.blue} />
                  )}
                </View>
              </View>

              {/* Avatar + Stats row */}
              <View style={[styles.avatarRow, { paddingTop: insets.top + 60 }]}>
                <UserAvatar seller={seller} size={76} animated={true} />

                <View style={styles.statsRow}>
                  <View style={styles.stat}>
                    <Text style={styles.statNum}>{products.length}</Text>
                    <Text style={styles.statLabel}>{t('storefront.products')}</Text>
                  </View>
                  <TouchableOpacity style={styles.stat} onPress={() => navigation.navigate('FollowList', { userId: sellerId, kind: 'followers', title: t('storefront.followers') })}>
                    <Text style={styles.statNum}>{followerCount}</Text>
                    <Text style={styles.statLabel}>{t('storefront.followers')}</Text>
                  </TouchableOpacity>
                  <View style={styles.stat}>
                    <Text style={styles.statNum}>{avgRating}</Text>
                    <Text style={styles.statLabel}>{t('storefront.rating')}</Text>
                  </View>
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
                  <Text style={styles.trustLineText}>Operated by <Text style={{ color: COLORS.text, fontWeight: '700' }}>@{seller.username}</Text> · Verified identity on file</Text>
                </View>
              )}

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
                      <Text style={styles.ratingBarLabel}>{star}</Text>
                      <View style={styles.ratingBarTrack}>
                        <View style={[styles.ratingBarFill, { width: `${pct}%` }]} />
                      </View>
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
            ) : activeTab === 'listings' && products.length > 0 ? (
              <View style={styles.masonryGrid}>
                <View style={styles.masonryCol}>
                  {leftCol.map(item => <View key={item.id}>{renderGridItem({ item })}</View>)}
                </View>
                <View style={styles.masonryCol}>
                  {rightCol.map(item => <View key={item.id}>{renderGridItem({ item })}</View>)}
                </View>
              </View>
            ) : null}
          </View>
        }
        renderItem={activeTab === 'listings' ? renderGridItem : (({ item }: { item: Review }) => (
          <View style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
              <View style={styles.reviewAvatar}>
                <Text style={styles.reviewAvatarText}>{(item.reviewer?.username || 'A').charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.reviewInfo}>
                <Text style={styles.reviewName} numberOfLines={1}>{item.reviewer?.username ? `@${item.reviewer.username}` : 'Anonymous'}</Text>
                <View style={styles.reviewStars}>
                  {[1, 2, 3, 4, 5].map(s => (
                    <Icon key={s} name={s <= item.rating ? 'rating' : 'rate-this'} size={11} color={s <= item.rating ? COLORS.yellow : COLORS.text2} />
                  ))}
                </View>
              </View>
              <Text style={styles.reviewDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
            </View>
            {item.comment && <Text style={styles.reviewComment}>{item.comment}</Text>}
            {item.seller_response && (
              <View style={styles.sellerResponse}>
                <Text style={styles.sellerResponseLabel}>Seller reply:</Text>
                <Text style={styles.sellerResponseText}>{item.seller_response}</Text>
              </View>
            )}
          </View>
        )) as any}
        ListEmptyComponent={
          (activeTab === 'listings' && products.length === 0) || (activeTab === 'reviews' && reviews.length === 0) ? (
            <EmptyState
              icon={activeTab === 'listings' ? 'storefront-outline' : 'star-outline'}
              title={activeTab === 'listings' ? t('storefront.noProducts') : 'No reviews yet'}
            />
          ) : null
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await fetchSellerData(true); setRefreshing(false); }} tintColor={COLORS.coral} />}
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm,
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
  },
  topBarNameWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  topBarName: { fontSize: 20, fontWeight: '800', color: COLORS.text },

  /* Hero */
  hero: { backgroundColor: COLORS.surface, paddingBottom: SPACING.lg },

  avatarRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingTop: 60,
  },

  statsRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 18, fontWeight: '800', color: COLORS.text, lineHeight: 22 },
  statLabel: { fontSize: 11, color: COLORS.text2, marginTop: 2 },

  nameBioBlock: { paddingHorizontal: SPACING.lg, paddingTop: 12 },
  displayName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
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
  },
  tabActive: { borderBottomColor: COLORS.text },

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
  ratingBarLabel: { fontSize: 10, color: COLORS.text2, width: 6 },
  ratingBarTrack: { flex: 1, height: 5, borderRadius: 99, backgroundColor: COLORS.surface2, overflow: 'hidden' },
  ratingBarFill: { height: '100%', backgroundColor: COLORS.yellow, borderRadius: 99 },

  /* Grid */
  masonryGrid: { flexDirection: 'row', gap: 3 },
  masonryCol: { flex: 1, gap: 3 },
  card: {
    borderRadius: RADIUS.row, overflow: 'hidden',
    backgroundColor: COLORS.surface2, marginBottom: 3,
  },
  cardImgWrap: {
    width: '100%', backgroundColor: COLORS.surface2, position: 'relative',
  },
  cardImg: { width: '100%', height: '100%' },
  cardPlaceholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.surface2,
  },
  cardPriceTop: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  cardStockBadge: {
    position: 'absolute', bottom: 6, left: 6,
  },
  cardName: {
    fontSize: 12.5, fontWeight: '600', color: COLORS.text,
    paddingHorizontal: 6, paddingTop: 5, paddingBottom: 2,
  },
  imgDots: {
    position: 'absolute', bottom: 8, alignSelf: 'center',
    flexDirection: 'row', gap: 4,
  },
  imgDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.7)' },
  imgDotActive: { width: 14, backgroundColor: COLORS.white },

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
  reviewComment: { fontSize: 13, color: COLORS.text2, lineHeight: 18 },
  sellerResponse: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  sellerResponseLabel: { fontSize: 11, color: COLORS.blue, fontWeight: '600', marginBottom: 3 },
  sellerResponseText: { fontSize: 12, color: COLORS.text2, lineHeight: 18 },

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
