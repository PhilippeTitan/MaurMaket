import React, { useState, useCallback } from 'react';
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
import UserAvatar from '../components/UserAvatar';
import StockBadge from '../components/StockBadge';

type Props = NativeStackScreenProps<RootStackParamList, 'Storefront'>;
type Tab = 'listings' | 'reviews';

const STOREFRONT_CACHE_TTL = 60_000;
let _storefrontCache: Record<string, { data: any; timestamp: number }> = {};

const TIER_COLORS: Record<string, string> = {
  casual: COLORS.yellow,
  verified: COLORS.green,
  business: COLORS.coral,
};

export default function StorefrontScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width: SCREEN_W } = useWindowDimensions();
  const CARD_W = (SCREEN_W - SPACING.md * 2 - 6) / 2;
  const DEFAULT_IMG_H = Math.round(CARD_W * 1.25);

  const { sellerId } = route.params;
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [messageLoading, setMessageLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('listings');
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const isOwnProfile = store.user?.id === sellerId;

  const fetchSellerData = useCallback(async (force = false) => {
    if (!force && _storefrontCache[sellerId] && Date.now() - _storefrontCache[sellerId].timestamp < STOREFRONT_CACHE_TTL) {
      const d = _storefrontCache[sellerId].data;
      setSeller(d.seller);
      setProducts(d.products);
      setReviews(d.reviews);
      setFollowing(d.following);
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
      const followIds = (followingRes.following || []).map(f => f.seller_id || f.id).filter(Boolean);
      const isFollowing = followIds.includes(sellerId);
      setSeller(seller);
      setProducts(products);
      setReviews(reviews);
      setFollowing(isFollowing);
      const countRes = await getFollowerCount(sellerId) as { count: number };
      setFollowerCount(countRes.count || 0);
      let fcing = 0;
      try {
        const fRes = await import('../api').then(m => m.getFollowing()) as { following?: unknown[] };
        fcing = fRes?.following?.length || 0;
      } catch {}
      setFollowingCount(fcing);
      _storefrontCache[sellerId] = { timestamp: Date.now(), data: { seller, products, reviews, following: isFollowing, followerCount: countRes.count || 0, followingCount: fcing } };
    } catch { toast.error('Seller profile could not load', 'Check your connection and try again.', () => fetchSellerData(true)); }
    setLoading(false);
  }, [sellerId]);

  useFocusEffect(useCallback(() => { fetchSellerData(); }, [fetchSellerData]));

  const handleFollow = async () => {
    if (followLoading) return;
    const wasFollowing = following;
    const previousCount = followerCount;
    setFollowLoading(true);
    setFollowing(!wasFollowing);
    setFollowerCount(prev => Math.max(0, prev + (wasFollowing ? -1 : 1)));
    try {
      const res = await toggleFollow(sellerId) as { following: boolean };
      setFollowing(res.following);
      setFollowerCount(Math.max(0, previousCount + (res.following ? 1 : 0) - (wasFollowing ? 1 : 0)));
    } catch {
      setFollowing(wasFollowing);
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
  const tierColor = TIER_COLORS[tier] || COLORS.yellow;
  const isBusinessMode = tier === 'business' && seller?.use_store_identity;
  const displayName = isBusinessMode ? seller?.store_name || getDisplayName(seller) : getDisplayName(seller);
  const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
  const avatarUrl = getImageUrl(getSellerAvatar(seller));
  const locationCity = (seller as any)?.location_city || '';

  const renderGridItem = ({ item }: { item: Product }) => {
    const imgFailed = failedImages.has(item.id);
    const images = item.images && item.images.length > 0
      ? item.images
      : [{ id: 'empty', image_url: '', is_primary: true, display_order: 0 }];
    return (
      <TouchableOpacity
        key={item.id}
        style={styles.card}
        activeOpacity={0.82}
        onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
        accessibilityRole="button"
        accessibilityLabel={item.name}
      >
        <View style={[styles.cardImgWrap, { height: DEFAULT_IMG_H }]}>
          <FlatList
            data={images}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(img, idx) => String(img.id || idx)}
            renderItem={({ item: img }) => {
              const url = getImageUrl(img.image_url);
              return (
                <View style={{ width: CARD_W, height: DEFAULT_IMG_H }}>
                  {url && !imgFailed ? (
                    <Image
                      source={{ uri: url }}
                      style={styles.cardImg}
                      resizeMode="cover"
                      onError={() => setFailedImages(prev => new Set(prev).add(item.id))}
                    />
                  ) : (
                    <View style={styles.cardPlaceholder}>
                      <Icon name="image-unavailable" size={20} color={COLORS.text2} />
                    </View>
                  )}
                </View>
              );
            }}
          />
          <View style={styles.stockBadgePos}>
            <StockBadge stock={item.stock} size="sm" />
          </View>
          <View style={styles.priceBadgePos}>
            <View style={styles.priceBadgeBg}>
              <SalePriceTag price={item.price ?? 0} effectivePrice={item.effective_price ?? item.price ?? 0} isOnSale={item.is_on_sale || false} discountPct={item.discount_pct || 0} size="sm" />
            </View>
          </View>
          <View style={styles.cardGradient} />
          <View style={styles.cardBottomInfo}>
            <UserAvatar seller={item.seller} size={28} />
            <View style={{ flex: 1, marginLeft: 6 }}>
              <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
              {item.description ? (
                <Text style={styles.cardDesc} numberOfLines={1}>{item.description}</Text>
              ) : null}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
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
        data={(activeTab === 'listings' ? products : reviews) as any}
        numColumns={activeTab === 'listings' ? 2 : 1}
        columnWrapperStyle={activeTab === 'listings' ? styles.row : undefined}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
        keyExtractor={item => item.id}
        ListHeaderComponent={
          <View>
            {/* Hero */}
            <View style={[styles.hero, { paddingTop: insets.top }]}>
              {/* Top bar: back + centered name */}
              <View style={styles.topBar}>
                <TouchableOpacity
                  style={[styles.backBtn, { top: insets.top + SPACING.sm }]}
                  onPress={() => navigation.goBack()}
                  activeOpacity={0.7}
                  accessibilityLabel="go back"
                  accessibilityRole="button"
                >
                  <Icon name="back" size={22} color={COLORS.text} />
                </TouchableOpacity>
                <View style={styles.topBarNameWrap}>
                  <Text style={styles.topBarName} numberOfLines={1}>{displayName}</Text>
                  {(tier === 'verified' || tier === 'business') && (
                    <Icon name="verified" size={15} color={tier === 'business' ? COLORS.coral : COLORS.blue} />
                  )}
                </View>
              </View>

              {/* Avatar with TierRing + Stats row */}
              <View style={styles.avatarRow}>
                <View style={[styles.tierRing, { borderColor: tierColor, borderWidth: tierColor === 'transparent' ? 0 : 3 }]}>
                  <View style={[styles.avatar, { borderRadius: isBusinessMode ? 22 : 40 }]}>
                    {avatarUrl ? (
                      <Image source={{ uri: avatarUrl }} style={[styles.avatarImg, { borderRadius: isBusinessMode ? 20 : 40 }]} accessibilityLabel="seller avatar" />
                    ) : (
                      <Text style={styles.avatarText}>{initials}</Text>
                    )}
                  </View>
                </View>
                <View style={styles.statsRow}>
                  <View style={styles.stat}>
                    <Text style={styles.statNum}>{products.length}</Text>
                    <Text style={styles.statLabel}>Posts</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statNum}>{followerCount}</Text>
                    <Text style={styles.statLabel}>{t('me.followers')}</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statNum}>{avgRating}</Text>
                    <Text style={styles.statLabel}>Rating</Text>
                  </View>
                </View>
              </View>

              {/* Trust-preserving line for business mode */}
              {isBusinessMode && seller?.username && (
                <View style={styles.trustLine}>
                  <Icon name="verified" size={12} color={COLORS.green} />
                  <Text style={styles.trustLineText}>Operated by <Text style={{ color: COLORS.text, fontWeight: '700' }}>@{seller.username}</Text> · Verified identity on file</Text>
                </View>
              )}

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

              {/* Bio + member since + optional real name reveal */}
              <View style={styles.nameBioBlock}>
                {seller?.bio ? (
                  <Text style={styles.bio} numberOfLines={2}>{seller.bio}</Text>
                ) : null}
                {seller?.show_real_name && seller?.full_name && !isBusinessMode && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
                    <Icon name="verified" size={11} color={COLORS.green} />
                    <Text style={{ fontSize: 12, color: COLORS.text }}>{seller.full_name}</Text>
                  </View>
                )}
                {memberSince ? <Text style={styles.memberSince}>{t('me.since')} {memberSince}</Text> : null}
              </View>
            </View>

            {/* Follow + Message buttons */}
            {store.isLoggedIn && !isOwnProfile && (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.followBtn, following && styles.followBtnActive, followLoading && styles.actionDisabled]}
                  onPress={handleFollow}
                  disabled={followLoading}
                  activeOpacity={0.7}
                  accessibilityLabel={following ? 'unfollow seller' : 'follow seller'}
                  accessibilityRole="button"
                >
                  {followLoading ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <>
                      <MaterialCommunityIcons name={following ? 'heart' : 'heart-outline'} size={18} color={following ? COLORS.white : COLORS.coral} />
                      <Text style={[styles.followBtnText, following && styles.followBtnTextActive]}>
                        {following ? t('storefront.following') : t('storefront.follow')}
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
                      <Icon name="message" size={18} color={COLORS.blue} />
                      <Text style={styles.msgBtnText}>{t('storefront.message')}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
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
          </View>
        }
        renderItem={activeTab === 'listings' ? renderGridItem : (({ item }: { item: Review }) => (
          <View style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
              <View style={styles.reviewAvatar}>
                <Text style={styles.reviewAvatarText}>{(item.reviewer?.full_name || 'A').charAt(0)}</Text>
              </View>
              <View style={styles.reviewInfo}>
                <Text style={styles.reviewName} numberOfLines={1}>{item.reviewer?.username ? `@${item.reviewer.username}` : (item.reviewer?.full_name || 'Anonymous')}</Text>
                <View style={styles.reviewStars}>
                  {[1, 2, 3, 4, 5].map(s => (
                    <Icon key={s} name={s <= item.rating ? 'rating' : 'rate-this'} size={12} color={s <= item.rating ? COLORS.yellow : COLORS.text2} />
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
          <EmptyState
            icon={activeTab === 'listings' ? 'storefront-outline' : 'rating'}
            title={activeTab === 'listings' ? t('storefront.noProducts') : 'No reviews yet'}
          />
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await fetchSellerData(true); setRefreshing(false); }} tintColor={COLORS.coral} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loadingContainer: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 60, paddingHorizontal: SPACING.md },
  content: { paddingBottom: 100 },

  /* Hero */
  hero: { backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingBottom: SPACING.md },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, position: 'relative',
  },
  topBarNameWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '75%' },
  topBarName: { fontSize: 15, color: COLORS.text, fontWeight: '700' },
  backBtn: {
    position: 'absolute', left: SPACING.md,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.surface + 'CC',
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4,
    zIndex: 10,
  },

  avatarRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingTop: SPACING.md, gap: 0,
  },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.coral, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 64, height: 64, borderRadius: 32 },
  avatarText: { fontSize: 24, color: COLORS.white, fontWeight: '700' },
  tierRing: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center' },

  nameBioBlock: { paddingHorizontal: SPACING.md, marginTop: 10 },
  bio: { fontSize: 13, color: COLORS.text2, lineHeight: 18, marginTop: 2 },
  memberSince: { fontSize: 11, color: COLORS.text2, opacity: 0.7, marginTop: 2 },

  trustLine: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: SPACING.md, paddingTop: 10,
  },
  trustLineText: { fontSize: 11.5, color: COLORS.text2 },

  /* Trust Chips */
  trustChipsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    paddingHorizontal: SPACING.md, paddingTop: 10,
  },
  trustChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6,
    borderWidth: 1,
  },
  trustChipText: { fontSize: 12, fontWeight: '700' },

  /* Stats */
  statsRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', paddingVertical: 6 },
  statNum: { fontSize: 17, color: COLORS.text, fontWeight: '800', lineHeight: 20 },
  statLabel: { fontSize: 11, color: COLORS.text2, marginTop: 2 },

  /* Action Buttons */
  actionRow: { flexDirection: 'row', gap: 8, marginHorizontal: SPACING.md, marginTop: SPACING.md },

  followBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: RADIUS.button,
    backgroundColor: COLORS.coral, minHeight: 44,
  },
  followBtnActive: { backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.coral },
  followBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 14 },
  followBtnTextActive: { color: COLORS.coral },
  actionDisabled: { opacity: 0.55 },

  msgBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: RADIUS.button,
    borderWidth: 1.5, borderColor: COLORS.blue, minHeight: 44,
  },
  msgBtnText: { color: COLORS.blue, fontWeight: '700', fontSize: 14 },

  /* Tabs */
  tabBar: {
    flexDirection: 'row', marginTop: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  tab: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderBottomWidth: 1.5, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: COLORS.text },

  /* Grid */
  row: { justifyContent: 'space-between', paddingHorizontal: SPACING.sm },
  card: {
    width: '48%' as any, borderRadius: RADIUS.row, overflow: 'hidden',
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
  stockBadgePos: { position: 'absolute', top: 6, left: 6 },
  priceBadgePos: { position: 'absolute', top: 6, right: 6 },
  priceBadgeBg: {
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: RADIUS.row,
    paddingHorizontal: 6, paddingVertical: 3,
  },
  cardGradient: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: '55%',
    backgroundColor: 'transparent',
  },
  cardBottomInfo: {
    position: 'absolute', bottom: 6, left: 6, right: 6,
    flexDirection: 'row', alignItems: 'center',
  },
  cardName: { fontSize: 12, fontWeight: '600', color: COLORS.white, lineHeight: 16 },
  cardDesc: { fontSize: 10, color: 'rgba(255,255,255,0.75)', lineHeight: 13 },

  /* Reviews */
  reviewCard: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.sm, padding: SPACING.md,
    borderRadius: RADIUS.card, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: SPACING.sm },
  reviewAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.coral, justifyContent: 'center', alignItems: 'center' },
  reviewAvatarText: { color: COLORS.white, fontSize: 14, fontWeight: '700' },
  reviewInfo: { flex: 1 },
  reviewName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  reviewStars: { flexDirection: 'row', gap: 2, marginTop: 2 },
  reviewDate: { fontSize: 11, color: COLORS.text2 },
  reviewComment: { fontSize: 13, color: COLORS.text2, lineHeight: 18 },
  sellerResponse: { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: COLORS.border },
  sellerResponseLabel: { fontSize: 11, color: COLORS.blue, fontWeight: '600' },
  sellerResponseText: { fontSize: 12, color: COLORS.text2, marginTop: 2 },

  /* Skeleton */
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  skeletonAvatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.surface2 },
  skeletonLine80: { width: '80%', height: 16, borderRadius: 4, backgroundColor: COLORS.surface2 },
  skeletonLine50: { width: '50%', height: 12, borderRadius: 4, backgroundColor: COLORS.surface2 },
  skeletonLine20: { width: 120, height: 20, borderRadius: 4, backgroundColor: COLORS.surface2, marginTop: 12 },
  skeletonLine14: { width: 80, height: 14, borderRadius: 4, backgroundColor: COLORS.surface2, marginTop: 8 },
  skeletonRow2: { flexDirection: 'row', gap: 8, marginTop: 20 },
});
