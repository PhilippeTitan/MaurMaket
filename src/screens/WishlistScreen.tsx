import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert, ActivityIndicator, Image,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Icon } from '../components/icons/Icon';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING, RADIUS } from '../theme';
import { useTranslation } from '../i18n';
import { getWishlist, toggleWishlist, getImageUrl } from '../api';
import { store } from '../store';
import { useToast } from '../components/Toast';
import type { Product } from '../types';
import type { RootStackParamList } from '../navigation';
import ScreenHeader from '../components/ScreenHeader';
import EmptyState from '../components/EmptyState';
import { RowListSkeleton } from '../components/Skeleton';
import SalePriceTag from '../components/SalePriceTag';
import StockBadge from '../components/StockBadge';

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
      const items = res.items || [];
      setItems(items);
      _wishlistCache = { timestamp: Date.now(), data: { items } };
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

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('wishlist.title')} onBack={() => nav.goBack()} />
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const img = item.images?.find(i => i.is_primary) || item.images?.[0];
          const imgUrl = getImageUrl(img?.image_url);
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => nav.navigate('ProductDetail', { productId: item.id })}
              accessibilityLabel={item.name}
              accessibilityRole="button"
            >
              {imgUrl ? (
                <Image source={{ uri: imgUrl }} style={styles.thumb} resizeMode="cover" />
              ) : (
                <View style={styles.thumbPlaceholder}>
                  <Icon name="image-unavailable" size={20} color={COLORS.text2} />
                </View>
              )}
              <View style={styles.rowLeft}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <SalePriceTag price={item.price} effectivePrice={item.effective_price ?? item.price} isOnSale={item.is_on_sale || false} discountPct={item.discount_pct || 0} size="md" />
                {item.stock !== undefined && item.stock !== null && (
                  <StockBadge stock={item.stock} size="sm" />
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity
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
                <TouchableOpacity onPress={() => handleRemove(item.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="remove from wishlist" accessibilityRole="button">
                  <MaterialCommunityIcons name="heart-off" size={18} color={COLORS.coral} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.coral} />}
        ListEmptyComponent={
          loading ? (
            <RowListSkeleton count={6} thumbSize={56} />
          ) : !refreshing ? (
            <EmptyState icon="heart-outline" title={t('wishlist.empty')} size={56} />
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  row: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 12 },
  thumb: { width: 48, height: 48, borderRadius: RADIUS.row, backgroundColor: COLORS.surface2 },
  thumbPlaceholder: { width: 48, height: 48, borderRadius: RADIUS.row, backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center' },
  rowLeft: { flex: 1, gap: 2 },
  name: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  price: { fontSize: 12, color: COLORS.coral, fontWeight: '700' },
  stock: { fontSize: 11, color: COLORS.text2 },
});