import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, useWindowDimensions, TouchableOpacity,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING, RADIUS, formatPrice } from '../theme';
import { useTranslation } from '../i18n';
import { getSellerAnalytics, getOrders, getSellerOrders, getLowStockProducts } from '../api';
import type { RootStackParamList } from '../navigation';
import type { Order, Product } from '../types';
import { Icon } from '../components/icons/Icon';
import StockBadge from '../components/StockBadge';
import BackButton from '../components/BackButton';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type AnalyticsData = {
  overview?: {
    avg_rating?: string | number;
    product_count?: string | number;
    review_count?: string | number;
    total_orders?: string | number;
    total_revenue?: string | number;
    follower_count?: string | number;
  };
  topProducts?: Array<{
    id: string;
    name: string;
    price: number;
    stock: number;
    units_sold: number;
    revenue: number;
  }>;
};

const ORDER_TABS = [
  { key: 'toPay', label: 'To Pay', icon: 'credit-card-outline', color: COLORS.coral },
  { key: 'toShip', label: 'To Ship', icon: 'truck-delivery-outline', color: COLORS.blue },
  { key: 'toReceive', label: 'To Receive', icon: 'package-variant-closed', color: COLORS.green },
  { key: 'toReview', label: 'To Review', icon: 'star-outline', color: COLORS.yellow },
] as const;

