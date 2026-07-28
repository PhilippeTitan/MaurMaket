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
import { getSellerAnalytics } from '../api';
import type { RootStackParamList } from '../navigation';
import { Icon } from '../components/icons/Icon';

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
  recentOrders?: Array<{
    id: string;
    total_amount: number;
    status: string;
    created_at: string;
  }>;
};

export default function AnalyticsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const { width: SCREEN_W } = useWindowDimensions();

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (force = false) => {
    if (!force && data) { setLoading(false); return; }
    try {
      const res = await getSellerAnalytics() as AnalyticsData;
      setData(res);
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

  const stats = [
    { label: 'Revenue', value: `${formatPrice(totalRevenue)} G`, icon: 'cash', color: COLORS.green },
    { label: 'Orders', value: String(totalOrders), icon: 'package-variant-closed', color: COLORS.blue },
    { label: 'Rating', value: avgRating.toFixed(1), icon: 'star', color: COLORS.yellow },
    { label: 'Reviews', value: String(reviewCount), icon: 'comment-text-outline', color: COLORS.coral },
    { label: 'Products', value: String(productCount), icon: 'storefront-outline', color: COLORS.blue },
    { label: 'Followers', value: String(followerCount), icon: 'heart-outline', color: COLORS.coral },
  ];

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
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await fetchData(true); setRefreshing(false); }} tintColor={COLORS.coral} />}
      >
        {/* Top bar */}
        <View style={[styles.topBar, { paddingTop: insets.top + SPACING.sm }]}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => nav.goBack()}
            activeOpacity={0.7}
            accessibilityLabel="go back"
            accessibilityRole="button"
          >
            <Icon name="back" size={20} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Analytics</Text>
        </View>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          {stats.map((s, i) => (
            <View key={s.label} style={[styles.statCard, { width: (SCREEN_W - SPACING.lg * 2 - SPACING.sm) / 2 }]}>
              <MaterialCommunityIcons name={s.icon as any} size={20} color={s.color} />
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Top Products */}
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
                  <Text style={styles.productMeta}>{tp.units_sold} sold · {formatPrice(tp.revenue)} G</Text>
                </View>
                <Icon name="chevron-right" size={16} color={COLORS.text2} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {topProducts.length === 0 && totalOrders === 0 && (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="chart-line" size={40} color={COLORS.text2} />
            <Text style={styles.emptyText}>No data yet</Text>
            <Text style={styles.emptyHint}>Analytics will appear once you get your first order.</Text>
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
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface2,
    alignItems: 'center', justifyContent: 'center',
    position: 'absolute', left: SPACING.lg,
  },
  topBarTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text },

  /* Stats grid */
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm,
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg,
  },
  statCard: {
    padding: SPACING.md, borderRadius: RADIUS.card,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    gap: 6,
  },
  statValue: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  statLabel: { fontSize: 12, color: COLORS.text2 },

  /* Sections */
  section: {
    marginHorizontal: SPACING.lg, marginTop: SPACING.lg,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },

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

  /* Empty */
  empty: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { fontSize: 16, color: COLORS.text2, fontWeight: '600' },
  emptyHint: { fontSize: 13, color: COLORS.text2, opacity: 0.7, textAlign: 'center', paddingHorizontal: 40 },
});
