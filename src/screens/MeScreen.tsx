import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl, useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING, getDisplayName } from '../theme';
import { useTranslation } from '../i18n';
import { store } from '../store';
import {
  getOrders, getSellerOrders, getSellerAnalytics, getWishlist,
  getSellerProducts, getFollowerCount, getFollowing, getImageUrl, getSellerReviews, getLowStockProducts,
} from '../api';
import type { RootStackParamList } from '../navigation';
import type { Product, Order, Review } from '../types';

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
  const user = store.user;
  const isSeller = store.isSeller;

  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('listings');

  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [orderCount, setOrderCount] = useState(0);
  const [sellingOrderCount, setSellingOrderCount] = useState(0);
  const [productCount, setProductCount] = useState(0);
  const [rating, setRating] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);

  const [toPay, setToPay] = useState(0);
  const [toShip, setToShip] = useState(0);
  const [toReceive, setToReceive] = useState(0);
  const [toReview, setToReview] = useState(0);
  const [hasOrders, setHasOrders] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [wishlist, setWishlist] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [analyticsData, setAnalyticsData] = useState<SellerAnalyticsResponse | null>(null);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [imageSizes, setImageSizes] = useState<Record<string, { w: number; h: number }>>({});
  const { width: SCREEN_W } = useWindowDimensions();
  const CARD_W = (SCREEN_W - SPACING.md * 2 - 6) / 2;
  const DEFAULT_IMG_H = Math.round(CARD_W * 1.25);
  const MIN_IMG_H = CARD_W * 0.6;

  const initials = getDisplayName(user).split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  const memberSince = user?.created_at
    ? `${t('me.since')} ${new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
    : '';

  const avatarUrl = getImageUrl(user?.avatar_url);

  const fetchData = useCallback(async () => {
    try {
      const [ordersRes, buyerOrdersRes] = await Promise.all([
        isSeller
          ? getSellerOrders().catch(() => ({ orders: [] })) as Promise<{ orders: Order[] }>
          : Promise.resolve({ orders: [] }),
        getOrders() as Promise<{ buyerOrders: Order[]; sellerOrders: Order[] }>,
      ]);

      const allBuyerOrders = buyerOrdersRes.buyerOrders || [];
      setOrderCount(allBuyerOrders.length);
      setSellingOrderCount((ordersRes as { orders?: Order[] }).orders?.length || 0);

      const pending = allBuyerOrders.filter((o: Order) => o.status === 'pending').length;
      const paid = allBuyerOrders.filter((o: Order) => o.status === 'paid').length;
      const shipped = allBuyerOrders.filter((o: Order) => o.status === 'shipped').length;
      const delivered = allBuyerOrders.filter((o: Order) => o.status === 'delivered').length;
      setToPay(pending);
      setToShip(paid);
      setToReceive(shipped);
      setToReview(delivered);
      setHasOrders(allBuyerOrders.length > 0);

      if (isSeller) {
        let sellerProds: { products: Product[] } | null = null;
        try { sellerProds = await getSellerProducts() as { products: Product[] }; } catch { /* ignore */ }
        const fetched = sellerProds?.products || [];
        setProducts(fetched);
        setProductCount(fetched.length || 0);
        fetched.forEach((p: Product) => {
          const img = p.images?.find(i => i.is_primary) || p.images?.[0];
          if (img?.image_url) {
            Image.getSize(getImageUrl(img.image_url) || '', (w, h) => {
              setImageSizes(prev => ({ ...prev, [p.id]: { w, h } }));
            }, () => {});
          }
        });

        if (user?.seller_tier !== 'casual') {
          try {
            const analytics = await getSellerAnalytics() as SellerAnalyticsResponse;
            const overview = analytics.overview || analytics;
            setRating(Number(overview.avg_rating || 0));
            setReviewCount(Number(overview.review_count || 0));
            setAnalyticsData(analytics);
          } catch { /* ignore */ }
        }
      }

      let followerRes: { count: number } | null = null;
      try { followerRes = await getFollowerCount(user?.id || '') as { count: number }; } catch { /* ignore */ }
      setFollowerCount(followerRes?.count || 0);

      let followingRes: { sellers?: unknown[] } | null = null;
      try { followingRes = await getFollowing() as { sellers?: unknown[] }; } catch { /* ignore */ }
      setFollowingCount(followingRes?.sellers?.length || 0);

      let wishlistRes: { items: Product[] } | null = null;
      try { wishlistRes = await getWishlist() as { items: Product[] }; } catch { /* ignore */ }
      setWishlist(wishlistRes?.items || []);

      if (isSeller && user?.id) {
        let reviewRes: { reviews: Review[] } | null = null;
        try { reviewRes = await getSellerReviews(user.id) as { reviews: Review[] }; } catch { /* ignore */ }
        setReviews(reviewRes?.reviews || []);

        try {
          const lowStockRes = await getLowStockProducts() as { products?: Product[] };
          setLowStockProducts(lowStockRes.products || []);
        } catch { /* ignore */ }
      }
    } catch { /* silent */ }
  }, [isSeller, user?.id]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  useEffect(() => {
    const unsub = store.onChange(() => {
      fetchData();
    });
    return unsub;
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const renderGridItem = (item: Product) => {
    const img = item.images?.find(i => i.is_primary) || item.images?.[0];
    const imgUrl = getImageUrl(img?.image_url);
    const isOwnProduct = isSeller && user?.id === item.seller_id;
    const size = imageSizes[item.id];
    const cardH = size && size.w > 0 ? Math.max(MIN_IMG_H, Math.round(CARD_W * size.h / size.w)) : DEFAULT_IMG_H;
    return (
      <TouchableOpacity
        key={item.id}
        style={styles.card}
        activeOpacity={0.82}
        onPress={() => isOwnProduct
          ? nav.navigate('EditListing', { productId: item.id })
          : nav.navigate('ProductDetail', { productId: item.id })
        }
      >
        <View style={[styles.cardImgWrap, { height: cardH }]}>
          {imgUrl ? (
            <Image source={{ uri: imgUrl }} style={styles.cardImg} resizeMode="cover" />
          ) : (
            <View style={styles.cardPlaceholder}>
              <MaterialCommunityIcons name="image-off-outline" size={20} color={COLORS.text2} />
            </View>
          )}
          <View style={styles.cardOverlay}>
            <View style={styles.cardOverlayTop}>
              <View style={styles.priceBadge}>
                <Text style={styles.priceBadgeText}>Rs {item.price.toLocaleString()}</Text>
              </View>
            </View>
            <View style={styles.cardOverlayBottom}>
              <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
            </View>
          </View>
          {isOwnProduct && (
            <View style={styles.editBadge}>
              <MaterialCommunityIcons name="pencil" size={10} color={COLORS.white} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const ORDER_STATUS_COLORS = [COLORS.coral, COLORS.blue, COLORS.green, COLORS.yellow];

  const renderOrderStatusCard = (label: string, count: number, iconName: string, colorIndex: number) => {
    const cardColor = ORDER_STATUS_COLORS[colorIndex];
    return (
      <TouchableOpacity
        key={label}
        style={styles.orderCard}
        onPress={() => nav.navigate('Orders')}
      >
        {count > 0 && (
          <View style={[styles.orderBadge, { backgroundColor: cardColor }]}>
            <Text style={styles.orderBadgeText}>{count}</Text>
          </View>
        )}
        <MaterialCommunityIcons name={iconName as any} size={22} color={cardColor} />
        <Text style={styles.orderLabel}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.coral} />
      }
    >
      {/* Hero */}
      <View style={[styles.hero, { paddingTop: insets.top }]}>
        {/* Top bar: centered name + settings */}
        <View style={styles.topBar}>
          <View style={styles.topBarNameWrap}>
            <Text style={styles.topBarName} numberOfLines={1}>{getDisplayName(user)}</Text>
            {isSeller && (user?.seller_tier === 'verified' || user?.seller_tier === 'business') && (
              <MaterialCommunityIcons name="shield-check" size={16} color={COLORS.blue} />
            )}
          </View>
          <TouchableOpacity style={styles.settingsBtn} onPress={() => nav.navigate('Settings')}>
            <MaterialCommunityIcons name="cog-outline" size={24} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        {/* Avatar + Stats row */}
        <View style={styles.avatarRow}>
          <View style={styles.avatar}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarText}>{initials}</Text>
            )}
          </View>
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

        {/* Bio + tier badges */}
        <View style={styles.nameBioBlock}>
          {(isSeller && (user?.seller_tier === 'verified' || user?.seller_tier === 'business')) && (
            <View style={styles.nameRow}>
              {isSeller && user?.seller_tier === 'verified' && (
                <TouchableOpacity onPress={() => nav.navigate('Settings')} style={styles.tierBadge}>
                  <Text style={styles.tierBadgeText}>Go Business</Text>
                </TouchableOpacity>
              )}
              {isSeller && user?.seller_tier === 'business' && (
                <TouchableOpacity style={[styles.tierBadge, { backgroundColor: COLORS.coral + '20' }]}>
                  <Text style={[styles.tierBadgeText, { color: COLORS.coral }]}>Business</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {user?.bio ? (
            <Text style={styles.bio} numberOfLines={2}>{user.bio}</Text>
          ) : null}
          {memberSince ? <Text style={styles.memberSince}>{memberSince}</Text> : null}
        </View>
      </View>

      {/* Become a Seller CTA for buyers */}
      {!isSeller && (
        <TouchableOpacity
          style={styles.sellBanner}
          onPress={() => nav.navigate('SellerOnboarding')}
        >
          <MaterialCommunityIcons name="store-plus-outline" size={20} color={COLORS.green} />
          <View style={{ flex: 1 }}>
            <Text style={styles.sellTitle}>{t('me.startSelling')}</Text>
            <Text style={styles.sellHint}>List your first product in seconds</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.green} />
        </TouchableOpacity>
      )}

      {isSeller && user && (
        <View style={styles.sellerActions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => nav.navigate('Settings')}
          >
            <MaterialCommunityIcons name="pencil-outline" size={16} color={COLORS.text} />
            <Text style={[styles.actionBtnText, { color: COLORS.text }]}>{t('me.editProfile')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => nav.navigate('AddListing')}
          >
            <MaterialCommunityIcons name="plus" size={16} color={COLORS.text} />
            <Text style={[styles.actionBtnText, { color: COLORS.text }]}>{t('me.listings')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Seller Analytics Dashboard */}
      {isSeller && analyticsData && user?.seller_tier !== 'casual' && (
        <View style={styles.analyticsCard}>
          <View style={styles.analyticsHeader}>
            <MaterialCommunityIcons name="chart-line" size={16} color={COLORS.blue} />
            <Text style={styles.analyticsTitle}>{t('me.analytics')}</Text>
          </View>
          <View style={styles.analyticsGrid}>
            <View style={styles.analyticsStat}>
              <Text style={styles.analyticsStatValue}>
                Rs {Number(analyticsData.overview?.total_revenue || 0).toLocaleString()}
              </Text>
              <Text style={styles.analyticsStatLabel}>{t('me.totalRevenue')}</Text>
            </View>
            <View style={styles.analyticsStat}>
              <Text style={styles.analyticsStatValue}>{Number(analyticsData.overview?.total_orders || 0)}</Text>
              <Text style={styles.analyticsStatLabel}>{t('me.totalOrders')}</Text>
            </View>
            <View style={styles.analyticsStat}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <MaterialCommunityIcons name="star" size={12} color={COLORS.yellow} />
                <Text style={styles.analyticsStatValue}>{Number(analyticsData.overview?.avg_rating || 0).toFixed(1)}</Text>
              </View>
              <Text style={styles.analyticsStatLabel}>{t('me.avgRating')}</Text>
            </View>
          </View>
          {analyticsData.topProducts && analyticsData.topProducts.length > 0 && (
            <View style={styles.topProductsSection}>
              <Text style={styles.topProductsTitle}>{t('me.topProducts')}</Text>
              {analyticsData.topProducts.slice(0, 3).map(tp => (
                <TouchableOpacity
                  key={tp.id}
                  style={styles.topProductRow}
                  onPress={() => nav.navigate('EditListing', { productId: tp.id })}
                >
                  <View style={styles.topProductInfo}>
                    <Text style={styles.topProductName} numberOfLines={1}>{tp.name}</Text>
                    <Text style={styles.topProductMeta}>{tp.units_sold} sold · Rs {tp.revenue.toLocaleString()}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={16} color={COLORS.text2} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Low Stock Alert */}
      {isSeller && lowStockProducts.length > 0 && (
        <View style={styles.lowStockBanner}>
          <View style={styles.lowStockHeader}>
            <MaterialCommunityIcons name="alert-circle-outline" size={18} color={COLORS.yellow} />
            <Text style={styles.lowStockTitle}>Low Stock Alert</Text>
          </View>
          <Text style={styles.lowStockHint}>
            {lowStockProducts.length} {lowStockProducts.length === 1 ? 'product has' : 'products have'} 3 or fewer items left.
          </Text>
          {lowStockProducts.slice(0, 2).map(p => (
            <TouchableOpacity
              key={p.id}
              style={styles.lowStockItem}
              onPress={() => nav.navigate('EditListing', { productId: p.id })}
            >
              <Text style={styles.lowStockItemName} numberOfLines={1}>{p.name}</Text>
              <Text style={styles.lowStockItemStock}>{p.stock} left</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Order Status Bar */}
      {hasOrders && (
        <View style={styles.orderBar}>
          {renderOrderStatusCard(t('me.toPay'), toPay, 'credit-card-outline', 0)}
          {renderOrderStatusCard(t('me.toShip'), toShip, 'truck-delivery-outline', 1)}
          {renderOrderStatusCard(t('me.toReceive'), toReceive, 'package-variant-closed', 2)}
          {renderOrderStatusCard(t('me.toReview'), toReview, 'star-outline', 3)}
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'listings' && styles.tabActive]}
          onPress={() => setActiveTab('listings')}
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
        >
          <MaterialCommunityIcons
            name="star-outline"
            size={22}
            color={activeTab === 'reviews' ? COLORS.text : COLORS.text2}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'saved' && styles.tabActive]}
          onPress={() => setActiveTab('saved')}
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
            products.length > 0 ? (
              <View style={styles.grid}>
                {products.map(renderGridItem)}
              </View>
            ) : (
              <View style={styles.empty}>
                <MaterialCommunityIcons name="storefront-outline" size={32} color={COLORS.text2} />
                <Text style={styles.emptyText}>{t('me.noListings')}</Text>
                <Text style={styles.emptyHint}>Add your first product so buyers have something to open from your shop.</Text>
                <TouchableOpacity style={styles.emptyAction} onPress={() => nav.navigate('AddListing')}>
                  <MaterialCommunityIcons name="plus" size={16} color={COLORS.white} />
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingBottom: 100 },

  /* Hero */
  hero: { backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingBottom: SPACING.md },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, position: 'relative',
  },
  topBarNameWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '75%' },
  topBarName: { fontSize: 15, color: COLORS.text, fontWeight: '700' },
  avatarRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingTop: SPACING.md, gap: 0,
  },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.coral, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 80, height: 80, borderRadius: 40 },
  avatarText: { fontSize: 28, color: COLORS.white, fontWeight: '700' },
  settingsBtn: { position: 'absolute', right: SPACING.md, top: SPACING.sm - 4, padding: 6 },
  nameBioBlock: { paddingHorizontal: SPACING.md, marginTop: 10 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bio: { fontSize: 13, color: COLORS.text2, lineHeight: 18, marginTop: 2 },
  memberSince: { fontSize: 11, color: COLORS.text2, opacity: 0.7, marginTop: 2 },

  /* Stats */
  statsRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', paddingVertical: 6 },
  statNum: { fontSize: 17, color: COLORS.text, fontWeight: '800', lineHeight: 20 },
  statLabel: { fontSize: 11, color: COLORS.text2, marginTop: 2 },

  /* Order Status Bar */
  orderBar: {
    flexDirection: 'row', marginHorizontal: SPACING.md, marginTop: SPACING.md, gap: 6,
  },
  orderCard: {
    flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10,
    backgroundColor: COLORS.surface, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    position: 'relative',
  },
  orderBadge: {
    position: 'absolute', top: -4, right: -4,
    minWidth: 18, height: 18, borderRadius: 9,
    paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center',
  },
  orderBadgeText: { fontSize: 9, fontWeight: '700', color: COLORS.white },
  orderLabel: { fontSize: 10, color: COLORS.text2, fontWeight: '500', textAlign: 'center' },

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

  /* Tab Content */
  tabContent: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: SPACING.md },
  card: {
    width: '48%' as any, borderRadius: 10, overflow: 'hidden',
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
  cardOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between', padding: 8,
  },
  cardOverlayTop: { alignItems: 'flex-end' },
  cardOverlayBottom: {
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 8, padding: 8, gap: 2,
  },
  priceBadge: {
    backgroundColor: COLORS.coral, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
  },
  priceBadgeText: { color: COLORS.white, fontSize: 11, fontWeight: '700' },
  cardName: { fontSize: 12, fontWeight: '600', color: '#fff', lineHeight: 16 },
  editBadge: {
    position: 'absolute', bottom: 4, right: 4,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: COLORS.coral, alignItems: 'center', justifyContent: 'center',
  },

  /* Empty */
  empty: { alignItems: 'center', paddingVertical: 40, gap: 6 },
  emptyText: { fontSize: 14, color: COLORS.text2, fontWeight: '600' },
  emptyHint: { fontSize: 12, color: COLORS.text2, opacity: 0.7, textAlign: 'center', paddingHorizontal: 20 },

  /* Reviews */
  reviewCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, padding: 12,
  },

  /* Become a Seller Banner */
  sellBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: SPACING.md, marginTop: SPACING.md, padding: 12,
    backgroundColor: COLORS.green + '10', borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.green + '30',
  },
  sellTitle: { fontSize: 13, fontWeight: '700', color: COLORS.green },
  sellHint: { fontSize: 11, color: COLORS.text2, marginTop: 1 },

  /* Tier Badge (inline chip) */
  tierBadge: {
    backgroundColor: COLORS.green + '20',
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  tierBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.green },

  /* Seller Actions Bar */
  sellerActions: {
    flexDirection: 'row', gap: 8,
    marginHorizontal: SPACING.md, marginTop: SPACING.md,
  },
  actionBtn: {
    flex: 1, minHeight: 40, borderRadius: 10,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
  },
  actionBtnText: { fontSize: 12, fontWeight: '700' },
  emptyAction: {
    marginTop: 8, minHeight: 38, paddingHorizontal: 14, borderRadius: 10,
    backgroundColor: COLORS.coral, flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  emptyActionText: { fontSize: 12, color: COLORS.white, fontWeight: '800' },

  /* Analytics Dashboard */
  analyticsCard: {
    marginHorizontal: SPACING.md, marginTop: SPACING.md, padding: 12,
    backgroundColor: COLORS.surface, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  analyticsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  analyticsTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  analyticsGrid: { flexDirection: 'row', gap: 8 },
  analyticsStat: {
    flex: 1, alignItems: 'center', paddingVertical: 8,
    backgroundColor: COLORS.surface2, borderRadius: 8,
  },
  analyticsStatValue: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  analyticsStatLabel: { fontSize: 10, color: COLORS.text2, marginTop: 2 },
  topProductsSection: { marginTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10 },
  topProductsTitle: { fontSize: 12, fontWeight: '700', color: COLORS.text2, marginBottom: 6 },
  topProductRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  topProductInfo: { flex: 1 },
  topProductName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  topProductMeta: { fontSize: 11, color: COLORS.text2, marginTop: 2 },

  /* Low Stock Alert */
  lowStockBanner: {
    marginHorizontal: SPACING.md, marginTop: SPACING.md, padding: 12,
    backgroundColor: COLORS.yellow + '10', borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.yellow + '30',
  },
  lowStockHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  lowStockTitle: { fontSize: 14, fontWeight: '700', color: COLORS.yellow },
  lowStockHint: { fontSize: 12, color: COLORS.text2, marginBottom: 8 },
  lowStockItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  lowStockItemName: { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.text },
  lowStockItemStock: { fontSize: 12, fontWeight: '700', color: COLORS.coral },
});