export default function AnalyticsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const { width: SCREEN_W } = useWindowDimensions();

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Order status
  const [toPay, setToPay] = useState(0);
  const [toShip, setToShip] = useState(0);
  const [toReceive, setToReceive] = useState(0);
  const [toReview, setToReview] = useState(0);

  // Low stock
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);

  const fetchData = useCallback(async (force = false) => {
    if (!force && data) { setLoading(false); return; }
    try {
      const [analyticsRes, buyerOrdersRes, sellerOrdersRes, lowStockRes] = await Promise.all([
        getSellerAnalytics() as Promise<AnalyticsData>,
        getOrders() as Promise<{ buyerOrders: Order[] }>,
        getSellerOrders().catch(() => ({ orders: [] })) as Promise<{ orders: Order[] }>,
        getLowStockProducts().catch(() => ({ products: [] })) as Promise<{ products: Product[] }>,
      ]);

      setData(analyticsRes);

      // Compute order status from buyer orders
      const buyerOrders = buyerOrdersRes.buyerOrders || [];
      setToPay(buyerOrders.filter((o: Order) => o.status === 'pending').length);
      setToShip(buyerOrders.filter((o: Order) => o.status === 'paid').length);
      setToReceive(buyerOrders.filter((o: Order) => o.status === 'shipped').length);
      setToReview(buyerOrders.filter((o: Order) => o.status === 'delivered').length);

      setLowStockProducts(lowStockRes.products || []);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(true); }, [fetchData]));

  const overview = data?.overview || {};
  const totalRevenue = Number(overview.total_revenue || 0);
  const totalOrders = Number(overview.total_orders || 0);
  const avgRating = Number(overview.avg_rating || 0);
  const reviewCount = Number(overview.review_count || 0);
  const productCount = Number(overview.product_count || 0);
  const followerCount = Number(overview.follower_count || 0);
  const topProducts = data?.topProducts || [];

  const orderCounts = [toPay, toShip, toReceive, toReview];
  const hasAnyOrders = orderCounts.some(c => c > 0);
  const hasAnyData = totalOrders > 0 || topProducts.length > 0;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.skeletonCard} />
        <View style={styles.skeletonCard} />
        <View style={styles.skeletonCard} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Sticky header */}
      <View style={[styles.topBar, { paddingTop: insets.top + SPACING.sm, paddingBottom: SPACING.sm, zIndex: 10 }]}>
        <BackButton
          onPress={() => nav.goBack()}
          style={{ position: 'absolute', left: SPACING.lg, top: insets.top + SPACING.sm }}
        />
        <Text style={styles.topBarTitle}>Dashboard</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: 0, paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await fetchData(true); setRefreshing(false); }} tintColor={COLORS.coral} />}
      >
        {/* Section 1: Overview Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.statsGrid}>
            {[
              { label: 'Revenue', value: `${formatPrice(totalRevenue)} G`, icon: 'cash', color: COLORS.green },
              { label: 'Orders', value: String(totalOrders), icon: 'package-variant-closed', color: COLORS.blue },
              { label: 'Rating', value: avgRating > 0 ? avgRating.toFixed(1) : '—', icon: 'star', color: COLORS.yellow },
              { label: 'Reviews', value: String(reviewCount), icon: 'comment-text-outline', color: COLORS.coral },
              { label: 'Products', value: String(productCount), icon: 'storefront-outline', color: COLORS.blue },
              { label: 'Followers', value: String(followerCount), icon: 'heart-outline', color: COLORS.coral },
            ].map((s) => (
              <View key={s.label} style={[styles.statCard, { width: (SCREEN_W - SPACING.lg * 2 - SPACING.sm) / 2 }]}>
                <View style={[styles.statIconWrap, { backgroundColor: s.color + '18' }]}>
                  <MaterialCommunityIcons name={s.icon as any} size={18} color={s.color} />
                </View>
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Section 2: Order Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Orders</Text>
          {hasAnyOrders ? (
            <View style={styles.orderGrid}>
              {ORDER_TABS.map((tab, i) => (
                <TouchableOpacity
                  key={tab.key}
                  style={styles.orderCard}
                  onPress={() => nav.navigate('Orders')}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${tab.label}, ${orderCounts[i]} items`}
                >
                  {orderCounts[i] > 0 && (
                    <View style={[styles.orderBadge, { backgroundColor: tab.color }]}>
                      <Text style={styles.orderBadgeText}>{orderCounts[i]}</Text>
                    </View>
                  )}
                  <View style={[styles.orderIconWrap, { backgroundColor: tab.color + '18' }]}>
                    <MaterialCommunityIcons name={tab.icon as any} size={20} color={tab.color} />
                  </View>
                  <Text style={styles.orderLabel}>{tab.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.emptySection}>
              <MaterialCommunityIcons name="receipt" size={28} color={COLORS.text2} />
              <Text style={styles.emptyText}>No pending orders</Text>
            </View>
          )}
        </View>

        {/* Section 3: Low Stock Alert */}
        {lowStockProducts.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Low Stock</Text>
              <View style={styles.lowStockCount}>
                <MaterialCommunityIcons name="alert-circle-outline" size={14} color={COLORS.yellow} />
                <Text style={styles.lowStockCountText}>{lowStockProducts.length}</Text>
              </View>
            </View>
            <View style={styles.lowStockList}>
              {lowStockProducts.slice(0, 5).map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.lowStockItem}
                  onPress={() => nav.navigate('EditListing', { productId: p.id })}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`edit ${p.name}, ${p.stock} left`}
                >
                  <View style={styles.lowStockInfo}>
                    <Text style={styles.lowStockName} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.lowStockMeta}>{formatPrice(p.price)} G</Text>
                  </View>
                  <StockBadge stock={p.stock} size="sm" />
                  <Icon name="chevron-right" size={14} color={COLORS.text2} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Section 4: Top Products */}
        {topProducts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top Products</Text>
            {topProducts.slice(0, 5).map((tp, i) => (
              <TouchableOpacity
                key={tp.id}
                style={styles.productRow}
                onPress={() => nav.navigate('EditListing', { productId: tp.id })}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`edit ${tp.name}`}
              >
                <View style={styles.productRank}>
                  <Text style={styles.productRankText}>{i + 1}</Text>
                </View>
                <View style={styles.productInfo}>
                  <Text style={styles.productName} numberOfLines={1}>{tp.name}</Text>
                  <Text style={styles.productMeta}>{tp.units_sold} sold · {formatPrice(tp.revenue)} G revenue</Text>
                </View>
                <View style={styles.productStock}>
                  <StockBadge stock={tp.stock} size="sm" />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Empty state */}
        {!hasAnyData && lowStockProducts.length === 0 && (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="chart-line" size={40} color={COLORS.text2} />
            <Text style={styles.emptyText}>No data yet</Text>
            <Text style={styles.emptyHint}>Your dashboard will come alive once you get your first order.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loadingContainer: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 60, paddingHorizontal: SPACING.lg, gap: 12 },
  skeletonCard: { height: 100, borderRadius: RADIUS.card, backgroundColor: COLORS.surface2 },
  content: {},

  /* Top bar */
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm,
    position: 'relative',
  },
  topBarTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text },

  /* Sections */
  section: {
    marginHorizontal: SPACING.lg, marginTop: SPACING.lg,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },

  /* Stats grid */
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm,
  },
  statCard: {
    padding: SPACING.md, borderRadius: RADIUS.card,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    gap: 6,
  },
  statIconWrap: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  statValue: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  statLabel: { fontSize: 12, color: COLORS.text2 },

  /* Order status */
  orderGrid: {
    flexDirection: 'row', gap: SPACING.sm,
  },
  orderCard: {
    flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.card, borderWidth: 1, borderColor: COLORS.border,
    position: 'relative',
  },
  orderIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  orderBadge: {
    position: 'absolute', top: -4, right: -4,
    minWidth: 18, height: 18, borderRadius: 9,
    paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center',
  },
  orderBadgeText: { fontSize: 9, fontWeight: '700', color: COLORS.white },
  orderLabel: { fontSize: 10, color: COLORS.text2, fontWeight: '600', textAlign: 'center' },

  /* Low stock */
  lowStockCount: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: COLORS.yellow + '20', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2,
  },
  lowStockCountText: { fontSize: 11, fontWeight: '700', color: COLORS.yellow },
  lowStockList: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.card, borderWidth: 1, borderColor: COLORS.border,
    overflow: 'hidden',
  },
  lowStockItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: SPACING.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  lowStockInfo: { flex: 1 },
  lowStockName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  lowStockMeta: { fontSize: 11, color: COLORS.text2, marginTop: 2 },

  /* Product rows */
  productRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: SPACING.md, borderRadius: RADIUS.card,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  productRank: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center',
  },
  productRankText: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  productInfo: { flex: 1 },
  productName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  productMeta: { fontSize: 12, color: COLORS.text2, marginTop: 2 },
  productStock: { marginLeft: 4 },

  /* Empty */
  empty: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptySection: { alignItems: 'center', paddingVertical: 24, gap: 6 },
  emptyText: { fontSize: 14, color: COLORS.text2, fontWeight: '600' },
  emptyHint: { fontSize: 13, color: COLORS.text2, opacity: 0.7, textAlign: 'center', paddingHorizontal: 40 },
});
