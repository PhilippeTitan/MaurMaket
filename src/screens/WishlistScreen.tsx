import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING, RADIUS } from '../theme';
import { useTranslation } from '../i18n';
import { getWishlist, toggleWishlist } from '../api';
import { store } from '../store';
import { useToast } from '../components/Toast';
import type { Product } from '../types';
import type { RootStackParamList } from '../navigation';
import ScreenHeader from '../components/ScreenHeader';
import EmptyState from '../components/EmptyState';
import { RowListSkeleton } from '../components/Skeleton';
import MasonryGrid from '../components/MasonryGrid';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const WISHLIST_CACHE_TTL = 60_000;
let _wishlistCache: { data: any; timestamp: number } | null = null;

export default function WishlistScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const toast = useToast();
  const [items, setItems] = useState<Product[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (force = false) => {
    if (!force && _wishlistCache && Date.now() - _wishlistCache.timestamp < WISHLIST_CACHE_TTL) {
      setItems(_wishlistCache.data.items);
      setLoading(false);
      return;
    }
    try {
      const res = await getWishlist() as { items: Product[] };
      const list = res.items || [];
      setItems(list);
      _wishlistCache = { timestamp: Date.now(), data: { items: list } };
    } catch { Alert.alert(t('common.error'), t('wishlist.loadFailed')); }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData(true);
    setRefreshing(false);
  }, []);

  const handleRemove = async (productId: string) => {
    const previousItems = items;
    setItems(prev => prev.filter(i => i.id !== productId));
    try {
      await toggleWishlist(productId);
    } catch {
      setItems(previousItems);
      Alert.alert(t('common.error'), t('wishlist.removeFailed'));
    }
  };

  const renderWishlistOverlay = useCallback((item: Product) => (
    <>
      {/* Remove from wishlist — top left */}
      <TouchableOpacity
        style={styles.removeBtn}
        onPress={() => handleRemove(item.id)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="remove from wishlist"
        accessibilityRole="button"
      >
        <MaterialCommunityIcons name="heart" size={18} color={COLORS.coral} />
      </TouchableOpacity>
      {/* Add to cart — bottom right */}
      <TouchableOpacity
        style={styles.cartBtn}
        onPress={async () => {
          const result = await store.addToCart({
            id: item.id,
            name: item.name,
            price: item.price,
            effective_price: item.effective_price,
            is_on_sale: item.is_on_sale,
            discount_pct: item.discount_pct,
            quantity: 1,
            images: item.images,
            seller_id: item.seller_id,
            seller_name: item.seller?.full_name,
            store_name: item.seller?.store_name,
            stock: item.stock ?? 0,
          } as any);
          if (result.added) {
            toast.success('Added to cart', `${item.name} added.`);
          } else if (result.reason === 'out-of-stock') {
            toast.warning('Out of stock', 'This item is no longer available.');
          } else if (result.reason === 'max-stock') {
            toast.info('Max quantity', 'You already have the maximum quantity in your cart.');
          } else if (result.reason === 'own-product') {
            toast.warning('Your product', "You can't add your own product to cart.");
          }
        }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="add to cart"
        accessibilityRole="button"
      >
        <MaterialCommunityIcons name="cart-plus" size={18} color={COLORS.blue} />
      </TouchableOpacity>
    </>
  ), [handleRemove, toast]);

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('wishlist.title')} onBack={() => nav.goBack()} />
      {loading ? (
        <RowListSkeleton count={6} thumbSize={56} />
      ) : items.length === 0 && !refreshing ? (
        <EmptyState icon="heart-outline" title={t('wishlist.empty')} size={56} />
      ) : (
        <MasonryGrid
          products={items}
          standalone={false}
          contentFit="cover"
          columnGap={3}
          sidePad={0}
          renderCardOverlay={renderWishlistOverlay}
          onPress={(item) => nav.navigate('ProductDetail', { productId: item.id })}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.coral} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  masonryGrid: { flexDirection: 'row', gap: 3, paddingTop: SPACING.sm },
  masonryCol: { flex: 1, gap: 3 },
  card: {
    borderRadius: RADIUS.row, overflow: 'hidden',
    backgroundColor: COLORS.surface2,
  },
  cardImgWrap: {
    width: '100%', backgroundColor: COLORS.surface2, position: 'relative',
  },
  cardPlaceholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.surface2,
  },
  cardPriceTop: {
    position: 'absolute', top: 6, right: 6, zIndex: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  cardStockBadge: {
    position: 'absolute', bottom: 6, left: 6, zIndex: 6,
  },
  removeBtn: {
    position: 'absolute', top: 6, left: 6, zIndex: 6,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10,
    width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
  },
  cartBtn: {
    position: 'absolute', bottom: 6, right: 6, zIndex: 6,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10,
    width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
  },
  imgDots: {
    position: 'absolute', bottom: 8, alignSelf: 'center', zIndex: 6,
    flexDirection: 'row', gap: 4,
  },
  imgDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  imgDotActive: { backgroundColor: COLORS.white, width: 8, height: 8, borderRadius: 4 },
  cardName: { fontSize: 13, color: COLORS.text, fontWeight: '600', marginTop: 4, marginBottom: 2, paddingHorizontal: 2 },
});
